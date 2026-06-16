import type { DroppableItem, Enemy } from '../components/Combat.ts';

interface EnemyTemplate {
  name: string;
  maxHp: number;
  expReward: number;
  drops: DroppableItem[];
}

export const ENEMY_POOL: readonly EnemyTemplate[] = [
  // { name: 'Slime', maxHp: 15, expReward: 5, drops: [] },
  // { name: 'Goblin', maxHp: 25, expReward: 9, drops: [] },
  // { name: 'Bat', maxHp: 10, expReward: 4, drops: [] },
  { name: 'Skeleton', maxHp: 30, expReward: 12, drops: [{ chance: 1, itemId: 'ShortSword' }] },
];

export function spawnEnemy(rng: () => number): Enemy {
  const index = Math.floor(rng() * ENEMY_POOL.length);
  const template = ENEMY_POOL[index] ?? ENEMY_POOL[0];
  return {
    name: template.name,
    hp: template.maxHp,
    maxHp: template.maxHp,
    expReward: template.expReward,
    drops: template.drops,
  };
}
