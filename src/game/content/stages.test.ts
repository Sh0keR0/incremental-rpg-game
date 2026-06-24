import { describe, expect, test } from 'vitest';
import { getNextStageId, getStageById, spawnStageEnemy, STAGES } from './stages.ts';

describe('stage lookups', () => {
  test('getStageById resolves by stable id', () => {
    const stage = getStageById('cave');
    expect(stage?.name).toBe('Echoing Caverns');
  });

  test('getStageById returns undefined for unknown id', () => {
    expect(getStageById('atlantis')).toBeUndefined();
  });

  test('getNextStageId walks the array order', () => {
    expect(getNextStageId(STAGES[0].id)).toBe(STAGES[1].id);
  });

  test('getNextStageId returns undefined for the final stage', () => {
    const lastStage = STAGES[STAGES.length - 1];
    expect(getNextStageId(lastStage.id)).toBeUndefined();
  });
});

describe('spawnStageEnemy', () => {
  const stage = STAGES[0];

  test('spawns an enemy from the stage pool at full HP', () => {
    const enemy = spawnStageEnemy(stage, () => 0);
    expect(enemy.name).toBe(stage.enemies[0].name);
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  test('selects across the whole stage pool as RNG sweeps [0, 1)', () => {
    const lastIndex = stage.enemies.length - 1;
    expect(spawnStageEnemy(stage, () => 0.999).name).toBe(stage.enemies[lastIndex].name);
  });

  test('only ever spawns enemies belonging to the stage', () => {
    const stageNames = new Set(stage.enemies.map((enemy) => enemy.name));
    for (const randomValue of [0, 0.3, 0.6, 0.99]) {
      expect(stageNames.has(spawnStageEnemy(stage, () => randomValue).name)).toBe(true);
    }
  });
});
