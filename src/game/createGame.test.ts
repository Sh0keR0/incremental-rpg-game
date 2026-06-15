import { describe, expect, test, vi } from 'vitest';
import { ENEMY_POOL } from './content/enemies.ts';
import { createGame } from './createGame.ts';

const SLIME = ENEMY_POOL[0]; // rng:() => 0 always spawns this (15 HP, 5 EXP)

function newGame() {
  return createGame({ rng: () => 0 });
}

describe('createGame', () => {
  test('exposes initial player and enemy state', () => {
    const state = newGame().getState();
    expect(state.player.level).toBe(1);
    expect(state.combat.enemy.name).toBe(SLIME.name);
    expect(state.combat.enemy.hp).toBe(SLIME.maxHp);
  });

  test('attack lowers enemy HP and notifies subscribers + events', () => {
    const game = newGame();
    const onState = vi.fn();
    const onAttacked = vi.fn();
    game.subscribe(onState);
    game.on('attacked', onAttacked);

    game.actions.attack();
    expect(game.getState().combat.enemy.hp).toBe(SLIME.maxHp - 5);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onAttacked).toHaveBeenCalledWith({ damage: 5, enemyHp: 10, enemyName: SLIME.name });
  });

  test('killing an enemy awards EXP and respawns', () => {
    const game = newGame();
    const onDefeated = vi.fn();
    game.on('enemyDefeated', onDefeated);

    for (let hit = 0; hit < 3; hit++) game.actions.attack(); // 3 * 5 = 15 HP

    expect(onDefeated).toHaveBeenCalledWith({ name: SLIME.name, expReward: SLIME.expReward });
    expect(game.getState().player.exp).toBe(SLIME.expReward);
    expect(game.getState().combat.enemy.hp).toBe(SLIME.maxHp); // fresh enemy
  });

  test('accumulated EXP eventually levels the player up', () => {
    const game = newGame();
    const onLevelUp = vi.fn();
    game.on('leveledUp', onLevelUp);

    for (let hit = 0; hit < 9; hit++) game.actions.attack(); // 3 kills = 15 EXP -> level 2

    expect(onLevelUp).toHaveBeenCalledWith({ level: 2 });
    expect(game.getState().player.level).toBe(2);
  });
});
