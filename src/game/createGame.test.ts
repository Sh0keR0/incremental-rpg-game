import { describe, expect, test, vi } from 'vitest';
import { createGame } from './createGame.ts';

// Actions enqueue commands that the always-running loop drains on the next
// tick, so tests drive a manual frame pump: enqueue via an action, then tick().
function newGame() {
  let queuedFrame: (() => void) | null = null;
  let clock = 0;
  const game = createGame({
    rng: () => 0,
    now: () => clock,
    requestFrame: (callback) => {
      queuedFrame = callback;
      return 1;
    },
    cancelFrame: () => {
      queuedFrame = null;
    },
  });
  game.start();
  const tick = (deltaMs = 16): void => {
    clock += deltaMs;
    const frame = queuedFrame;
    queuedFrame = null;
    frame?.();
  };
  return { game, tick };
}

// This is a full-game integration test, so it exercises whatever enemy the game
// actually spawns. Expectations are derived from the live spawned enemy and the
// player's attack rather than hardcoded stats, so they survive content changes.

describe('createGame', () => {
  test('exposes initial player and enemy state', () => {
    const state = newGame().game.getState();
    expect(state.player.level).toBe(1);
    expect(state.combat.enemy.hp).toBe(state.combat.enemy.maxHp);
    expect(state.combat.enemy.name).toBeTruthy();
  });

  test('attack lowers enemy HP and notifies subscribers + events', () => {
    const { game, tick } = newGame();
    const { attack } = game.getState().player;
    const enemy = game.getState().combat.enemy;
    const onState = vi.fn();
    const onAttacked = vi.fn();
    game.subscribe(onState);
    game.on('attacked', onAttacked);

    game.actions.attack();
    tick();

    expect(game.getState().combat.enemy.hp).toBe(enemy.hp - attack);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onAttacked).toHaveBeenCalledWith({
      damage: attack,
      enemyHp: enemy.hp - attack,
      enemyName: enemy.name,
    });
  });

  test('killing an enemy awards EXP and respawns', () => {
    const { game, tick } = newGame();
    const { attack } = game.getState().player;
    const enemy = game.getState().combat.enemy;
    const hitsToKill = Math.ceil(enemy.maxHp / attack);
    const onDefeated = vi.fn();
    game.on('enemyDefeated', onDefeated);

    for (let hit = 0; hit < hitsToKill; hit++) {
      game.actions.attack();
      tick();
    }

    expect(onDefeated).toHaveBeenCalledWith({
      name: enemy.name,
      expReward: enemy.expReward,
      drops: enemy.drops, // rng: () => 0 rolls every drop
    });
    expect(game.getState().combat.enemy.hp).toBe(game.getState().combat.enemy.maxHp); // fresh enemy
  });

  test('accumulated EXP eventually levels the player up', () => {
    const { game, tick } = newGame();
    const onLevelUp = vi.fn();
    game.on('leveledUp', onLevelUp);

    let safety = 0;
    while (game.getState().player.level < 2 && safety++ < 1000) {
      game.actions.attack();
      tick();
    }

    expect(onLevelUp).toHaveBeenCalledWith({ level: 2 });
    expect(game.getState().player.level).toBe(2);
  });

  test('initial snapshot includes default stats', () => {
    const state = newGame().game.getState();
    expect(state.stats).toEqual({
      unspentPoints: 0,
      stats: { strength: 0, agility: 0, endurance: 0 },
    });
  });

  test('level up awards stat points and allocateStat spends them', () => {
    const { game, tick } = newGame();

    let safety = 0;
    while (game.getState().player.level < 2 && safety++ < 1000) {
      game.actions.attack();
      tick();
    }

    expect(game.getState().stats.unspentPoints).toBe(1);

    game.actions.allocateStat('strength');
    tick();
    expect(game.getState().stats.stats.strength).toBe(1);
    expect(game.getState().stats.unspentPoints).toBe(0);
  });

  test('statsChanged event fires on level up', () => {
    const { game, tick } = newGame();
    const onStatsChanged = vi.fn();
    game.on('statsChanged', onStatsChanged);

    let safety = 0;
    while (game.getState().player.level < 2 && safety++ < 1000) {
      game.actions.attack();
      tick();
    }

    expect(onStatsChanged).toHaveBeenCalledWith(expect.objectContaining({ unspentPoints: 1 }));
  });
});
