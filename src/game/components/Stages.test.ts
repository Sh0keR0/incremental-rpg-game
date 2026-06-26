import { describe, expect, test } from 'vitest';
import { STAGES } from '../content/stages.ts';
import { makeTestContext, type TestContext } from '../testing/makeTestContext.ts';
import { Stages } from './Stages.ts';

const FIRST = STAGES[0];
const SECOND = STAGES[1];

// enemyDefeated facts the reactions consume; only `isBoss` matters to Stages.
const NORMAL_DEFEAT = { name: 'grunt', expReward: 0, drops: [], isBoss: false };
const BOSS_DEFEAT = { ...NORMAL_DEFEAT, isBoss: true };

function setup() {
  const context = makeTestContext();
  const stages = new Stages();
  stages.initialize(context.gameContext);
  return { stages, ...context };
}

// Drive the real on('enemyDefeated') wiring to walk a stage to its boss unlock.
function unlockBoss(context: TestContext, count = FIRST.killsToUnlockBoss): void {
  for (let kill = 0; kill < count; kill++) context.simulateEvent('enemyDefeated', NORMAL_DEFEAT);
}

// Unlock + start + win the current stage's boss through the command/event seams.
function clearCurrentBoss(context: TestContext, stages: Stages): void {
  const stage = stages.getCurrentStage();
  unlockBoss(context, stage.killsToUnlockBoss);
  context.runCommand('fightBoss', {});
  context.simulateEvent('enemyDefeated', BOSS_DEFEAT);
}

describe('Stages', () => {
  test('starts on the first stage with only it unlocked', () => {
    const { stages } = setup();
    const state = stages.getState();
    expect(state.currentStageId).toBe(FIRST.id);
    expect(state.unlockedStageIds).toEqual([FIRST.id]);
  });

  test('reacting to normal kills unlocks the boss at the threshold', () => {
    const context = setup();
    const { stages } = context;
    for (let kill = 0; kill < FIRST.killsToUnlockBoss - 1; kill++) {
      context.simulateEvent('enemyDefeated', NORMAL_DEFEAT);
      expect(stages.canFightBoss()).toBe(false);
    }
    context.simulateEvent('enemyDefeated', NORMAL_DEFEAT);
    expect(stages.canFightBoss()).toBe(true);
    expect(context.events).toContainEqual({
      name: 'bossUnlocked',
      payload: { stageId: FIRST.id },
    });
  });

  test('boss unlock is sticky and kill count stops at the threshold', () => {
    const context = setup();
    unlockBoss(context);
    context.simulateEvent('enemyDefeated', NORMAL_DEFEAT);
    context.simulateEvent('enemyDefeated', NORMAL_DEFEAT);
    expect(context.stages.getState().kills).toBe(FIRST.killsToUnlockBoss);
    expect(context.stages.getState().bossUnlocked).toBe(true);
  });

  test('the fightBoss command enters boss mode with a full timer', () => {
    const context = setup();
    unlockBoss(context);
    context.runCommand('fightBoss', {});
    const state = context.stages.getState();
    expect(state.mode).toBe('boss');
    expect(state.bossTimeRemainingMs).toBe(FIRST.bossTimeLimitMs);
    expect(context.events).toContainEqual({
      name: 'bossStarted',
      payload: { stageId: FIRST.id },
    });
  });

  test('the fightBoss command does nothing while the boss is still locked', () => {
    const context = setup();
    context.runCommand('fightBoss', {});
    expect(context.stages.getState().mode).toBe('normal');
    expect(context.events.find((event) => event.name === 'bossStarted')).toBeUndefined();
  });

  test('onTick counts the boss timer down and fails (emitting bossFailed) when it expires', () => {
    const context = setup();
    const { stages } = context;
    unlockBoss(context);
    context.runCommand('fightBoss', {});
    stages.onTick(FIRST.bossTimeLimitMs - 1000);
    expect(stages.getState().mode).toBe('boss');
    stages.onTick(2000);
    expect(stages.getState().mode).toBe('normal');
    expect(context.events).toContainEqual({
      name: 'bossFailed',
      payload: { stageId: FIRST.id },
    });
  });

  test('failing the boss keeps it unlocked for a retry', () => {
    const context = setup();
    const { stages } = context;
    unlockBoss(context);
    context.runCommand('fightBoss', {});
    stages.onTick(FIRST.bossTimeLimitMs);
    expect(stages.canFightBoss()).toBe(true);
  });

  test('defeating the boss unlocks and switches to the next stage without emitting stageSelected', () => {
    const context = setup();
    const { stages } = context;
    clearCurrentBoss(context, stages);
    const state = stages.getState();
    expect(state.currentStageId).toBe(SECOND.id);
    expect(state.mode).toBe('normal');
    expect(context.events).toContainEqual({
      name: 'stageUnlocked',
      payload: { stageId: SECOND.id },
    });
    // Combat respawns from the advanced stage itself, so no stageSelected here.
    expect(context.events.find((event) => event.name === 'stageSelected')).toBeUndefined();
  });

  test('completing the final stage boss stays on the final stage', () => {
    const context = setup();
    const { stages } = context;
    const last = STAGES[STAGES.length - 1];
    for (let index = 0; index < STAGES.length - 1; index++) clearCurrentBoss(context, stages);
    expect(stages.getState().currentStageId).toBe(last.id);
    clearCurrentBoss(context, stages);
    expect(stages.getState().currentStageId).toBe(last.id);
  });

  test('selectStage rejects locked stages', () => {
    const { stages } = setup();
    expect(stages.selectStage(SECOND.id)).toBe(false);
    expect(stages.getState().currentStageId).toBe(FIRST.id);
  });

  test('the selectStage command switches to an unlocked stage and emits stageSelected', () => {
    const context = setup();
    const { stages } = context;
    clearCurrentBoss(context, stages); // unlocks SECOND, now on SECOND
    context.runCommand('selectStage', { stageId: FIRST.id });
    expect(stages.getState().currentStageId).toBe(FIRST.id);
    expect(context.events).toContainEqual({
      name: 'stageSelected',
      payload: { stageId: FIRST.id },
    });
  });

  test('selectStage rejects switching during a boss fight', () => {
    const context = setup();
    const { stages } = context;
    clearCurrentBoss(context, stages); // on SECOND, FIRST behind it
    unlockBoss(context, SECOND.killsToUnlockBoss);
    context.runCommand('fightBoss', {});
    expect(stages.selectStage(FIRST.id)).toBe(false);
  });

  test('selectStage moves between unlocked stages and preserves their progress', () => {
    const context = setup();
    const { stages } = context;
    clearCurrentBoss(context, stages); // on SECOND now
    context.simulateEvent('enemyDefeated', NORMAL_DEFEAT);
    context.simulateEvent('enemyDefeated', NORMAL_DEFEAT);
    expect(stages.selectStage(FIRST.id)).toBe(true);
    expect(stages.getState().bossUnlocked).toBe(true); // FIRST stayed unlocked
    expect(stages.selectStage(SECOND.id)).toBe(true);
    expect(stages.getState().kills).toBe(2); // SECOND kept its own progress
  });

  test('reports unlocked stages so the UI can resolve navigation', () => {
    const context = setup();
    const { stages } = context;
    expect(stages.getState().unlockedStageIds).toEqual([FIRST.id]);
    clearCurrentBoss(context, stages); // unlocks SECOND, moves to it
    expect(stages.getState().unlockedStageIds).toEqual([FIRST.id, SECOND.id]);
  });
});

describe('Stages save/load robustness', () => {
  test('round-trips progress through save/load', () => {
    const context = setup();
    clearCurrentBoss(context, context.stages);
    context.simulateEvent('enemyDefeated', NORMAL_DEFEAT);
    const saved = context.stages.save();

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
