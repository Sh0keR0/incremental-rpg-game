import { describe, expect, test } from 'vitest';
import type { GameContext } from '../types.ts';
import { Unlocks } from './Unlocks.ts';

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

function makeUnlocks() {
  const { gameContext, events, simulateEvent } = makeContext();
  const unlocks = new Unlocks();
  unlocks.initialize(gameContext);
  return { unlocks, events, simulateEvent };
}

describe('Unlocks', () => {
  test('starts with nothing unlocked', () => {
    const { unlocks } = makeUnlocks();
    expect(unlocks.getState()).toEqual({ unlocked: [] });
    expect(unlocks.isUnlocked('inventory')).toBe(false);
  });

  test('unlocks inventory on the first inventoryUpdated event', () => {
    const { unlocks, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', { inventory: { slots: [] } });
    expect(unlocks.isUnlocked('inventory')).toBe(true);
    expect(unlocks.getState()).toEqual({ unlocked: ['inventory'] });
  });

  test('emits featureUnlocked when a feature unlocks', () => {
    const { events, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', { inventory: { slots: [] } });
    expect(events).toEqual([{ name: 'featureUnlocked', payload: { feature: 'inventory' } }]);
  });

  test('does not re-unlock or re-emit on subsequent trigger events', () => {
    const { unlocks, events, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', { inventory: { slots: [] } });
    simulateEvent('inventoryUpdated', { inventory: { slots: [] } });
    expect(unlocks.getState()).toEqual({ unlocked: ['inventory'] });
    expect(events).toHaveLength(1);
  });

  test('getState returns a copy, not the internal array', () => {
    const { unlocks, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', { inventory: { slots: [] } });
    const snapshot = unlocks.getState();
    snapshot.unlocked.push('inventory');
    expect(unlocks.getState()).toEqual({ unlocked: ['inventory'] });
  });

  test('save/load round-trips state', () => {
    const { unlocks, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', { inventory: { slots: [] } });
    const saved = unlocks.save();

    const restored = makeUnlocks().unlocks;
    restored.load(saved);
    expect(restored.getState()).toEqual(unlocks.getState());
    expect(restored.isUnlocked('inventory')).toBe(true);
  });
});
