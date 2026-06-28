import { describe, expect, test } from 'vitest';
import { applyExp, EXP_BASE_PER_LEVEL, EXP_LEVEL_MULTIPLIER, expForLevel } from './progression.ts';

// Thresholds are derived from expForLevel rather than hard-coded, so re-tuning
// the EXP curve constants flows through these tests. They assert the *behavior*
// of applyExp (carry-over, multi-level roll-up, immutability), not frozen numbers.
const lvl1 = { level: 1, exp: 0, expToNext: expForLevel(1) };

describe('expForLevel', () => {
    test('follows the base * level * multiplier curve', () => {
        expect(expForLevel(1)).toBe(Math.floor(EXP_BASE_PER_LEVEL * 1 * EXP_LEVEL_MULTIPLIER));
        expect(expForLevel(2)).toBe(Math.floor(EXP_BASE_PER_LEVEL * 2 * EXP_LEVEL_MULTIPLIER));
        expect(expForLevel(3)).toBe(Math.floor(EXP_BASE_PER_LEVEL * 3 * EXP_LEVEL_MULTIPLIER));
    });

    test('grows with level', () => {
        expect(expForLevel(10)).toBeGreaterThan(expForLevel(9));
    });
});

describe('applyExp', () => {
    test('accumulates EXP without leveling when below threshold', () => {
        const belowThreshold = expForLevel(1) - 1;
        expect(applyExp(lvl1, belowThreshold)).toEqual({
            level: 1,
            exp: belowThreshold,
            expToNext: expForLevel(1),
            levelsGained: [],
        });
    });

    test('levels up once when EXP crosses the threshold, carrying remainder', () => {
        const remainder = 3;
        const gained = expForLevel(1) + remainder;
        expect(applyExp(lvl1, gained)).toEqual({
            level: 2,
            exp: remainder,
            expToNext: expForLevel(2),
            levelsGained: [2],
        });
    });

    test('levels up exactly at the threshold with no remainder', () => {
        expect(applyExp(lvl1, expForLevel(1))).toEqual({
            level: 2,
            exp: 0,
            expToNext: expForLevel(2),
            levelsGained: [2],
        });
    });

    test('rolls over multiple levels in a single gain', () => {
        const remainder = 10;
        const throughLevel4 = expForLevel(1) + expForLevel(2) + expForLevel(3) + remainder;
        const result = applyExp(lvl1, throughLevel4);
        expect(result.level).toBe(4);
        expect(result.exp).toBe(remainder);
        expect(result.levelsGained).toEqual([2, 3, 4]);
    });

    test('does not mutate the input', () => {
        applyExp(lvl1, expForLevel(1) + 3);
        expect(lvl1).toEqual({ level: 1, exp: 0, expToNext: expForLevel(1) });
    });
});
