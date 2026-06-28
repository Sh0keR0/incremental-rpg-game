import { describe, expect, test } from 'vitest';
import {
    AGILITY_COOLDOWN_FACTOR,
    attackCooldownMs,
    attackDamage,
    BASE_ATTACK_COOLDOWN_MS,
    bossTimeLimitMs,
    ENDURANCE_BOSS_TIME_PER_POINT_MS,
    STRENGTH_DAMAGE_PER_POINT,
} from './combatStats.ts';

// These tests pin the *shape* of each formula (identity, linearity, monotonicity)
// by deriving expectations from the balance constants rather than hard-coding the
// products. Re-tuning a constant for balance flows through and keeps tests green;
// only a genuine change to a formula's behavior should fail them.

describe('attackDamage', () => {
    test('returns the base attack untouched at zero strength', () => {
        expect(attackDamage(5, 0)).toBe(5);
        expect(attackDamage(42, 0)).toBe(42);
    });

    test('adds STRENGTH_DAMAGE_PER_POINT for each strength point', () => {
        const baseAttack = 5;
        const strength = 3;
        expect(attackDamage(baseAttack, strength)).toBe(
            baseAttack + strength * STRENGTH_DAMAGE_PER_POINT,
        );
    });

    test('each strength point adds a constant increment', () => {
        const baseAttack = 5;
        const increment = attackDamage(baseAttack, 4) - attackDamage(baseAttack, 3);
        expect(increment).toBe(STRENGTH_DAMAGE_PER_POINT);
        // Same increment regardless of where on the curve we measure.
        expect(attackDamage(baseAttack, 11) - attackDamage(baseAttack, 10)).toBe(increment);
    });
});

describe('attackCooldownMs', () => {
    test('is the base cooldown at zero agility', () => {
        expect(attackCooldownMs(0)).toBe(BASE_ATTACK_COOLDOWN_MS);
    });

    test('halves the cooldown once agility cancels the base factor', () => {
        // At agility = 1 / AGILITY_COOLDOWN_FACTOR the denominator is 2, so the
        // cooldown is exactly half the base — independent of the constants' values.
        const agilityForHalfCooldown = 1 / AGILITY_COOLDOWN_FACTOR;
        expect(attackCooldownMs(agilityForHalfCooldown)).toBe(BASE_ATTACK_COOLDOWN_MS / 2);
    });

    test('keeps shrinking without ever reaching zero', () => {
        expect(attackCooldownMs(100)).toBeGreaterThan(0);
        expect(attackCooldownMs(100)).toBeLessThan(attackCooldownMs(10));
    });
});

describe('bossTimeLimitMs', () => {
    test('returns the stage base at zero endurance', () => {
        expect(bossTimeLimitMs(30000, 0)).toBe(30000);
    });

    test('adds ENDURANCE_BOSS_TIME_PER_POINT_MS per endurance point', () => {
        const baseLimit = 30000;
        const endurance = 5;
        expect(bossTimeLimitMs(baseLimit, endurance)).toBe(
            baseLimit + endurance * ENDURANCE_BOSS_TIME_PER_POINT_MS,
        );
    });
});
