import { type CombatState, Combat } from './components/Combat.ts';
import { type PlayerState, Player } from './components/Player.ts';
import { type PlayerStatsState, PlayerStats } from './components/PlayerStats.ts';
import { type StagesState, Stages } from './components/Stages.ts';
import { GameCore, type GameCoreOptions } from './GameCore.ts';
import type { GameEventMap, GameEventName, StatName } from './types.ts';
import Inventory, { type InventoryData } from './components/Inventory.ts';
import { type UnlocksState, Unlocks } from './components/Unlocks.ts';

export type GameOptions = Omit<GameCoreOptions, 'components'>;

export interface GameSnapshot {
  player: PlayerState;
  combat: CombatState;
  inventory: InventoryData;
  stats: PlayerStatsState;
  stages: StagesState;
  unlocks: UnlocksState;
}

export interface Game {
  getState(): GameSnapshot;
  subscribe(listener: (state: GameSnapshot) => void): () => void;
  on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void;
  actions: {
    attack(): void;
    allocateStat(statName: StatName): void;
    fightBoss(): void;
    selectStage(stageId: string): void;
  };
  start(): void;
  stop(): void;
}

export function createGame(options: GameOptions = {}): Game {
  const core = new GameCore({
    ...options,
    components: [Player, Stages, Combat, Inventory, PlayerStats, Unlocks],
  });

  const getState = (): GameSnapshot => ({
    player: core.getGameComponent(Player).getState(),
    combat: core.getGameComponent(Combat).getState(),
    inventory: core.getGameComponent(Inventory).getState(),
    stats: core.getGameComponent(PlayerStats).getState(),
    stages: core.getGameComponent(Stages).getState(),
    unlocks: core.getGameComponent(Unlocks).getState(),
  });

  return {
    getState,
    subscribe(listener) {
      return core.subscribe(() => listener(getState()));
    },
    on(name, listener) {
      return core.on(name, listener);
    },
    actions: {
      attack() {
        core.enqueueCommand('attack', {});
      },
      allocateStat(statName: StatName) {
        core.enqueueCommand('allocateStat', { statName });
      },
      fightBoss() {
        core.enqueueCommand('fightBoss', {});
      },
      selectStage(stageId: string) {
        core.enqueueCommand('selectStage', { stageId });
      },
    },
    start() {
      core.start();
    },
    stop() {
      core.stop();
    },
  };
}
