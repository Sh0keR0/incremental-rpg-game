import { describe, expect, test } from 'vitest';
import { attackCooldownMs, attackDamage, bossTimeLimitMs } from './combatStats.ts';

describe('attackDamage', () => {
  test('returns the base attack untouched at zero strength', () => {
    expect(attackDamage(5, 0)).toBe(5);
  });

  test('adds a flat bonus per strength point', () => {
    // 5 base + 3 strength * 2/point = 11
    expect(attackDamage(5, 3)).toBe(11);
  });
});

describe('attackCooldownMs', () => {
  test('is one second at zero agility', () => {
    expect(attackCooldownMs(0)).toBe(1000);
  });

  test('halves the cooldown at ten agility', () => {
    // 1000 / (1 + 10 * 0.1) = 1000 / 2 = 500
    expect(attackCooldownMs(10)).toBe(500);
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

  test('adds one second of boss time per endurance point', () => {
    expect(bossTimeLimitMs(30000, 5)).toBe(35000);
  });
});
