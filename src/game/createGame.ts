import { type CombatState, Combat } from './components/Combat.ts';
import { type PlayerState, Player } from './components/Player.ts';
import { GameCore, type GameCoreOptions } from './GameCore.ts';
import type { GameEventMap, GameEventName } from './types.ts';
import Inventory from "./components/Inventory.ts";

export type GameOptions = Omit<GameCoreOptions, 'components'>;

export interface GameSnapshot {
  player: PlayerState;
  combat: CombatState;
}

export interface Game {
  getState(): GameSnapshot;
  subscribe(listener: (state: GameSnapshot) => void): () => void;
  on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void;
  actions: {
    attack(): void;
  };
  start(): void;
  stop(): void;
}

export function createGame(options: GameOptions = {}): Game {
  const core = new GameCore({ ...options, components: [Player, Combat, Inventory] });

  const getState = (): GameSnapshot => ({
    player: core.getGameComponent(Player).getState(),
    combat: core.getGameComponent(Combat).getState(),
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
    },
    start() {
      core.start();
    },
    stop() {
      core.stop();
    },
  };
}
