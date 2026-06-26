import type { Enemy } from '../components/Combat.ts';
import { type EnemyTemplate, instantiateEnemy } from './enemies.ts';

export interface StageDefinition {
  // Stable, hand-written id used in saves — never an array index, so stages can
  // be reordered or inserted without invalidating a saved game.
  id: string;
  name: string;
  enemies: readonly EnemyTemplate[];
  killsToUnlockBoss: number;
  boss: EnemyTemplate;
  bossTimeLimitMs: number;
}

export const STAGES: readonly StageDefinition[] = [
  {
    id: 'forest',
    name: 'Whispering Forest',
    enemies: [
      { name: 'Skeleton', maxHp: 30, expReward: 12, drops: [{ itemId: 'ShortSword', chance: 1 }] },
      { name: 'Forest Bat', maxHp: 18, expReward: 7, drops: [] },
    ],
    killsToUnlockBoss: 5,
    boss: {
      name: 'Elder Treant',
      maxHp: 180,
      expReward: 80,
      drops: [{ itemId: 'ShortSword', chance: 1 }],
    },
    bossTimeLimitMs: 30000,
  },
  {
    id: 'cave',
    name: 'Echoing Caverns',
    enemies: [
      { name: 'Cave Goblin', maxHp: 45, expReward: 18, drops: [] },
      { name: 'Rock Golem', maxHp: 70, expReward: 26, drops: [] },
    ],
    killsToUnlockBoss: 7,
    boss: { name: 'Cave Tyrant', maxHp: 320, expReward: 160, drops: [] },
    bossTimeLimitMs: 35000,
  },
  {
    id: 'castle',
    name: 'Ruined Castle',
    enemies: [
      { name: 'Cursed Knight', maxHp: 90, expReward: 34, drops: [] },
      { name: 'Wraith', maxHp: 110, expReward: 42, drops: [] },
    ],
    killsToUnlockBoss: 8,
    boss: { name: 'Lich King', maxHp: 600, expReward: 320, drops: [] },
    bossTimeLimitMs: 40000,
  },
];

export function getStageById(id: string): StageDefinition | undefined {
  return STAGES.find((stage) => stage.id === id);
}

export function getNextStage(id: string): StageDefinition | undefined {
  const index = STAGES.findIndex((stage) => stage.id === id);
  if (index === -1) return undefined;
  return STAGES[index + 1];
}

export function getNextStageId(id: string): string | undefined {
  return getNextStage(id)?.id;
}

export function spawnStageEnemy(stage: StageDefinition, rng: () => number): Enemy {
  const index = Math.floor(rng() * stage.enemies.length);
  const template = stage.enemies[index] ?? stage.enemies[0];
  return instantiateEnemy(template);
}
