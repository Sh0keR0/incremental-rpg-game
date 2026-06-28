import { describe, expect, test } from 'vitest';
import {
    ATTACK_MULT_COST_GROWTH,
    ATTACK_MULT_PER_LEVEL,
    attackMultiplier,
    attackMultiplierCost,
    EXP_MULT_COST_GROWTH,
    EXP_MULT_PER_LEVEL,
    expMultiplier,
    expMultiplierCost,
    REMEMBRANCE_POINTS_BY_BOSS_TIER,
    remembrancePointsForBossTier,
} from './reborn.ts';

describe('reborn systems', () => {
    test('expMultiplier is 1 at level 0 and linear in level', () => {
        expect(expMultiplier(0)).toBe(1);
        const step = expMultiplier(1) - expMultiplier(0);
        expect(step).toBeCloseTo(EXP_MULT_PER_LEVEL);
        expect(expMultiplier(5) - expMultiplier(4)).toBeCloseTo(step);
    });

    test('attackMultiplier is 1 at level 0 and linear in level', () => {
        expect(attackMultiplier(0)).toBe(1);
        const step = attackMultiplier(1) - attackMultiplier(0);
        expect(step).toBeCloseTo(ATTACK_MULT_PER_LEVEL);
        expect(attackMultiplier(5) - attackMultiplier(4)).toBeCloseTo(step);
    });

    test('both upgrade costs rise with each purchased level', () => {
        expect(expMultiplierCost(1)).toBeGreaterThan(expMultiplierCost(0));
        expect(attackMultiplierCost(1)).toBeGreaterThan(attackMultiplierCost(0));
    });

    test('attack cost grows strictly faster than exp cost', () => {
        expect(ATTACK_MULT_COST_GROWTH).toBeGreaterThan(EXP_MULT_COST_GROWTH);
        // Over enough levels the attack cost ratio outpaces exp's: ratio of costs
        // between consecutive levels approaches each upgrade's growth constant.
        const expRatio = expMultiplierCost(6) / expMultiplierCost(5);
        const attackRatio = attackMultiplierCost(6) / attackMultiplierCost(5);
        expect(attackRatio).toBeGreaterThan(expRatio);
    });

    test('remembrancePointsForBossTier matches the table and is non-decreasing', () => {
        REMEMBRANCE_POINTS_BY_BOSS_TIER.forEach((points, tier) => {
            expect(remembrancePointsForBossTier(tier)).toBe(points);
        });
        for (let tier = 1; tier < REMEMBRANCE_POINTS_BY_BOSS_TIER.length; tier += 1) {
            expect(remembrancePointsForBossTier(tier)).toBeGreaterThanOrEqual(
                remembrancePointsForBossTier(tier - 1),
            );
        }
    });

    test('no boss killed yet awards nothing; tiers past the table clamp to the last', () => {
        expect(remembrancePointsForBossTier(-1)).toBe(0);
        const lastTier = REMEMBRANCE_POINTS_BY_BOSS_TIER.length - 1;
        expect(remembrancePointsForBossTier(lastTier + 3)).toBe(
            REMEMBRANCE_POINTS_BY_BOSS_TIER[lastTier],
        );
    });
});
