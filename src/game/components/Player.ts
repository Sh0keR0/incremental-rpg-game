import { applyExp, expForLevel } from '../systems/progression.ts';
import type { GameContext, IGameComponent } from '../types.ts';
import { Reborn } from './Reborn.ts';

export const DEFAULT_PLAYER_ATTACK = 5;

export interface PlayerState {
    level: number;
    exp: number;
    expToNext: number;
    attack: number;
}

export class Player implements IGameComponent {
    readonly id = 'player';
    private gameContext!: GameContext;
    private state: PlayerState = {
        level: 1,
        exp: 0,
        expToNext: expForLevel(1),
        attack: DEFAULT_PLAYER_ATTACK,
    };

    initialize(gameContext: GameContext): void {
        this.gameContext = gameContext;
        gameContext.on('enemyDefeated', ({ expReward }) => this.gainExp(this.scaleExp(expReward)));
        gameContext.on('rebornCompleted', () => this.reset());
    }

    getAttack(): number {
        return this.state.attack;
    }

    private scaleExp(expReward: number): number {
        const multiplier = this.gameContext.getGameComponent(Reborn).getExpMultiplier();
        return Math.floor(expReward * multiplier);
    }

    private reset(): void {
        this.state = {
            level: 1,
            exp: 0,
            expToNext: expForLevel(1),
            attack: DEFAULT_PLAYER_ATTACK,
        };
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
