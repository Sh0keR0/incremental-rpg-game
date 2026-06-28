import { STAGES } from '../content/stages.ts';
import {
    attackMultiplier,
    attackMultiplierCost,
    CLEAVE_UNLOCK_COST,
    expMultiplier,
    expMultiplierCost,
    REBORN_UNLOCK_BOSS_TIER,
    remembrancePointsForBossTier,
} from '../systems/reborn.ts';
import type { GameContext, IGameComponent, RebornUpgradeKey } from '../types.ts';

export interface RebornUpgrades {
    expMultiplier: number;
    attackMultiplier: number;
    cleave: boolean;
}

export interface RebornState {
    remembrancePoints: number;
    highestBossTierThisRun: number; // -1 = no boss killed yet this run
    upgrades: RebornUpgrades;
    canReborn: boolean;
    pendingPoints: number;
    expMultiplier: number;
    attackMultiplier: number;
    expUpgradeCost: number;
    attackUpgradeCost: number;
    cleaveCost: number;
}

function defaultUpgrades(): RebornUpgrades {
    return { expMultiplier: 0, attackMultiplier: 0, cleave: false };
}

export class Reborn implements IGameComponent {
    readonly id = 'reborn';
    private gameContext!: GameContext;
    private remembrancePoints = 0;
    private highestBossTierThisRun = -1;
    private upgrades: RebornUpgrades = defaultUpgrades();
    // Guards the one-shot rebornAvailable fact so the reveal fires exactly once
    // per session even as later bosses re-cross the unlock tier.
    private isUnlocked = false;

    initialize(gameContext: GameContext): void {
        this.gameContext = gameContext;
        gameContext.on('bossDefeated', ({ stageId }) => this.registerBossKill(stageId));
        gameContext.handle('reborn', () => this.reborn());
        gameContext.handle('buyRebornUpgrade', ({ upgrade }) => this.buyUpgrade(upgrade));
    }

    getExpMultiplier(): number {
        return expMultiplier(this.upgrades.expMultiplier);
    }

    getAttackMultiplier(): number {
        return attackMultiplier(this.upgrades.attackMultiplier);
    }

    isCleaveUnlocked(): boolean {
        return this.upgrades.cleave;
    }

    private canReborn(): boolean {
        return this.highestBossTierThisRun >= REBORN_UNLOCK_BOSS_TIER;
    }

    private registerBossKill(stageId: string): void {
        const tier = STAGES.findIndex((stage) => stage.id === stageId);
        if (tier < 0) return;
        if (tier > this.highestBossTierThisRun) this.highestBossTierThisRun = tier;
        if (!this.isUnlocked && this.highestBossTierThisRun >= REBORN_UNLOCK_BOSS_TIER) {
            this.isUnlocked = true;
            this.gameContext.emit('rebornAvailable', {});
        }
    }

    private reborn(): void {
        if (!this.canReborn()) return;
        const pointsAwarded = remembrancePointsForBossTier(this.highestBossTierThisRun);
        this.remembrancePoints += pointsAwarded;
        this.highestBossTierThisRun = -1;
        this.gameContext.emit('rebornCompleted', {
            pointsAwarded,
            total: this.remembrancePoints,
        });
    }

    private buyUpgrade(upgrade: RebornUpgradeKey): void {
        if (upgrade === 'cleave') {
            this.buyCleave();
            return;
        }
        const level = this.upgrades[upgrade];
        const cost =
            upgrade === 'expMultiplier' ? expMultiplierCost(level) : attackMultiplierCost(level);
        if (this.remembrancePoints < cost) {
            throw new Error(`Not enough remembrance points for ${upgrade}`);
        }
        this.remembrancePoints -= cost;
        const newLevel = level + 1;
        this.upgrades[upgrade] = newLevel;
        this.gameContext.emit('rebornUpgradePurchased', { upgrade, level: newLevel });
    }

    private buyCleave(): void {
        if (this.upgrades.cleave) {
            throw new Error('Cleave already unlocked');
        }
        if (this.remembrancePoints < CLEAVE_UNLOCK_COST) {
            throw new Error('Not enough remembrance points for cleave');
        }
        this.remembrancePoints -= CLEAVE_UNLOCK_COST;
        this.upgrades.cleave = true;
        this.gameContext.emit('rebornUpgradePurchased', { upgrade: 'cleave', level: 1 });
    }

    getState(): RebornState {
        return {
            remembrancePoints: this.remembrancePoints,
            highestBossTierThisRun: this.highestBossTierThisRun,
            upgrades: { ...this.upgrades },
            canReborn: this.canReborn(),
            pendingPoints: this.canReborn()
                ? remembrancePointsForBossTier(this.highestBossTierThisRun)
                : 0,
            expMultiplier: this.getExpMultiplier(),
            attackMultiplier: this.getAttackMultiplier(),
            expUpgradeCost: expMultiplierCost(this.upgrades.expMultiplier),
            attackUpgradeCost: attackMultiplierCost(this.upgrades.attackMultiplier),
            cleaveCost: CLEAVE_UNLOCK_COST,
        };
    }

    save(): unknown {
        return {
            remembrancePoints: this.remembrancePoints,
            highestBossTierThisRun: this.highestBossTierThisRun,
            upgrades: { ...this.upgrades },
        };
    }

    load(data: unknown): void {
        const saved = (data ?? {}) as Partial<{
            remembrancePoints: number;
            highestBossTierThisRun: number;
            upgrades: Partial<RebornUpgrades>;
        }>;
        this.remembrancePoints = saved.remembrancePoints ?? 0;
        this.highestBossTierThisRun = saved.highestBossTierThisRun ?? -1;
        this.upgrades = { ...defaultUpgrades(), ...saved.upgrades };
    }
}
