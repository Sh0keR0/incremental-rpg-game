import { describe, expect, test } from 'vitest';
import type { Enemy } from '../content/enemies.ts';
import { STAGES } from '../content/stages.ts';
import { makeTestContext } from '../testing/makeTestContext.ts';
import type { ComponentClass, IGameComponent } from '../types.ts';
import { Combat } from './Combat.ts';
import { Player } from './Player.ts';
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

// Combat queries Stages (which stage to spawn from / the boss template) and
// Player (attack power). Its reward + progression cascade is covered by the
// createGame integration; here we stub just enough for Combat's own behaviour.
const queryStub = (<T extends IGameComponent>(componentClass: ComponentClass<T>): T => {
  if ((componentClass as unknown) === Stages) {
    return {
      getCurrentStage: () => FIRST_STAGE,
      getBossTemplate: () => FIRST_STAGE.boss,
    } as unknown as T;
  }
  if ((componentClass as unknown) === Player) {
    return { getAttack: () => 5 } as unknown as T;
  }
  throw new Error(`unexpected getGameComponent: ${componentClass.name}`);
}) as <T extends IGameComponent>(componentClass: ComponentClass<T>) => T;

function setup(enemy: Enemy = TEST_ENEMY) {
  const context = makeTestContext({ getGameComponent: queryStub });
  const combat = new Combat();
  combat.initialize(context.gameContext);
  combat.load({ enemy: { ...enemy }, isBoss: false });
  return { combat, ...context };
}

describe('Combat', () => {
  test('spawns a full-HP enemy on initialize', () => {
    const { gameContext } = makeTestContext({ getGameComponent: queryStub });
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

  test('save/load round-trips the active enemy and boss flag', () => {
    const { combat } = setup();
    combat.damageEnemy(5);
    const saved = combat.save();

    const fresh = setup().combat;
    fresh.load(saved);
    expect(fresh.getState()).toEqual(combat.getState());
  });
});
