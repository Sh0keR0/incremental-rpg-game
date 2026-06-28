// Single source of truth for the Reborn (prestige) mechanic: every tunable value
// lives here alongside the pure formulas that derive from it. Mirrors
// systems/combatStats.ts and systems/progression.ts. Tests assert the *shape*
// (linearity, monotonicity, relative growth), never the frozen numbers.

// Unlock + reward
export const REBORN_UNLOCK_BOSS_TIER = 2; // 0-based index into STAGES → 3rd boss
export const REMEMBRANCE_POINTS_BY_BOSS_TIER = [1, 3, 6, 10]; // reward at highest tier killed

// EXP multiplier upgrade (repeatable, rising cost)
export const EXP_MULT_PER_LEVEL = 0.25; // +25% exp per level
export const EXP_MULT_BASE_COST = 2;
export const EXP_MULT_COST_GROWTH = 1.6;

// Attack multiplier upgrade (repeatable, faster-rising cost)
export const ATTACK_MULT_PER_LEVEL = 0.2; // +20% attack per level
export const ATTACK_MULT_BASE_COST = 3;
export const ATTACK_MULT_COST_GROWTH = 2.4; // grows faster than EXP

// Cleave / overkill carry-through (one-time)
export const CLEAVE_UNLOCK_COST = 50;

export function remembrancePointsForBossTier(highestTierKilled: number): number {
    if (highestTierKilled < 0) return 0;
    const lastTier = REMEMBRANCE_POINTS_BY_BOSS_TIER.length - 1;
    const tier = Math.min(highestTierKilled, lastTier);
    return REMEMBRANCE_POINTS_BY_BOSS_TIER[tier];
}

export function expMultiplier(level: number): number {
    return 1 + level * EXP_MULT_PER_LEVEL;
}

export function attackMultiplier(level: number): number {
    return 1 + level * ATTACK_MULT_PER_LEVEL;
}

export function expMultiplierCost(currentLevel: number): number {
    return Math.floor(EXP_MULT_BASE_COST * EXP_MULT_COST_GROWTH ** currentLevel);
}

export function attackMultiplierCost(currentLevel: number): number {
    return Math.floor(ATTACK_MULT_BASE_COST * ATTACK_MULT_COST_GROWTH ** currentLevel);
}
