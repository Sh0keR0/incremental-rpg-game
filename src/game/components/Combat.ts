import { type EnemyTemplate, instantiateEnemy } from '../content/enemies.ts';
import { spawnStageEnemy, STAGES } from '../content/stages.ts';
import type { GameContext, IGameComponent } from '../types.ts';
import { Player } from './Player.ts';
import Inventory from './Inventory.ts';
import { Stages } from './Stages.ts';

export interface DroppableItem {
  itemId: string;
  chance: number;
}

export interface Enemy {
  name: string;
  hp: number;
  maxHp: number;
  expReward: number;
  drops: DroppableItem[];
}

export interface CombatState {
  enemy: Enemy;
  isBoss: boolean;
}

export class Combat implements IGameComponent {
  readonly id = 'combat';
  private gameContext!: GameContext;
  private enemy!: Enemy;
  private currentEnemyIsBoss = false;

  initialize(gameContext: GameContext): void {
    this.gameContext = gameContext;
    this.enemy = spawnStageEnemy(STAGES[0], gameContext.rng);
  }

  damageEnemy(amount: number): void {
    const remainingHp = Math.max(0, this.enemy.hp - amount);
    this.enemy = { ...this.enemy, hp: remainingHp };
    this.gameContext.emit('attacked', {
      damage: amount,
      enemyHp: remainingHp,
      enemyName: this.enemy.name,
    });
    if (remainingHp > 0) return;
    this.defeatEnemy();
  }

  spawnNormalEnemy(): void {
    const stage = this.gameContext.getGameComponent(Stages).getCurrentStage();
    this.enemy = spawnStageEnemy(stage, this.gameContext.rng);
    this.currentEnemyIsBoss = false;
    this.gameContext.emit('enemySpawned', { name: this.enemy.name, maxHp: this.enemy.maxHp });
  }

  spawnBoss(template: EnemyTemplate): void {
    this.enemy = instantiateEnemy(template);
    this.currentEnemyIsBoss = true;
  }

  private defeatEnemy() {
    this.gameContext.getGameComponent(Player).gainExp(this.enemy.expReward);

    const drops = this.rollDrops();
    for (const drop of drops) {
      this.gameContext.getGameComponent(Inventory).add(drop.itemId);
    }
    this.gameContext.emit('enemyDefeated', {
      name: this.enemy.name,
      expReward: this.enemy.expReward,
      drops: drops,
    });

    const stages = this.gameContext.getGameComponent(Stages);
    if (this.currentEnemyIsBoss) {
      stages.completeBossFight();
    } else {
      stages.registerNormalKill();
    }
    this.spawnNormalEnemy();
  }

  private rollDrops(): DroppableItem[] {
    const drops: DroppableItem[] = [];
    for (const droppable of this.enemy.drops) {
      if (this.gameContext.rng() <= droppable.chance) {
        drops.push(droppable);
      }
    }
    return drops;
  }

  getState(): CombatState {
    return { enemy: { ...this.enemy }, isBoss: this.currentEnemyIsBoss };
  }

  save(): unknown {
    return { enemy: this.enemy, isBoss: this.currentEnemyIsBoss };
  }

  load(data: unknown): void {
    const saved = data as { enemy: Enemy; isBoss?: boolean };
    this.enemy = saved.enemy;
    this.currentEnemyIsBoss = saved.isBoss ?? false;
  }
}
