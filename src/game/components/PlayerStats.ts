import type { GameContext, IGameComponent, StatName } from '../types.ts';

export interface PlayerStatsState {
    unspentPoints: number;
    stats: Record<StatName, number>;
}

const STAT_POINTS_PER_LEVEL = 1;
const STAT_NAMES: StatName[] = ['strength', 'agility', 'endurance'];

function defaultState(): PlayerStatsState {
    return { unspentPoints: 0, stats: { strength: 0, agility: 0, endurance: 0 } };
}

export class PlayerStats implements IGameComponent {
    readonly id = 'playerStats';
    private gameContext!: GameContext;
    private state: PlayerStatsState = defaultState();

    initialize(gameContext: GameContext): void {
        this.gameContext = gameContext;
        this.gameContext.on('leveledUp', () => this.awardPoints(STAT_POINTS_PER_LEVEL));
        this.gameContext.handle('allocateStat', ({ statName }) => this.allocateStat(statName));
    }

    getStat(statName: StatName): number {
        return this.state.stats[statName];
    }

    getUnspentPoints(): number {
        return this.state.unspentPoints;
    }

    allocateStat(statName: StatName): void {
        if (!STAT_NAMES.includes(statName)) {
            throw new Error(`Invalid stat name: ${statName}`);
        }
        if (this.state.unspentPoints <= 0) {
            throw new Error('No unspent stat points available');
        }
        this.state.unspentPoints -= 1;
        this.state.stats[statName] += 1;
        this.emitStatsChanged();
    }

    getState(): PlayerStatsState {
        return { unspentPoints: this.state.unspentPoints, stats: { ...this.state.stats } };
    }

    save(): PlayerStatsState {
        return this.getState();
    }

    load(data: unknown): void {
        this.state = data as PlayerStatsState;
    }

    awardPoints(amount: number): void {
        this.state.unspentPoints += amount;
        this.emitStatsChanged();
    }

    private emitStatsChanged(): void {
        this.gameContext.emit('statsChanged', {
            stats: { ...this.state.stats },
            unspentPoints: this.state.unspentPoints,
        });
    }
}
