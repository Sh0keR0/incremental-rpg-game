import { applyExp, expForLevel } from '../systems/progression.ts';
import type { GameContext, IGameComponent } from '../types.ts';

export interface PlayerState {
  level: number;
  exp: number;
  expToNext: number;
  attack: number;
}

export class Player implements IGameComponent {
  readonly id = 'player';
  private gameContext!: GameContext;
  private state: PlayerState = { level: 1, exp: 0, expToNext: expForLevel(1), attack: 5 };

  initialize(gameContext: GameContext): void {
    this.gameContext = gameContext;
    gameContext.on('enemyDefeated', ({ expReward }) => this.gainExp(expReward));
  }

  getAttack(): number {
    return this.state.attack;
  }

  gainExp(amount: number): void {
    const result = applyExp(
      { level: this.state.level, exp: this.state.exp, expToNext: this.state.expToNext },
      amount,
    );
    this.state.level = result.level;
    this.state.exp = result.exp;
    this.state.expToNext = result.expToNext;

    this.gameContext.emit('expGained', {
      amount,
      exp: this.state.exp,
      expToNext: this.state.expToNext,
    });
    for (const level of result.levelsGained) {
      this.gameContext.emit('leveledUp', { level });
    }
  }

  getState(): PlayerState {
    return this.state;
  }
  save(): PlayerState {
    return this.state;
  }

  load(data: unknown): void {
    this.state = data as PlayerState;
  }
}
