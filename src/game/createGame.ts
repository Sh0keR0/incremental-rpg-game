import { type CombatState, Combat } from './components/Combat.ts';
import { type PlayerState, Player } from './components/Player.ts';
import { type PlayerStatsState, PlayerStats } from './components/PlayerStats.ts';
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
  unlocks: UnlocksState;
}

export interface Game {
  getState(): GameSnapshot;
  subscribe(listener: (state: GameSnapshot) => void): () => void;
  on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void;
  actions: {
    attack(): void;
    allocateStat(statName: StatName): void;
  };
  start(): void;
  stop(): void;
}

export function createGame(options: GameOptions = {}): Game {
  const core = new GameCore({
    ...options,
    components: [Player, Combat, Inventory, PlayerStats, Unlocks],
  });

  const getState = (): GameSnapshot => ({
    player: core.getGameComponent(Player).getState(),
    combat: core.getGameComponent(Combat).getState(),
    inventory: core.getGameComponent(Inventory).getState(),
    stats: core.getGameComponent(PlayerStats).getState(),
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
        core.dispatch(() => {
          const player = core.getGameComponent(Player);
          const combat = core.getGameComponent(Combat);
          combat.damageEnemy(player.getAttack());
        });
      },
      allocateStat(statName: StatName) {
        core.dispatch(() => {
          core.getGameComponent(PlayerStats).allocateStat(statName);
        });
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
