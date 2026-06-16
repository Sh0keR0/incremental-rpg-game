import { spawnEnemy } from '../content/enemies.ts';
import type { GameContext, IGameComponent } from '../types.ts';
import { Player } from './Player.ts';
import Inventory from './Inventory.ts';

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
}

export class Combat implements IGameComponent {
  readonly id = 'combat';
  private gameContext!: GameContext;
  private enemy!: Enemy;

  initialize(gameContext: GameContext): void {
    this.gameContext = gameContext;
    this.enemy = spawnEnemy(gameContext.rng);
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

    this.enemy = spawnEnemy(this.gameContext.rng);
    this.gameContext.emit('enemySpawned', { name: this.enemy.name, maxHp: this.enemy.maxHp });
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
    return { enemy: { ...this.enemy } };
  }

  save(): unknown {
    return { enemy: this.enemy };
  }

  load(data: unknown): void {
    const saved = data as { enemy: Enemy };
    this.enemy = saved.enemy;
  }
}
