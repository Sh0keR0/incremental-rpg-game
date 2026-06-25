import { describe, expect, test, vi } from 'vitest';
import { STAGES } from '../content/stages.ts';
import type { GameContext } from '../types.ts';
import { Combat } from './Combat.ts';
import { Stages } from './Stages.ts';

interface Captured {
  name: string;
  payload: unknown;
}

function makeContext(): {
  gameContext: GameContext;
  events: Captured[];
  spawnNormalEnemy: ReturnType<typeof vi.fn>;
} {
  const events: Captured[] = [];
  const spawnNormalEnemy = vi.fn();
  const gameContext: GameContext = {
    rng: () => 0,
    emit: (name, payload) => {
      events.push({ name, payload });
    },
    on: () => () => {},
    getGameComponent: ((component: unknown) =>
      component === Combat
        ? { id: 'combat', spawnNormalEnemy }
        : undefined) as unknown as GameContext['getGameComponent'],
  };
  return { gameContext, events, spawnNormalEnemy };
}

function setup() {
  const context = makeContext();
  const stages = new Stages();
  stages.initialize(context.gameContext);
  return { stages, ...context };
}

const FIRST = STAGES[0];
const SECOND = STAGES[1];

function unlockBoss(stages: Stages): void {
  for (let kill = 0; kill < FIRST.killsToUnlockBoss; kill++) stages.registerNormalKill();
}

describe('Stages', () => {
  test('starts on the first stage with only it unlocked', () => {
    const { stages } = setup();
    const state = stages.getState();
    expect(state.currentStageId).toBe(FIRST.id);
    expect(state.stages.filter((stage) => stage.unlocked).map((stage) => stage.id)).toEqual([
      FIRST.id,
    ]);
  });

  test('unlocks the boss once the kill threshold is reached', () => {
    const { stages, events } = setup();
    for (let kill = 0; kill < FIRST.killsToUnlockBoss - 1; kill++) {
      stages.registerNormalKill();
      expect(stages.canFightBoss()).toBe(false);
    }
    stages.registerNormalKill();
    expect(stages.canFightBoss()).toBe(true);
    expect(events).toContainEqual({ name: 'bossUnlocked', payload: { stageName: FIRST.name } });
  });

  test('boss unlock is sticky and kill count stops at the threshold', () => {
    const { stages } = setup();
    unlockBoss(stages);
    stages.registerNormalKill();
    stages.registerNormalKill();
    expect(stages.getState().kills).toBe(FIRST.killsToUnlockBoss);
    expect(stages.getState().bossUnlocked).toBe(true);
  });

  test('beginBossFight enters boss mode with a full timer', () => {
    const { stages, events } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    const state = stages.getState();
    expect(state.mode).toBe('boss');
    expect(state.bossTimeRemainingMs).toBe(FIRST.bossTimeLimitMs);
    expect(events).toContainEqual({
      name: 'bossStarted',
      payload: {
        name: FIRST.boss.name,
        maxHp: FIRST.boss.maxHp,
        timeLimitMs: FIRST.bossTimeLimitMs,
      },
    });
  });

  test('onTick counts the boss timer down and fails when it expires', () => {
    const { stages, events, spawnNormalEnemy } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    stages.onTick(FIRST.bossTimeLimitMs - 1000);
    expect(stages.getState().mode).toBe('boss');
    stages.onTick(2000);
    expect(stages.getState().mode).toBe('normal');
    expect(events).toContainEqual({ name: 'bossFailed', payload: { stageName: FIRST.name } });
    expect(spawnNormalEnemy).toHaveBeenCalledOnce();
  });

  test('failing the boss keeps it unlocked for a retry', () => {
    const { stages } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    stages.onTick(FIRST.bossTimeLimitMs);
    expect(stages.canFightBoss()).toBe(true);
  });

  test('completeBossFight unlocks and switches to the next stage', () => {
    const { stages, events } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    stages.completeBossFight();
    const state = stages.getState();
    expect(state.currentStageId).toBe(SECOND.id);
    expect(state.mode).toBe('normal');
    expect(events).toContainEqual({
      name: 'stageUnlocked',
      payload: { stageId: SECOND.id, stageName: SECOND.name },
    });
  });

  test('completing the final stage boss stays on the final stage', () => {
    const { stages } = setup();
    const last = STAGES[STAGES.length - 1];
    // Walk forward to the last stage by clearing each boss.
    for (let index = 0; index < STAGES.length - 1; index++) {
      for (let kill = 0; kill < STAGES[index].killsToUnlockBoss; kill++)
        stages.registerNormalKill();
      stages.beginBossFight();
      stages.completeBossFight();
    }
    expect(stages.getState().currentStageId).toBe(last.id);
    for (let kill = 0; kill < last.killsToUnlockBoss; kill++) stages.registerNormalKill();
    stages.beginBossFight();
    stages.completeBossFight();
    expect(stages.getState().currentStageId).toBe(last.id);
  });

  test('selectStage rejects locked stages', () => {
    const { stages } = setup();
    expect(stages.selectStage(SECOND.id)).toBe(false);
    expect(stages.getState().currentStageId).toBe(FIRST.id);
  });

  test('selectStage rejects switching during a boss fight', () => {
    const { stages } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    stages.completeBossFight(); // unlocks SECOND, now on SECOND in normal mode
    // Back to a boss fight on SECOND requires its own unlock; instead test the guard directly:
    unlockBossFor(stages, SECOND.killsToUnlockBoss);
    stages.beginBossFight();
    expect(stages.selectStage(FIRST.id)).toBe(false);
  });

  test('exposes no navigable neighbors on the first stage with nothing else unlocked', () => {
    const { stages } = setup();
    const state = stages.getState();
    expect(state.prevStageId).toBeUndefined();
    expect(state.nextStageId).toBeUndefined();
  });

  test('exposes the next stage once it is unlocked, and the prev stage from there', () => {
    const { stages } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    stages.completeBossFight(); // unlocks + moves to SECOND

    const onSecond = stages.getState();
    expect(onSecond.prevStageId).toBe(FIRST.id);
    expect(onSecond.nextStageId).toBeUndefined(); // THIRD not unlocked yet

    stages.selectStage(FIRST.id);
    const onFirst = stages.getState();
    expect(onFirst.prevStageId).toBeUndefined();
    expect(onFirst.nextStageId).toBe(SECOND.id);
  });

  test('exposes no navigable neighbors during a boss fight', () => {
    const { stages } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    stages.completeBossFight(); // on SECOND, FIRST behind it
    unlockBossFor(stages, SECOND.killsToUnlockBoss);
    stages.beginBossFight();
    const state = stages.getState();
    expect(state.prevStageId).toBeUndefined();
    expect(state.nextStageId).toBeUndefined();
  });

  test('selectStage moves between unlocked stages and preserves their progress', () => {
    const { stages } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    stages.completeBossFight(); // on SECOND now
    stages.registerNormalKill();
    stages.registerNormalKill();
    expect(stages.selectStage(FIRST.id)).toBe(true);
    expect(stages.getState().bossUnlocked).toBe(true); // FIRST stayed unlocked
    expect(stages.selectStage(SECOND.id)).toBe(true);
    expect(stages.getState().kills).toBe(2); // SECOND kept its own progress
  });
});

function unlockBossFor(stages: Stages, kills: number): void {
  for (let kill = 0; kill < kills; kill++) stages.registerNormalKill();
}

describe('Stages save/load robustness', () => {
  test('round-trips progress through save/load', () => {
    const { stages } = setup();
    unlockBoss(stages);
    stages.beginBossFight();
    stages.completeBossFight();
    stages.registerNormalKill();
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
    const unlocked = stages
      .getState()
      .stages.filter((stage) => stage.unlocked)
      .map((s) => s.id);
    expect(unlocked).toEqual([FIRST.id]);
  });

  test('always keeps the first stage unlocked even if absent from the save', () => {
    const { stages } = setup();
    stages.load({ unlockedStageIds: [] });
    const unlocked = stages
      .getState()
      .stages.filter((stage) => stage.unlocked)
      .map((s) => s.id);
    expect(unlocked).toContain(FIRST.id);
  });
});
