import { describe, expect, test } from 'vitest';
import type { GameContext } from '../types.ts';
import { PlayerStats } from './PlayerStats.ts';

interface Captured {
  name: string;
  payload: unknown;
}

function makeContext() {
  const events: Captured[] = [];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const gameContext: GameContext = {
    rng: () => 0,
    emit: (name, payload) => {
      events.push({ name, payload });
    },
    on: (name, listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      const set = listeners.get(name) as Set<(payload: unknown) => void>;
      set.add(listener as (payload: unknown) => void);
      return () => {
        set.delete(listener as (payload: unknown) => void);
      };
    },
    getGameComponent: () => {
      throw new Error('getGameComponent not available in this test');
    },
  };
  const simulateEvent = (name: string, payload: unknown) => {
    for (const fn of listeners.get(name) ?? []) fn(payload);
  };
  return { gameContext, events, simulateEvent };
}

function makePlayerStats() {
  const { gameContext, events, simulateEvent } = makeContext();
  const playerStats = new PlayerStats();
  playerStats.initialize(gameContext);
  return { playerStats, events, simulateEvent };
}

describe('PlayerStats', () => {
  test('starts with zero stats and zero unspent points', () => {
    const { playerStats } = makePlayerStats();
    expect(playerStats.getState()).toEqual({
      unspentPoints: 0,
      stats: { strength: 0, agility: 0, endurance: 0 },
    });
    expect(playerStats.getUnspentPoints()).toBe(0);
  });

  test('getStat returns the value of a named stat', () => {
    const { playerStats } = makePlayerStats();
    expect(playerStats.getStat('strength')).toBe(0);
    expect(playerStats.getStat('agility')).toBe(0);
    expect(playerStats.getStat('endurance')).toBe(0);
  });

  test('awards one unspent point per leveledUp event', () => {
    const { playerStats, simulateEvent } = makePlayerStats();
    simulateEvent('leveledUp', { level: 2 });
    expect(playerStats.getUnspentPoints()).toBe(1);
    simulateEvent('leveledUp', { level: 3 });
    expect(playerStats.getUnspentPoints()).toBe(2);
  });

  test('emits statsChanged when points are awarded', () => {
    const { events, simulateEvent } = makePlayerStats();
    simulateEvent('leveledUp', { level: 2 });
    expect(events).toEqual([
      {
        name: 'statsChanged',
        payload: {
          stats: { strength: 0, agility: 0, endurance: 0 },
          unspentPoints: 1,
        },
      },
    ]);
  });

  test('allocateStat spends one point and increments the stat', () => {
    const { playerStats, simulateEvent } = makePlayerStats();
    simulateEvent('leveledUp', { level: 2 });
    playerStats.allocateStat('strength');
    expect(playerStats.getStat('strength')).toBe(1);
    expect(playerStats.getUnspentPoints()).toBe(0);
  });

  test('allocateStat emits statsChanged', () => {
    const { playerStats, events, simulateEvent } = makePlayerStats();
    simulateEvent('leveledUp', { level: 2 });
    events.length = 0;
    playerStats.allocateStat('agility');
    expect(events).toEqual([
      {
        name: 'statsChanged',
        payload: {
          stats: { strength: 0, agility: 1, endurance: 0 },
          unspentPoints: 0,
        },
      },
    ]);
  });

  test('allocateStat throws when no unspent points', () => {
    const { playerStats } = makePlayerStats();
    expect(() => playerStats.allocateStat('strength')).toThrow('No unspent stat points available');
  });

  test('allocateStat throws for invalid stat name', () => {
    const { playerStats, simulateEvent } = makePlayerStats();
    simulateEvent('leveledUp', { level: 2 });
    expect(() => playerStats.allocateStat('charisma' as 'strength')).toThrow(
      'Invalid stat name: charisma',
    );
  });

  test('multiple allocations distribute correctly', () => {
    const { playerStats, simulateEvent } = makePlayerStats();
    simulateEvent('leveledUp', { level: 2 });
    simulateEvent('leveledUp', { level: 3 });
    simulateEvent('leveledUp', { level: 4 });
    playerStats.allocateStat('strength');
    playerStats.allocateStat('agility');
    playerStats.allocateStat('endurance');
    expect(playerStats.getState()).toEqual({
      unspentPoints: 0,
      stats: { strength: 1, agility: 1, endurance: 1 },
    });
  });

  test('awardPoints adds the given amount of unspent points', () => {
    const { playerStats } = makePlayerStats();
    playerStats.awardPoints(3);
    expect(playerStats.getUnspentPoints()).toBe(3);
    playerStats.awardPoints(2);
    expect(playerStats.getUnspentPoints()).toBe(5);
  });

  test('save/load round-trips state', () => {
    const { playerStats, simulateEvent } = makePlayerStats();
    simulateEvent('leveledUp', { level: 2 });
    simulateEvent('leveledUp', { level: 3 });
    playerStats.allocateStat('endurance');
    const saved = playerStats.save();

    const restored = makePlayerStats().playerStats;
    restored.load(saved);
    expect(restored.getState()).toEqual(playerStats.getState());
  });
});
