import { applyExp, expForLevel } from '../systems/progression.ts';
import type { GameContext, IGameComponent, PlayerState } from '../types.ts';

export class Player implements IGameComponent {
  readonly id = 'player';
  private gameContext!: GameContext;
  private level = 1;
  private exp = 0;
  private expToNext = expForLevel(1);
  private attack = 5;

  initialize(gameContext: GameContext): void {
    this.gameContext = gameContext;
  }

  getAttack(): number {
    return this.attack;
  }

  gainExp(amount: number): void {
    const result = applyExp(
      { level: this.level, exp: this.exp, expToNext: this.expToNext },
      amount,
    );
    this.level = result.level;
    this.exp = result.exp;
    this.expToNext = result.expToNext;

    this.gameContext.emit('expGained', { amount, exp: this.exp, expToNext: this.expToNext });
    for (const level of result.levelsGained) {
      this.gameContext.emit('leveledUp', { level });
    }
  }

  getState(): PlayerState {
    return { level: this.level, exp: this.exp, expToNext: this.expToNext, attack: this.attack };
  }

  save(): unknown {
    return { level: this.level, exp: this.exp, attack: this.attack };
  }

  load(data: unknown): void {
    const saved = data as { level: number; exp: number; attack: number };
    this.level = saved.level;
    this.exp = saved.exp;
    this.attack = saved.attack;
    this.expToNext = expForLevel(this.level);
  }
}
