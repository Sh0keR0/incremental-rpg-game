import type { Enemy } from '../types.ts';

interface EnemyTemplate {
  name: string;
  maxHp: number;
  expReward: number;
}

export const ENEMY_POOL: readonly EnemyTemplate[] = [
  { name: 'Slime', maxHp: 15, expReward: 5 },
  { name: 'Goblin', maxHp: 25, expReward: 9 },
  { name: 'Bat', maxHp: 10, expReward: 4 },
  { name: 'Skeleton', maxHp: 30, expReward: 12 },
];

export function spawnEnemy(rng: () => number): Enemy {
  const index = Math.floor(rng() * ENEMY_POOL.length);
  const template = ENEMY_POOL[index] ?? ENEMY_POOL[0];
  return {
    name: template.name,
    hp: template.maxHp,
    maxHp: template.maxHp,
    expReward: template.expReward,
  };
}
