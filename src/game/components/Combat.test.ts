import { describe, expect, test } from 'vitest';
import type { GameContext } from '../types.ts';
import { Combat, type Enemy } from './Combat.ts';

interface Captured {
  name: string;
  payload: unknown;
}

// A self-contained enemy so these tests don't depend on the shipping ENEMY_POOL,
// whose stats and drops change during development.
const TEST_ENEMY: Enemy = {
  name: 'Test Dummy',
  hp: 20,
  maxHp: 20,
  expReward: 7,
  drops: [{ itemId: 'WoodenSword', chance: 1 }],
};

function makeContext(): { gameContext: GameContext; events: Captured[] } {
  const events: Captured[] = [];
  const gameContext: GameContext = {
    rng: () => 0, // deterministic respawn + guaranteed (chance 1) drop rolls
    emit: (name, payload) => {
      events.push({ name, payload });
    },
    on: () => () => {},
    enqueue: () => {},
    handle: () => {},
    getGameComponent: () => {
      throw new Error('getGameComponent not available in this test');
    },
  };
  return { gameContext, events };
}

function setup(enemy: Enemy = TEST_ENEMY) {
  const context = makeContext();
  const combat = new Combat();
  combat.initialize(context.gameContext);
  combat.load({ enemy: { ...enemy } }); // replace the pool-spawned enemy with our fixture
  return { combat, ...context };
}

describe('Combat', () => {
  test('spawns a full-HP enemy on initialize', () => {
    const { gameContext } = makeContext();
    const combat = new Combat();
    combat.initialize(gameContext);
    const { enemy } = combat.getState();
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(enemy.name).toBeTruthy();
  });

  test('non-lethal hit lowers HP and emits only attacked', () => {
    const { combat, events } = setup();
    combat.damageEnemy(5);
    expect(combat.getState().enemy.hp).toBe(TEST_ENEMY.maxHp - 5);
    expect(events).toEqual([
      {
        name: 'attacked',
        payload: { damage: 5, enemyHp: TEST_ENEMY.maxHp - 5, enemyName: TEST_ENEMY.name },
      },
    ]);
  });

  test('lethal hit announces enemyDefeated with reward + drops, then respawns', () => {
    const { combat, events } = setup();
    combat.damageEnemy(TEST_ENEMY.maxHp);

    expect(events.map((event) => event.name)).toEqual([
      'attacked',
      'enemyDefeated',
      'enemySpawned',
    ]);
    const defeated = events.find((event) => event.name === 'enemyDefeated');
    expect(defeated?.payload).toEqual({
      name: TEST_ENEMY.name,
      expReward: TEST_ENEMY.expReward,
      drops: TEST_ENEMY.drops, // rng: () => 0 rolls every chance-1 drop
    });
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
