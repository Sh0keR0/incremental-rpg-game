import { spawnEnemy } from '../content/enemies.ts';
import type { CombatState, Enemy, GameContext, IGameComponent } from '../types.ts';
import { Player } from './Player.ts';

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

    this.gameContext.emit('enemyDefeated', {
      name: this.enemy.name,
      expReward: this.enemy.expReward,
    });
    this.gameContext.getGameComponent(Player).gainExp(this.enemy.expReward);
    this.enemy = spawnEnemy(this.gameContext.rng);
    this.gameContext.emit('enemySpawned', { name: this.enemy.name, maxHp: this.enemy.maxHp });
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
