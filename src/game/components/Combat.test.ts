import { describe, expect, test } from 'vitest';
import type { Enemy } from '../content/enemies.ts';
import { STAGES } from '../content/stages.ts';
import { makeTestContext } from '../testing/makeTestContext.ts';
import type { ComponentClass, IGameComponent } from '../types.ts';
import { Combat } from './Combat.ts';
import { Player } from './Player.ts';
import { PlayerStats } from './PlayerStats.ts';
import { Stages } from './Stages.ts';

// A self-contained enemy so these tests don't depend on shipping stage content,
// whose stats and drops change during development.
const TEST_ENEMY: Enemy = {
  name: 'Test Dummy',
  hp: 20,
  maxHp: 20,
  expReward: 7,
  drops: [{ itemId: 'WoodenSword', chance: 1 }],
};

const FIRST_STAGE = STAGES[0];

type Stats = { strength: number; agility: number; endurance: number };

// Combat queries Stages (which stage to spawn from / the boss template), Player
// (attack power) and PlayerStats (strength/agility). Its reward + progression
// cascade is covered by the createGame integration; here we stub just enough for
// Combat's own behaviour. `stats` is mutable so a test can set strength/agility.
function makeQueryStub(stats: Stats) {
  return (<T extends IGameComponent>(componentClass: ComponentClass<T>): T => {
    if ((componentClass as unknown) === Stages) {
      return {
        getCurrentStage: () => FIRST_STAGE,
        getBossTemplate: () => FIRST_STAGE.boss,
      } as unknown as T;
    }
    if ((componentClass as unknown) === Player) {
      return { getAttack: () => 5 } as unknown as T;
    }
    if ((componentClass as unknown) === PlayerStats) {
      return { getStat: (name: keyof Stats) => stats[name] } as unknown as T;
    }
    throw new Error(`unexpected getGameComponent: ${componentClass.name}`);
  }) as <T extends IGameComponent>(componentClass: ComponentClass<T>) => T;
}

function setup(
  enemy: Enemy = TEST_ENEMY,
  stats: Stats = { strength: 0, agility: 0, endurance: 0 },
) {
  const context = makeTestContext({ getGameComponent: makeQueryStub(stats) });
  const combat = new Combat();
  combat.initialize(context.gameContext);
  combat.load({ enemy: { ...enemy }, isBoss: false });
  return { combat, ...context };
}

describe('Combat', () => {
  test('spawns a full-HP enemy on initialize', () => {
    const { enemy } = setup().combat.getState();
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

  test('the attack command damages the enemy by the player attack', () => {
    const { combat, runCommand } = setup();
    runCommand('attack', {});
    expect(combat.getState().enemy.hp).toBe(TEST_ENEMY.maxHp - 5);
  });

  test('lethal hit announces enemyDefeated (not a boss) with reward + drops, then respawns', () => {
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
      isBoss: false,
    });
    const respawned = combat.getState().enemy;
    expect(respawned.hp).toBe(respawned.maxHp);
    expect(combat.getState().isBoss).toBe(false);
  });

  test('reacts to bossStarted by spawning the stage boss', () => {
    const { combat, simulateEvent } = setup();
    simulateEvent('bossStarted', { stageId: FIRST_STAGE.id });
    expect(combat.getState().isBoss).toBe(true);
    expect(combat.getState().enemy.name).toBe(FIRST_STAGE.boss.name);
    expect(combat.getState().enemy.hp).toBe(FIRST_STAGE.boss.maxHp);
  });

  test('defeating a boss announces enemyDefeated with isBoss true, then respawns a normal enemy', () => {
    const { combat, events, simulateEvent } = setup();
    simulateEvent('bossStarted', { stageId: FIRST_STAGE.id });
    combat.damageEnemy(FIRST_STAGE.boss.maxHp);

    const defeated = events.find((event) => event.name === 'enemyDefeated');
    expect((defeated?.payload as { isBoss: boolean }).isBoss).toBe(true);
    expect(combat.getState().isBoss).toBe(false); // back to a normal enemy
  });

  test('reacts to bossFailed and stageSelected by returning to a normal enemy', () => {
    const { combat, simulateEvent } = setup();
    simulateEvent('bossStarted', { stageId: FIRST_STAGE.id });
    expect(combat.getState().isBoss).toBe(true);

    simulateEvent('bossFailed', { stageId: FIRST_STAGE.id });
    expect(combat.getState().isBoss).toBe(false);

    simulateEvent('bossStarted', { stageId: FIRST_STAGE.id });
    simulateEvent('stageSelected', { stageId: FIRST_STAGE.id });
    expect(combat.getState().isBoss).toBe(false);
  });

  test('strength raises the damage the attack command deals', () => {
    const { combat, runCommand } = setup(TEST_ENEMY, { strength: 3, agility: 0, endurance: 0 });
    runCommand('attack', {});
    // 5 base attack + 3 strength * 2/point = 11 damage
    expect(combat.getState().enemy.hp).toBe(TEST_ENEMY.maxHp - 11);
  });

  test('the manual attack has no cooldown — consecutive attacks both land', () => {
    const { combat, runCommand } = setup();
    runCommand('attack', {});
    const hpAfterFirst = combat.getState().enemy.hp;
    runCommand('attack', {});
    expect(combat.getState().enemy.hp).toBe(hpAfterFirst - 5);
  });

  test('higher agility yields a shorter auto-attack cooldown', () => {
    const slow = setup(TEST_ENEMY, { strength: 0, agility: 0, endurance: 0 });
    const fast = setup(TEST_ENEMY, { strength: 0, agility: 10, endurance: 0 });
    expect(fast.combat.getState().autoAttackCooldownMs).toBeLessThan(
      slow.combat.getState().autoAttackCooldownMs,
    );
  });

  test('auto-attack is off by default and does not fire on tick', () => {
    const { combat } = setup();
    expect(combat.getState().autoAttackEnabled).toBe(false);
    const startHp = combat.getState().enemy.hp;
    combat.onTick(10_000);
    expect(combat.getState().enemy.hp).toBe(startHp);
  });

  test('toggleAutoAttack enables auto-attacking and onTick lands a hit', () => {
    const { combat, runCommand } = setup();
    runCommand('toggleAutoAttack', {});
    expect(combat.getState().autoAttackEnabled).toBe(true);

    const startHp = combat.getState().enemy.hp;
    combat.onTick(16); // enabling starts ready, so the first hit lands at once
    expect(combat.getState().enemy.hp).toBe(startHp - 5);
  });

  test('an enabled auto-attack waits a full cooldown between hits', () => {
    const { combat, runCommand } = setup();
    runCommand('toggleAutoAttack', {});
    combat.onTick(16); // first hit; cooldown now recharging
    const hpAfterFirst = combat.getState().enemy.hp;
    combat.onTick(1); // not enough time to recharge
    expect(combat.getState().enemy.hp).toBe(hpAfterFirst);
    combat.onTick(combat.getState().autoAttackCooldownMs);
    expect(combat.getState().enemy.hp).toBe(hpAfterFirst - 5);
  });

  test('toggleAutoAttack twice turns it back off', () => {
    const { combat, runCommand } = setup();
    runCommand('toggleAutoAttack', {});
    runCommand('toggleAutoAttack', {});
    expect(combat.getState().autoAttackEnabled).toBe(false);
    const startHp = combat.getState().enemy.hp;
    combat.onTick(10_000);
    expect(combat.getState().enemy.hp).toBe(startHp);
  });

  test('save/load round-trips the enemy, boss flag, and auto-attack toggle', () => {
    const { combat, runCommand } = setup();
    combat.damageEnemy(5);
    runCommand('toggleAutoAttack', {});
    const saved = combat.save();

    const fresh = setup().combat;
    fresh.load(saved);
    expect(fresh.getState()).toEqual(combat.getState());
    expect(fresh.getState().autoAttackEnabled).toBe(true);
  });
});
