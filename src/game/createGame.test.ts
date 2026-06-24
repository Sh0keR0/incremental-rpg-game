import { describe, expect, test, vi } from 'vitest';
import { STAGES } from './content/stages.ts';
import { createGame, type Game } from './createGame.ts';

function newGame() {
  return createGame({ rng: () => 0 });
}

function attackUntil(game: Game, done: () => boolean, limit = 2000): void {
  let safety = 0;
  while (!done() && safety++ < limit) game.actions.attack();
  if (safety >= limit) throw new Error('attackUntil exceeded its safety limit');
}

// This is a full-game integration test, so it exercises whatever enemy the game
// actually spawns. Expectations are derived from the live spawned enemy and the
// player's attack rather than hardcoded stats, so they survive content changes.

describe('createGame', () => {
  test('exposes initial player and enemy state', () => {
    const state = newGame().getState();
    expect(state.player.level).toBe(1);
    expect(state.combat.enemy.hp).toBe(state.combat.enemy.maxHp);
    expect(state.combat.enemy.name).toBeTruthy();
  });

  test('attack lowers enemy HP and notifies subscribers + events', () => {
    const game = newGame();
    const { attack } = game.getState().player;
    const enemy = game.getState().combat.enemy;
    const onState = vi.fn();
    const onAttacked = vi.fn();
    game.subscribe(onState);
    game.on('attacked', onAttacked);

    game.actions.attack();
    expect(game.getState().combat.enemy.hp).toBe(enemy.hp - attack);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onAttacked).toHaveBeenCalledWith({
      damage: attack,
      enemyHp: enemy.hp - attack,
      enemyName: enemy.name,
    });
  });

  test('killing an enemy awards EXP and respawns', () => {
    const game = newGame();
    const { attack } = game.getState().player;
    const enemy = game.getState().combat.enemy;
    const hitsToKill = Math.ceil(enemy.maxHp / attack);
    const onDefeated = vi.fn();
    game.on('enemyDefeated', onDefeated);

    for (let hit = 0; hit < hitsToKill; hit++) game.actions.attack();

    expect(onDefeated).toHaveBeenCalledWith({
      name: enemy.name,
      expReward: enemy.expReward,
      drops: enemy.drops, // rng: () => 0 rolls every drop
    });
    expect(game.getState().combat.enemy.hp).toBe(game.getState().combat.enemy.maxHp); // fresh enemy
  });

  test('accumulated EXP eventually levels the player up', () => {
    const game = newGame();
    const onLevelUp = vi.fn();
    game.on('leveledUp', onLevelUp);

    let safety = 0;
    while (game.getState().player.level < 2 && safety++ < 1000) {
      game.actions.attack();
    }

    expect(onLevelUp).toHaveBeenCalledWith({ level: 2 });
    expect(game.getState().player.level).toBe(2);
  });

  test('initial snapshot includes default stats', () => {
    const state = newGame().getState();
    expect(state.stats).toEqual({
      unspentPoints: 0,
      stats: { strength: 0, agility: 0, endurance: 0 },
    });
  });

  test('level up awards stat points and allocateStat spends them', () => {
    const game = newGame();

    let safety = 0;
    while (game.getState().player.level < 2 && safety++ < 1000) {
      game.actions.attack();
    }

    expect(game.getState().stats.unspentPoints).toBe(1);

    game.actions.allocateStat('strength');
    expect(game.getState().stats.stats.strength).toBe(1);
    expect(game.getState().stats.unspentPoints).toBe(0);
  });

  test('statsChanged event fires on level up', () => {
    const game = newGame();
    const onStatsChanged = vi.fn();
    game.on('statsChanged', onStatsChanged);

    let safety = 0;
    while (game.getState().player.level < 2 && safety++ < 1000) {
      game.actions.attack();
    }

    expect(onStatsChanged).toHaveBeenCalledWith(expect.objectContaining({ unspentPoints: 1 }));
  });
});

describe('createGame stage system', () => {
  const FIRST = STAGES[0];
  const SECOND = STAGES[1];

  test('starts on the first stage with the boss locked', () => {
    const state = newGame().getState();
    expect(state.stages.currentStageId).toBe(FIRST.id);
    expect(state.stages.bossUnlocked).toBe(false);
    expect(state.combat.isBoss).toBe(false);
  });

  test('clearing enough enemies unlocks the boss', () => {
    const game = newGame();
    const onUnlocked = vi.fn();
    game.on('bossUnlocked', onUnlocked);

    attackUntil(game, () => game.getState().stages.bossUnlocked);

    expect(onUnlocked).toHaveBeenCalledWith({ stageName: FIRST.name });
  });

  test('fightBoss is ignored until the boss is unlocked', () => {
    const game = newGame();
    game.actions.fightBoss();
    expect(game.getState().stages.mode).toBe('normal');
    expect(game.getState().combat.isBoss).toBe(false);
  });

  test('defeating the boss unlocks and advances to the next stage', () => {
    const game = newGame();
    const onStageUnlocked = vi.fn();
    game.on('stageUnlocked', onStageUnlocked);

    attackUntil(game, () => game.getState().stages.bossUnlocked);
    game.actions.fightBoss();
    expect(game.getState().combat.isBoss).toBe(true);

    attackUntil(game, () => game.getState().stages.currentStageId !== FIRST.id);

    expect(game.getState().stages.currentStageId).toBe(SECOND.id);
    expect(onStageUnlocked).toHaveBeenCalledWith({ stageId: SECOND.id, stageName: SECOND.name });
  });

  test('player can move back to an earlier unlocked stage, keeping its progress', () => {
    const game = newGame();
    attackUntil(game, () => game.getState().stages.bossUnlocked);
    game.actions.fightBoss();
    attackUntil(game, () => game.getState().stages.currentStageId === SECOND.id);

    game.actions.selectStage(FIRST.id);
    expect(game.getState().stages.currentStageId).toBe(FIRST.id);
    expect(game.getState().stages.bossUnlocked).toBe(true); // first stage stayed cleared
  });

  test('selecting a locked stage does nothing', () => {
    const game = newGame();
    const last = STAGES[STAGES.length - 1];
    game.actions.selectStage(last.id);
    expect(game.getState().stages.currentStageId).toBe(FIRST.id);
  });

  test('letting the boss timer expire fails the fight and returns to normal enemies', () => {
    let now = 0;
    let frameCallback: (() => void) | null = null;
    const game = createGame({
      rng: () => 0,
      now: () => now,
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
      cancelFrame: () => {},
    });
    const tick = (elapsedMs: number): void => {
      now += elapsedMs;
      const callback = frameCallback;
      frameCallback = null;
      callback?.();
    };

    attackUntil(game, () => game.getState().stages.bossUnlocked);
    game.actions.fightBoss();
    expect(game.getState().stages.mode).toBe('boss');

    const onFailed = vi.fn();
    game.on('bossFailed', onFailed);
    game.start();
    tick(FIRST.bossTimeLimitMs + 1000);

    expect(game.getState().stages.mode).toBe('normal');
    expect(game.getState().combat.isBoss).toBe(false);
    expect(onFailed).toHaveBeenCalledWith({ stageName: FIRST.name });
    game.stop();
  });
});
