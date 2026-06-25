import { describe, expect, test } from 'vitest';
import { makeTestContext } from '../testing/makeTestContext.ts';
import { Player } from './Player.ts';

function makePlayer() {
  const { gameContext, events, simulateEvent } = makeTestContext();
  const player = new Player();
  player.initialize(gameContext);
  return { player, events, simulateEvent };
}

describe('Player', () => {
  test('starts at level 1 with base stats', () => {
    const { player } = makePlayer();
    expect(player.getState()).toEqual({ level: 1, exp: 0, expToNext: 15, attack: 5 });
    expect(player.getAttack()).toBe(5);
  });

  test('gainExp accumulates and emits expGained without leveling', () => {
    const { player, events } = makePlayer();
    player.gainExp(5);
    expect(player.getState()).toMatchObject({ level: 1, exp: 5 });
    expect(events).toEqual([{ name: 'expGained', payload: { amount: 5, exp: 5, expToNext: 15 } }]);
  });

  test('gainExp levels up and emits one leveledUp per level', () => {
    const { player, events } = makePlayer();
    player.gainExp(100); // crosses levels 2, 3, 4
    expect(player.getState()).toMatchObject({ level: 4, exp: 10 });
    expect(events.map((event) => event.name)).toEqual([
      'expGained',
      'leveledUp',
      'leveledUp',
      'leveledUp',
    ]);
    const levels = events
      .filter((event) => event.name === 'leveledUp')
      .map((event) => (event.payload as { level: number }).level);
    expect(levels).toEqual([2, 3, 4]);
  });

  test('save/load round-trips state', () => {
    const { player } = makePlayer();
    player.gainExp(18); // level 2, exp 3
    const saved = player.save();

    const restored = makePlayer().player;
    restored.load(saved);
    expect(restored.getState()).toEqual(player.getState());
  });
});
