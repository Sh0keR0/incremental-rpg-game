import { describe, expect, test, vi } from 'vitest';
import { ENEMY_POOL } from '../content/enemies.ts';
import type { GameContext } from '../types.ts';
import { Combat } from './Combat.ts';

interface Captured {
  name: string;
  payload: unknown;
}

const SLIME = ENEMY_POOL[0];

function setup(): { combat: Combat; events: Captured[]; gainExp: ReturnType<typeof vi.fn> } {
  const events: Captured[] = [];
  const gainExp = vi.fn();
  const gameContext: GameContext = {
    rng: () => 0, // always spawns ENEMY_POOL[0] (Slime, 15 HP)
    emit: (name, payload) => {
      events.push({ name, payload });
    },
    on: () => () => {},
    getGameComponent: (() => ({
      id: 'player',
      gainExp,
    })) as unknown as GameContext['getGameComponent'],
  };
  const combat = new Combat();
  combat.initialize(gameContext);
  return { combat, events, gainExp };
}

describe('Combat', () => {
  test('spawns a full-HP enemy on initialize', () => {
    const { combat } = setup();
    const { enemy } = combat.getState();
    expect(enemy.name).toBe(SLIME.name);
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  test('non-lethal hit lowers HP and emits only attacked', () => {
    const { combat, events, gainExp } = setup();
    combat.damageEnemy(5);
    expect(combat.getState().enemy.hp).toBe(SLIME.maxHp - 5);
    expect(events).toEqual([
      { name: 'attacked', payload: { damage: 5, enemyHp: 10, enemyName: SLIME.name } },
    ]);
    expect(gainExp).not.toHaveBeenCalled();
  });

  test('lethal hit rewards EXP via Player and respawns', () => {
    const { combat, events, gainExp } = setup();
    combat.damageEnemy(SLIME.maxHp);

    expect(gainExp).toHaveBeenCalledWith(SLIME.expReward);
    expect(events.map((event) => event.name)).toEqual([
      'attacked',
      'enemyDefeated',
      'enemySpawned',
    ]);
    const respawned = combat.getState().enemy;
    expect(respawned.hp).toBe(respawned.maxHp);
  });

  test('save/load round-trips the active enemy', () => {
    const { combat } = setup();
    combat.damageEnemy(5);
    const saved = combat.save();

    const fresh = setup().combat;
    fresh.load(saved);
    expect(fresh.getState()).toEqual(combat.getState());
  });
});
