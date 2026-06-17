import { describe, expect, test } from 'vitest';
import { ENEMY_POOL, spawnEnemy } from './enemies.ts';

describe('spawnEnemy', () => {
  test('is deterministic for a given RNG value', () => {
    const first = spawnEnemy(() => 0);
    expect(first).toEqual({
      name: ENEMY_POOL[0].name,
      hp: ENEMY_POOL[0].maxHp,
      maxHp: ENEMY_POOL[0].maxHp,
      expReward: ENEMY_POOL[0].expReward,
      drops: ENEMY_POOL[0].drops,
    });
  });

  test('selects across the whole pool as RNG sweeps [0, 1)', () => {
    const last = ENEMY_POOL.length - 1;
    expect(spawnEnemy(() => 0.999).name).toBe(ENEMY_POOL[last].name);
    expect(spawnEnemy(() => 0.5).name).toBe(ENEMY_POOL[Math.floor(0.5 * ENEMY_POOL.length)].name);
  });

  test('always spawns at full HP', () => {
    for (const randomValue of [0, 0.25, 0.5, 0.75, 0.99]) {
      const enemy = spawnEnemy(() => randomValue);
      expect(enemy.hp).toBe(enemy.maxHp);
    }
  });
});
