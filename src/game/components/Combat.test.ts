import { describe, expect, test } from 'vitest';
import type { Enemy } from '../content/enemies.ts';
import { STAGES } from '../content/stages.ts';
import { expectEventOrder, makeWorld, type WorldSeed } from '../testing/makeWorld.ts';
import { Combat } from './Combat.ts';

// A self-contained enemy so these tests don't depend on shipping stage content,
// whose stats and drops change during development.
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

describe('Combat', () => {
  test('spawns a full-HP enemy from the seed', () => {
    const { combat } = setup();
    const { enemy } = combat.getState();
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(enemy.name).toBe(TEST_ENEMY.name);
  });

  // No stubbing: getAttack() comes from the real Player (default attack 5).
  test('the attack command damages the enemy by the real player attack', () => {
    const { world, combat } = setup();
    world.runCommand('attack', {});
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

  // With real siblings the kill really cascades (Player emits expGained, Inventory
  // takes the drop) between defeat and respawn, so assert only the order of the
  // events Combat owns — never the whole log, which new reactors would change.
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
    world.runCommand('attack', {});
    // 5 base attack + 3 strength * 2/point = 11 damage
    expect(combat.getState().enemy.hp).toBe(TEST_ENEMY.maxHp - 11);
  });

  test('the manual attack has no cooldown — consecutive attacks both land', () => {
    const { world, combat } = setup();
    world.runCommand('attack', {});
    const hpAfterFirst = combat.getState().enemy.hp;
    world.runCommand('attack', {});
    expect(combat.getState().enemy.hp).toBe(hpAfterFirst - 5);
  });

  test('higher agility yields a shorter auto-attack cooldown', () => {
    const slow = setup();
    const fast = setup({ stats: { agility: 10 } });
    expect(fast.combat.getState().autoAttackCooldownMs).toBeLessThan(
      slow.combat.getState().autoAttackCooldownMs,
    );
  });

  // Reactions can't be injected as bare facts here: to get a bossStarted we drive
  // its real producer (Stages) — unlock the boss, then send the fightBoss command.
  test('reacts to a real bossStarted by spawning the stage boss', () => {
    const { world, combat } = setup({ stages: { bossUnlocked: true } });
    world.runCommand('fightBoss', {});
    expect(combat.getState().isBoss).toBe(true);
    expect(combat.getState().enemy.name).toBe(FIRST_STAGE.boss.name);
    expect(combat.getState().enemy.hp).toBe(FIRST_STAGE.boss.maxHp);
  });

  test('defeating a boss announces isBoss true, then respawns a normal enemy', () => {
    const { world, combat } = setup({ stages: { bossUnlocked: true } });
    world.runCommand('fightBoss', {});
    combat.damageEnemy(FIRST_STAGE.boss.maxHp);

    const defeated = world.events.find((event) => event.name === 'enemyDefeated');
    expect((defeated?.payload as { isBoss: boolean }).isBoss).toBe(true);
    expect(combat.getState().isBoss).toBe(false);
  });

  test('auto-attack is off by default and does not fire on tick', () => {
    const { combat } = setup();
    expect(combat.getState().autoAttackEnabled).toBe(false);
    const startHp = combat.getState().enemy.hp;
    combat.onTick(10_000);
    expect(combat.getState().enemy.hp).toBe(startHp);
  });

  test('toggleAutoAttack enables auto-attacking and onTick lands a hit', () => {
    const { world, combat } = setup();
    world.runCommand('toggleAutoAttack', {});
    expect(combat.getState().autoAttackEnabled).toBe(true);

    const startHp = combat.getState().enemy.hp;
    combat.onTick(16); // enabling starts ready, so the first hit lands at once
    expect(combat.getState().enemy.hp).toBe(startHp - 5);
  });

  test('an enabled auto-attack waits a full cooldown between hits', () => {
    const { world, combat } = setup();
    world.runCommand('toggleAutoAttack', {});
    combat.onTick(16); // first hit; cooldown now recharging
    const hpAfterFirst = combat.getState().enemy.hp;
    combat.onTick(1); // not enough time to recharge
    expect(combat.getState().enemy.hp).toBe(hpAfterFirst);
    combat.onTick(combat.getState().autoAttackCooldownMs);
    expect(combat.getState().enemy.hp).toBe(hpAfterFirst - 5);
  });

  test('toggleAutoAttack twice turns it back off', () => {
    const { world, combat } = setup();
    world.runCommand('toggleAutoAttack', {});
    world.runCommand('toggleAutoAttack', {});
    expect(combat.getState().autoAttackEnabled).toBe(false);
    const startHp = combat.getState().enemy.hp;
    combat.onTick(10_000);
    expect(combat.getState().enemy.hp).toBe(startHp);
  });

  test('save/load round-trips the enemy, boss flag, and auto-attack toggle', () => {
    const { world, combat } = setup();
    combat.damageEnemy(5);
    world.runCommand('toggleAutoAttack', {});
    const saved = combat.save();

    const fresh = setup().combat;
    fresh.load(saved);
    expect(fresh.getState()).toEqual(combat.getState());
    expect(fresh.getState().autoAttackEnabled).toBe(true);
  });
});
