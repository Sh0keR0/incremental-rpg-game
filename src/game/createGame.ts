import { Combat } from './components/Combat.ts';
import { Player } from './components/Player.ts';
import { GameCore, type GameCoreOptions } from './GameCore.ts';
import type { Game, GameSnapshot } from './types.ts';

export type GameOptions = Omit<GameCoreOptions, 'components'>;

export function createGame(options: GameOptions = {}): Game {
  const core = new GameCore({ ...options, components: [Player, Combat] });

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
