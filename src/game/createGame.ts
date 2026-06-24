import { type CombatState, Combat } from './components/Combat.ts';
import { type PlayerState, Player } from './components/Player.ts';
import { type PlayerStatsState, PlayerStats } from './components/PlayerStats.ts';
import { type StagesState, Stages } from './components/Stages.ts';
import { GameCore, type GameCoreOptions } from './GameCore.ts';
import type { GameEventMap, GameEventName, StatName } from './types.ts';
import Inventory, { type InventoryData } from './components/Inventory.ts';

export type GameOptions = Omit<GameCoreOptions, 'components'>;

export interface GameSnapshot {
  player: PlayerState;
  combat: CombatState;
  inventory: InventoryData;
  stats: PlayerStatsState;
  stages: StagesState;
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
    components: [Player, Stages, Combat, Inventory, PlayerStats],
  });

  const getState = (): GameSnapshot => ({
    player: core.getGameComponent(Player).getState(),
    combat: core.getGameComponent(Combat).getState(),
    inventory: core.getGameComponent(Inventory).getState(),
    stats: core.getGameComponent(PlayerStats).getState(),
    stages: core.getGameComponent(Stages).getState(),
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
      fightBoss() {
        core.dispatch(() => {
          const stages = core.getGameComponent(Stages);
          if (!stages.canFightBoss()) return;
          stages.beginBossFight();
          core.getGameComponent(Combat).spawnBoss(stages.getBossTemplate());
        });
      },
      selectStage(stageId: string) {
        core.dispatch(() => {
          const stages = core.getGameComponent(Stages);
          if (!stages.selectStage(stageId)) return;
          core.getGameComponent(Combat).spawnNormalEnemy();
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
