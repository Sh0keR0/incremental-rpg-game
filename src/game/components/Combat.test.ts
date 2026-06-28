import { describe, expect, test } from 'vitest';
import type { Enemy } from '../content/enemies.ts';
import { STAGES } from '../content/stages.ts';
import { attackDamage } from '../systems/combatStats.ts';
import { attackMultiplier } from '../systems/reborn.ts';
import { expectEventOrder, makeWorld, type WorldSeed } from '../testing/makeWorld.ts';
import { Combat } from './Combat.ts';
import { DEFAULT_PLAYER_ATTACK } from './Player.ts';

// Expected hit damage is derived from the real attackDamage formula and the
// player's base attack, so re-tuning either flows through instead of breaking
// these tests. damageEnemy(...) calls below pass explicit amounts on purpose:
// those are direct inputs, not balance-derived expectations.

// A self-contained enemy so these tests don't depend on shipping stage content,
// whose stats and drops change during development.
const TEST_ENEMY: Enemy = {
    name: 'Test Dummy',
    // Roomy HP so a single (possibly strength-boosted) hit never accidentally kills
    // it when combat constants are re-tuned; the lethal-hit tests deal maxHp on purpose.
    hp: 1000,
    maxHp: 1000,
    expReward: 7, // < expForLevel(1), so a kill grants exp but never levels up
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

    // No stubbing: getAttack() comes from the real Player.
    test('the attack command damages the enemy by the real player attack', () => {
        const { world, combat } = setup();
        world.runCommand('attack', {});
        expect(combat.getState().enemy.hp).toBe(
            TEST_ENEMY.maxHp - attackDamage(DEFAULT_PLAYER_ATTACK, 0),
        );
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

    test('strength raises the damage the attack command deals', () => {
        const { world, combat } = setup({ stats: { strength: 3 } });
        world.runCommand('attack', {});
        expect(combat.getState().enemy.hp).toBe(
            TEST_ENEMY.maxHp - attackDamage(DEFAULT_PLAYER_ATTACK, 3),
        );
        // and strength must actually raise the damage above the no-strength hit
        expect(attackDamage(DEFAULT_PLAYER_ATTACK, 3)).toBeGreaterThan(
            attackDamage(DEFAULT_PLAYER_ATTACK, 0),
        );
    });

    test('the manual attack has no cooldown — consecutive attacks both land', () => {
        const { world, combat } = setup();
        world.runCommand('attack', {});
        const hpAfterFirst = combat.getState().enemy.hp;
        world.runCommand('attack', {});
        expect(combat.getState().enemy.hp).toBe(
            hpAfterFirst - attackDamage(DEFAULT_PLAYER_ATTACK, 0),
        );
    });

    test('higher agility yields a shorter auto-attack cooldown', () => {
        const slow = setup();
        const fast = setup({ stats: { agility: 10 } });
        expect(fast.combat.getState().autoAttackCooldownMs).toBeLessThan(
            slow.combat.getState().autoAttackCooldownMs,
        );
    });

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
        expect(combat.getState().enemy.hp).toBe(startHp - attackDamage(DEFAULT_PLAYER_ATTACK, 0));
    });

    test('an enabled auto-attack waits a full cooldown between hits', () => {
        const { world, combat } = setup();
        world.runCommand('toggleAutoAttack', {});
        combat.onTick(16); // first hit; cooldown now recharging
        const hpAfterFirst = combat.getState().enemy.hp;
        combat.onTick(1); // not enough time to recharge
        expect(combat.getState().enemy.hp).toBe(hpAfterFirst);
        combat.onTick(combat.getState().autoAttackCooldownMs);
        expect(combat.getState().enemy.hp).toBe(
            hpAfterFirst - attackDamage(DEFAULT_PLAYER_ATTACK, 0),
        );
    });

    test('a single large-delta tick fires one auto-hit per elapsed cooldown', () => {
        const { world, combat } = setup();
        world.runCommand('toggleAutoAttack', {});
        combat.onTick(16); // consume the start-ready hit so we measure steady-state pacing
        const hpAfterPrime = combat.getState().enemy.hp;

        const cooldownMs = combat.getState().autoAttackCooldownMs;
        const hitsToFire = 4;
        combat.onTick(cooldownMs * hitsToFire);

        const damagePerHit = attackDamage(DEFAULT_PLAYER_ATTACK, 0);
        expect(combat.getState().enemy.hp).toBe(hpAfterPrime - damagePerHit * hitsToFire);
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

    test('the reborn attack multiplier scales the damage dealt', () => {
        const { world, combat } = setup({ reborn: { upgrades: { attackMultiplier: 2 } } });
        world.runCommand('attack', {});
        const expected = Math.floor(attackDamage(DEFAULT_PLAYER_ATTACK, 0) * attackMultiplier(2));
        expect(combat.getState().enemy.hp).toBe(TEST_ENEMY.maxHp - expected);
    });

    // The freshly spawned enemy after a kill comes from STAGES[0] (rng: () => 0
    // picks its first template), so its full HP is derived from shipping content.
    const NEXT_ENEMY_MAX_HP = FIRST_STAGE.enemies[0].maxHp;
    const SMALL_ENEMY: Enemy = {
        name: 'Glass Dummy',
        hp: 10,
        maxHp: 10,
        expReward: 1,
        drops: [],
    };

    test('with cleave on, overkill carries into the next enemy', () => {
        const { combat } = setup({
            combat: { enemy: SMALL_ENEMY },
            reborn: { upgrades: { cleave: true } },
        });
        const overkill = 5;
        combat.damageEnemy(SMALL_ENEMY.hp + overkill);
        // The next enemy spawned at full HP, then took the carried-over overkill.
        expect(combat.getState().enemy.maxHp).toBe(NEXT_ENEMY_MAX_HP);
        expect(combat.getState().enemy.hp).toBe(NEXT_ENEMY_MAX_HP - overkill);
    });

    test('with cleave off, overkill is discarded', () => {
        const { combat } = setup({ combat: { enemy: SMALL_ENEMY } });
        combat.damageEnemy(SMALL_ENEMY.hp + 5);
        expect(combat.getState().enemy.hp).toBe(NEXT_ENEMY_MAX_HP); // full HP, no carry-through
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
