import { describe, expect, test } from 'vitest';
import { applyExp, expForLevel } from './progression.ts';

const lvl1 = { level: 1, exp: 0, expToNext: 15 };

describe('expForLevel', () => {
  test('follows the 10 * level * 1.5 curve', () => {
    expect(expForLevel(1)).toBe(15);
    expect(expForLevel(2)).toBe(30);
    expect(expForLevel(3)).toBe(45);
  });

  test('grows with level', () => {
    expect(expForLevel(10)).toBeGreaterThan(expForLevel(9));
  });
});

describe('applyExp', () => {
  test('accumulates EXP without leveling when below threshold', () => {
    expect(applyExp(lvl1, 5)).toEqual({ level: 1, exp: 5, expToNext: 15, levelsGained: [] });
  });

  test('levels up once when EXP crosses the threshold, carrying remainder', () => {
    expect(applyExp(lvl1, 18)).toEqual({ level: 2, exp: 3, expToNext: 30, levelsGained: [2] });
  });

  test('levels up exactly at the threshold with no remainder', () => {
    expect(applyExp(lvl1, 15)).toEqual({ level: 2, exp: 0, expToNext: 30, levelsGained: [2] });
  });

  test('rolls over multiple levels in a single gain', () => {
    const result = applyExp(lvl1, 100); // 15 + 30 + 45 = 90 -> level 4, rem 10
    expect(result.level).toBe(4);
    expect(result.exp).toBe(10);
    expect(result.levelsGained).toEqual([2, 3, 4]);
  });

  test('does not mutate the input', () => {
    applyExp(lvl1, 18);
    expect(lvl1).toEqual({ level: 1, exp: 0, expToNext: 15 });
  });
});
