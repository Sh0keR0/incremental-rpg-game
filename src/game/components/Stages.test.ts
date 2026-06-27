import { describe, expect, test } from 'vitest';
import { STAGES } from '../content/stages.ts';
import { makeWorld, type World } from '../testing/makeWorld.ts';
import { PlayerStats } from './PlayerStats.ts';
import { Stages } from './Stages.ts';

const FIRST = STAGES[0];
const SECOND = STAGES[1];

// enemyDefeated facts the reactions consume; only `isBoss` matters to Stages.
const NORMAL_DEFEAT = { name: 'grunt', expReward: 0, drops: [], isBoss: false };
const BOSS_DEFEAT = { ...NORMAL_DEFEAT, isBoss: true };

// Stages only depends on the real PlayerStats (it queries endurance to size the
// boss timer); narrow the world to those two so the event log stays free of
// unrelated cross-talk. Endurance is seeded, not stubbed.
function setup(endurance = 0) {
  const world = makeWorld({
    components: [PlayerStats, Stages],
    seed: { stats: { endurance } },
  });
  return { world, stages: world.getComponent(Stages) };
}

// Inject the enemyDefeated fact to walk a stage toward its boss unlock. Driving
// the real producer (Combat) would mean killing enemies by HP — irrelevant to
// what Stages does with the fact — so emit it straight into the world instead.
function unlockBoss(world: World, count = FIRST.killsToUnlockBoss): void {
  for (let kill = 0; kill < count; kill++) world.emit('enemyDefeated', NORMAL_DEFEAT);
}

// Unlock + start + win the current stage's boss through the command/event seams.
function clearCurrentBoss(world: World, stages: Stages): void {
  const stage = stages.getCurrentStage();
  unlockBoss(world, stage.killsToUnlockBoss);
  world.runCommand('fightBoss', {});
  world.emit('enemyDefeated', BOSS_DEFEAT);
}

describe('Stages', () => {
  test('starts on the first stage with only it unlocked', () => {
    const { stages } = setup();
    const state = stages.getState();
    expect(state.currentStageId).toBe(FIRST.id);
    expect(state.unlockedStageIds).toEqual([FIRST.id]);
  });

  test('reacting to normal kills unlocks the boss at the threshold', () => {
    const { world, stages } = setup();
    for (let kill = 0; kill < FIRST.killsToUnlockBoss - 1; kill++) {
      world.emit('enemyDefeated', NORMAL_DEFEAT);
      expect(stages.canFightBoss()).toBe(false);
    }
    world.emit('enemyDefeated', NORMAL_DEFEAT);
    expect(stages.canFightBoss()).toBe(true);
    expect(world.events).toContainEqual({
      name: 'bossUnlocked',
      payload: { stageId: FIRST.id },
    });
  });

  test('boss unlock is sticky and kill count stops at the threshold', () => {
    const { world, stages } = setup();
    unlockBoss(world);
    world.emit('enemyDefeated', NORMAL_DEFEAT);
    world.emit('enemyDefeated', NORMAL_DEFEAT);
    expect(stages.getState().kills).toBe(FIRST.killsToUnlockBoss);
    expect(stages.getState().bossUnlocked).toBe(true);
  });

  test('the fightBoss command enters boss mode with a full timer', () => {
    const { world, stages } = setup();
    unlockBoss(world);
    world.runCommand('fightBoss', {});
    const state = stages.getState();
    expect(state.mode).toBe('boss');
    expect(state.bossTimeRemainingMs).toBe(FIRST.bossTimeLimitMs);
    expect(world.events).toContainEqual({
      name: 'bossStarted',
      payload: { stageId: FIRST.id },
    });
  });

  test('endurance extends the starting boss timer beyond the stage base', () => {
    const { world, stages } = setup(5);
    unlockBoss(world);
    world.runCommand('fightBoss', {});
    // base limit + 5 endurance * 1000ms/point
    expect(stages.getState().bossTimeRemainingMs).toBe(FIRST.bossTimeLimitMs + 5000);
  });

  test('the fightBoss command does nothing while the boss is still locked', () => {
    const { world, stages } = setup();
    world.runCommand('fightBoss', {});
    expect(stages.getState().mode).toBe('normal');
    expect(world.events.find((event) => event.name === 'bossStarted')).toBeUndefined();
  });

  test('onTick counts the boss timer down and fails (emitting bossFailed) when it expires', () => {
    const { world, stages } = setup();
    unlockBoss(world);
    world.runCommand('fightBoss', {});
    world.tick(FIRST.bossTimeLimitMs - 1000);
    expect(stages.getState().mode).toBe('boss');
    world.tick(2000);
    expect(stages.getState().mode).toBe('normal');
    expect(world.events).toContainEqual({
      name: 'bossFailed',
      payload: { stageId: FIRST.id },
    });
  });

  test('failing the boss keeps it unlocked for a retry', () => {
    const { world, stages } = setup();
    unlockBoss(world);
    world.runCommand('fightBoss', {});
    world.tick(FIRST.bossTimeLimitMs);
    expect(stages.canFightBoss()).toBe(true);
  });

  test('defeating the boss unlocks and switches to the next stage without emitting stageSelected', () => {
    const { world, stages } = setup();
    clearCurrentBoss(world, stages);
    const state = stages.getState();
    expect(state.currentStageId).toBe(SECOND.id);
    expect(state.mode).toBe('normal');
    expect(world.events).toContainEqual({
      name: 'stageUnlocked',
      payload: { stageId: SECOND.id },
    });
    // Combat respawns from the advanced stage itself, so no stageSelected here.
    expect(world.events.find((event) => event.name === 'stageSelected')).toBeUndefined();
  });

  test('completing the final stage boss stays on the final stage', () => {
    const { world, stages } = setup();
    const last = STAGES[STAGES.length - 1];
    for (let index = 0; index < STAGES.length - 1; index++) clearCurrentBoss(world, stages);
    expect(stages.getState().currentStageId).toBe(last.id);
    clearCurrentBoss(world, stages);
    expect(stages.getState().currentStageId).toBe(last.id);
  });

  test('selectStage rejects locked stages', () => {
    const { stages } = setup();
    expect(stages.selectStage(SECOND.id)).toBe(false);
    expect(stages.getState().currentStageId).toBe(FIRST.id);
  });

  test('the selectStage command switches to an unlocked stage and emits stageSelected', () => {
    const { world, stages } = setup();
    clearCurrentBoss(world, stages); // unlocks SECOND, now on SECOND
    world.runCommand('selectStage', { stageId: FIRST.id });
    expect(stages.getState().currentStageId).toBe(FIRST.id);
    expect(world.events).toContainEqual({
      name: 'stageSelected',
      payload: { stageId: FIRST.id },
    });
  });

  test('selectStage rejects switching during a boss fight', () => {
    const { world, stages } = setup();
    clearCurrentBoss(world, stages); // on SECOND, FIRST behind it
    unlockBoss(world, SECOND.killsToUnlockBoss);
    world.runCommand('fightBoss', {});
    expect(stages.selectStage(FIRST.id)).toBe(false);
  });

  test('selectStage moves between unlocked stages and preserves their progress', () => {
    const { world, stages } = setup();
    clearCurrentBoss(world, stages); // on SECOND now
    world.emit('enemyDefeated', NORMAL_DEFEAT);
    world.emit('enemyDefeated', NORMAL_DEFEAT);
    expect(stages.selectStage(FIRST.id)).toBe(true);
    expect(stages.getState().bossUnlocked).toBe(true); // FIRST stayed unlocked
    expect(stages.selectStage(SECOND.id)).toBe(true);
    expect(stages.getState().kills).toBe(2); // SECOND kept its own progress
  });

  test('reports unlocked stages so the UI can resolve navigation', () => {
    const { world, stages } = setup();
    expect(stages.getState().unlockedStageIds).toEqual([FIRST.id]);
    clearCurrentBoss(world, stages); // unlocks SECOND, moves to it
    expect(stages.getState().unlockedStageIds).toEqual([FIRST.id, SECOND.id]);
  });
});

describe('Stages save/load robustness', () => {
  test('round-trips progress through save/load', () => {
    const { world, stages } = setup();
    clearCurrentBoss(world, stages);
    world.emit('enemyDefeated', NORMAL_DEFEAT);
    const saved = stages.save();

    const fresh = setup().stages;
    fresh.load(saved);
    expect(fresh.getState().currentStageId).toBe(SECOND.id);
    expect(fresh.getState().kills).toBe(1);
  });

  test('falls back to the first stage when the saved current id is gone', () => {
    const { stages } = setup();
    stages.load({ currentStageId: 'atlantis', unlockedStageIds: ['atlantis'] });
    expect(stages.getState().currentStageId).toBe(FIRST.id);
  });

  test('drops unlocked ids and progress for stages no longer in STAGES', () => {
    const { stages } = setup();
    stages.load({
      currentStageId: FIRST.id,
      unlockedStageIds: [FIRST.id, 'sunken-temple'],
      progressByStageId: { 'sunken-temple': { kills: 3, bossUnlocked: true } },
    });
    expect(stages.getState().unlockedStageIds).toEqual([FIRST.id]);
  });

  test('always keeps the first stage unlocked even if absent from the save', () => {
    const { stages } = setup();
    stages.load({ unlockedStageIds: [] });
    expect(stages.getState().unlockedStageIds).toContain(FIRST.id);
  });
});
