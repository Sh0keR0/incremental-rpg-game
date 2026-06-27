import { describe, expect, test } from 'vitest';
import { Combat } from './Combat.ts';
import type { Enemy } from '../content/enemies.ts';
import { STAGES } from '../content/stages.ts';
import { expectEventOrder, makeWorld, type WorldSeed } from '../testing/makeWorld.ts';

// PROTOTYPE: the same Combat behaviour as Combat.test.ts, but driven by a real
// component world (makeWorld) instead of makeTestContext + sibling stubs. The
// point is to compare the two styles side by side — what gets simpler (no
// getGameComponent stub), and what changes (real cross-talk in the event log,
// reactions must be driven through their real producer).

const TEST_ENEMY: Enemy = {
  name: 'Test Dummy',
  hp: 20,
  maxHp: 20,
  expReward: 7, // < expForLevel(1) = 15, so a kill grants exp but never levels up
  drops: [{ itemId: 'WoodenSword', chance: 1 }],
};

const FIRST_STAGE = STAGES[0];

function setup(seed: WorldSeed = {}) {
  const world = makeWorld({ seed: { combat: { enemy: TEST_ENEMY }, ...seed } });
  return { world, combat: world.getComponent(Combat) };
}

describe('Combat (real-world harness)', () => {
  test('spawns a full-HP enemy from the seed', () => {
    const { combat } = setup();
    const { enemy } = combat.getState();
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(enemy.name).toBe(TEST_ENEMY.name);
  });

  // No stubbing: getAttack() comes from the real Player (default attack 5).
  test('the attack command damages the enemy by the real player attack', () => {
    const { world, combat } = setup();
    world.enqueue('attack', {});
    expect(combat.getState().enemy.hp).toBe(TEST_ENEMY.maxHp - 5);
  });

  test('non-lethal hit lowers HP and emits attacked', () => {
    const { world, combat } = setup();
    combat.damageEnemy(5);
    expect(combat.getState().enemy.hp).toBe(TEST_ENEMY.maxHp - 5);

    const attacked = world.events.find((event) => event.name === 'attacked');
    expect(attacked?.payload).toEqual({
      damage: 5,
      enemyHp: TEST_ENEMY.maxHp - 5,
      enemyName: TEST_ENEMY.name,
    });
  });

  // With real siblings the kill really cascades (Player emits expGained between
  // defeat and respawn), so assert only the order of the events Combat owns —
  // never the whole log, which new reactors would change for unrelated reasons.
  test('lethal hit announces enemyDefeated with reward + drops, then respawns', () => {
    const { world, combat } = setup();
    combat.damageEnemy(TEST_ENEMY.maxHp);

    expectEventOrder(world.events, ['attacked', 'enemyDefeated', 'enemySpawned']);

    const defeated = world.events.find((event) => event.name === 'enemyDefeated');
    expect(defeated?.payload).toEqual({
      name: TEST_ENEMY.name,
      expReward: TEST_ENEMY.expReward,
      drops: TEST_ENEMY.drops, // rng: () => 0 rolls every chance-1 drop
      isBoss: false,
    });
    const respawned = combat.getState().enemy;
    expect(respawned.hp).toBe(respawned.maxHp);
    expect(combat.getState().isBoss).toBe(false);
  });

  // Controlled input via state seeding, not a stub: strength 3 is seeded into the
  // real PlayerStats, and Combat reads it through the real query.
  test('strength raises the damage the attack command deals', () => {
    const { world, combat } = setup({ stats: { strength: 3 } });
    world.enqueue('attack', {});
    // 5 base attack + 3 strength * 2/point = 11 damage
    expect(combat.getState().enemy.hp).toBe(TEST_ENEMY.maxHp - 11);
  });

  test('a second attack within the cooldown window does nothing', () => {
    const { world, combat } = setup();
    world.enqueue('attack', {});
    const hpAfterFirst = combat.getState().enemy.hp;
    world.enqueue('attack', {});
    expect(combat.getState().enemy.hp).toBe(hpAfterFirst);
  });

  test('the attack lands again once the cooldown ticks down to zero', () => {
    const { world, combat } = setup();
    world.enqueue('attack', {});
    const hpAfterFirst = combat.getState().enemy.hp;
    world.tick(combat.getState().attackCooldownMs);
    world.enqueue('attack', {});
    expect(combat.getState().enemy.hp).toBe(hpAfterFirst - 5);
  });

  test('higher agility yields a shorter attack cooldown', () => {
    const slow = setup();
    const fast = setup({ stats: { agility: 10 } });
    slow.world.enqueue('attack', {});
    fast.world.enqueue('attack', {});
    expect(fast.combat.getState().attackCooldownRemainingMs).toBeLessThan(
      slow.combat.getState().attackCooldownRemainingMs,
    );
  });

  // Reactions can't be injected as bare facts anymore: to get a bossStarted we
  // drive its real producer (Stages) — unlock the boss, then send fightBoss.
  test('reacts to a real bossStarted by spawning the stage boss', () => {
    const { world, combat } = setup({ stages: { bossUnlocked: true } });
    world.enqueue('fightBoss', {});
    expect(combat.getState().isBoss).toBe(true);
    expect(combat.getState().enemy.name).toBe(FIRST_STAGE.boss.name);
    expect(combat.getState().enemy.hp).toBe(FIRST_STAGE.boss.maxHp);
  });

  test('defeating a boss announces isBoss true, then respawns a normal enemy', () => {
    const { world, combat } = setup({ stages: { bossUnlocked: true } });
    world.enqueue('fightBoss', {});
    combat.damageEnemy(FIRST_STAGE.boss.maxHp);

    const defeated = world.events.find((event) => event.name === 'enemyDefeated');
    expect((defeated?.payload as { isBoss: boolean }).isBoss).toBe(true);
    expect(combat.getState().isBoss).toBe(false);
  });

  test('save/load round-trips the active enemy and boss flag', () => {
    const { combat } = setup();
    combat.damageEnemy(5);
    const saved = combat.save();

    const fresh = setup().combat;
    fresh.load(saved);
    expect(fresh.getState()).toEqual(combat.getState());
  });
});
