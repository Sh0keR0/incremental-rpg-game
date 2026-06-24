import { describe, expect, test } from 'vitest';
import { type EnemyTemplate, instantiateEnemy } from './enemies.ts';

const TEMPLATE: EnemyTemplate = {
  name: 'Skeleton',
  maxHp: 30,
  expReward: 12,
  drops: [{ itemId: 'ShortSword', chance: 1 }],
};

describe('instantiateEnemy', () => {
  test('spawns the template at full HP', () => {
    const enemy = instantiateEnemy(TEMPLATE);
    expect(enemy).toEqual({
      name: 'Skeleton',
      hp: 30,
      maxHp: 30,
      expReward: 12,
      drops: TEMPLATE.drops,
    });
  });

  test('hp always equals maxHp regardless of template', () => {
    const enemy = instantiateEnemy({ name: 'Bat', maxHp: 7, expReward: 3, drops: [] });
    expect(enemy.hp).toBe(enemy.maxHp);
  });
});
