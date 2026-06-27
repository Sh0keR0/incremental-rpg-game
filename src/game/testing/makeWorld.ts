import { Combat } from '../components/Combat.ts';
import { Player, type PlayerState } from '../components/Player.ts';
import { PlayerStats, type PlayerStatsState } from '../components/PlayerStats.ts';
import { Stages } from '../components/Stages.ts';
import { STAGES } from '../content/stages.ts';
import { type Enemy, instantiateEnemy } from '../content/enemies.ts';
import { GameCore } from '../GameCore.ts';
import { expForLevel } from '../systems/progression.ts';
import type {
  ComponentClass,
  GameCommandMap,
  GameCommandName,
  GameEventMap,
  GameEventName,
  IGameComponent,
  StatName,
} from '../types.ts';

// A real-component test world. Unlike makeTestContext (which fakes the context
// and stubs siblings), this wires up real GameCore components and seeds their
// state. Queries hit the real getGameComponent; events really cascade. Use it
// when a component reads from or reacts to siblings — seed the inputs you care
// about instead of stubbing methods.

interface CapturedEvent<NameType extends GameEventName = GameEventName> {
  name: NameType;
  payload: GameEventMap[NameType];
}

// Per-component seeds: a partial of each component's state, merged onto its
// real default. Specify only what the test depends on (e.g. attack, strength).
export interface WorldSeed {
  player?: Partial<PlayerState>;
  stats?: Partial<Record<StatName, number>> & { unspentPoints?: number };
  combat?: { enemy?: Enemy; isBoss?: boolean };
  // Stage progress. `bossUnlocked` makes the current stage's boss fightable, so
  // a `fightBoss` command really drives Stages to emit `bossStarted`.
  stages?: { currentStageId?: string; bossUnlocked?: boolean };
}

export interface WorldOptions {
  // The dependency closure to build. Defaults to the combat-relevant set; pass
  // your own to widen (full game) or narrow (fewer cross-talk listeners).
  components?: ComponentClass[];
  rng?: () => number;
  seed?: WorldSeed;
}

export interface World {
  getComponent<T extends IGameComponent>(componentClass: ComponentClass<T>): T;
  // Every event emitted, in true cascade order (parent before children).
  events: CapturedEvent[];
  clearEvents(): void;
  // Enqueue a command and drain it (commands batch to the next tick).
  enqueue<K extends GameCommandName>(name: K, payload: GameCommandMap[K]): void;
  // Advance the world by deltaMs: drain queued commands, then run onTick.
  tick(deltaMs?: number): void;
}

const DEFAULT_COMPONENTS: ComponentClass[] = [Player, PlayerStats, Stages, Combat];

function playerSeed(overrides: Partial<PlayerState> = {}): PlayerState {
  return { level: 1, exp: 0, expToNext: expForLevel(1), attack: 5, ...overrides };
}

function statsSeed(overrides: WorldSeed['stats'] = {}): PlayerStatsState {
  return {
    unspentPoints: overrides.unspentPoints ?? 0,
    stats: {
      strength: overrides.strength ?? 0,
      agility: overrides.agility ?? 0,
      endurance: overrides.endurance ?? 0,
    },
  };
}

function combatSeed(overrides: WorldSeed['combat'] = {}): { enemy: Enemy; isBoss: boolean } {
  const enemy =
    overrides.enemy ?? instantiateEnemy({ name: 'Seed Dummy', maxHp: 20, expReward: 7, drops: [] });
  return { enemy: { ...enemy }, isBoss: overrides.isBoss ?? false };
}

function stagesSeed(overrides: WorldSeed['stages'] = {}): unknown {
  const currentStageId = overrides.currentStageId ?? STAGES[0].id;
  return {
    currentStageId,
    unlockedStageIds: [currentStageId],
    progressByStageId: overrides.bossUnlocked
      ? { [currentStageId]: { kills: 0, bossUnlocked: true } }
      : {},
    mode: 'normal',
    bossTimeRemainingMs: 0,
  };
}

export function makeWorld(options: WorldOptions = {}): World {
  const events: CapturedEvent[] = [];
  const core = new GameCore({
    components: options.components ?? DEFAULT_COMPONENTS,
    rng: options.rng ?? (() => 0),
    // Manual stepping: a no-op frame scheduler so nothing runs until tick().
    requestFrame: () => 0,
    cancelFrame: () => {},
    observeEvent: (name, payload) => {
      events.push({ name, payload } as CapturedEvent);
    },
  });

  const seed = options.seed ?? {};
  if (seed.player) core.getGameComponent(Player).load(playerSeed(seed.player));
  if (seed.stats) core.getGameComponent(PlayerStats).load(statsSeed(seed.stats));
  if (seed.combat) core.getGameComponent(Combat).load(combatSeed(seed.combat));
  if (seed.stages) core.getGameComponent(Stages).load(stagesSeed(seed.stages));

  return {
    getComponent: (componentClass) => core.getGameComponent(componentClass),
    events,
    clearEvents: () => {
      events.length = 0;
    },
    enqueue: (name, payload) => {
      core.enqueueCommand(name, payload);
      core.drainCommands();
    },
    tick: (deltaMs = 0) => core.tick(deltaMs),
  };
}

// Assert that `expected` appears as a subsequence of the emitted event names,
// in order, tolerating sibling cross-talk interleaved between them. With real
// components a kill also emits expGained/inventoryUpdated/etc.; a strict
// toEqual would be brittle. Use this to pin the events the unit owns.
export function expectEventOrder(events: CapturedEvent[], expected: GameEventName[]): void {
  const actual = events.map((event) => event.name);
  let searchFrom = 0;
  for (const name of expected) {
    const found = actual.indexOf(name, searchFrom);
    if (found === -1) {
      throw new Error(
        `Expected event '${name}' after index ${searchFrom}, but the log was: [${actual.join(', ')}]`,
      );
    }
    searchFrom = found + 1;
  }
}
