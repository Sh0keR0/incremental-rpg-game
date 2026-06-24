import type { DroppableItem, Enemy } from '../components/Combat.ts';

export interface EnemyTemplate {
  name: string;
  maxHp: number;
  expReward: number;
  drops: DroppableItem[];
}

export function instantiateEnemy(template: EnemyTemplate): Enemy {
  return {
    name: template.name,
    hp: template.maxHp,
    maxHp: template.maxHp,
    expReward: template.expReward,
    drops: template.drops,
  };
}
