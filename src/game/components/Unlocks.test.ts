import { describe, expect, test } from 'vitest';
import { makeTestContext } from '../testing/makeTestContext.ts';
import { Unlocks } from './Unlocks.ts';

const sampleInventory = { inventory: { slots: [] } };

function makeUnlocks() {
  const context = makeTestContext();
  const unlocks = new Unlocks();
  unlocks.initialize(context.gameContext);
  return { unlocks, events: context.events, simulateEvent: context.simulateEvent };
}

describe('Unlocks', () => {
  test('starts with nothing unlocked', () => {
    const { unlocks } = makeUnlocks();
    expect(unlocks.getState()).toEqual({ unlocked: [] });
    expect(unlocks.isUnlocked('inventory')).toBe(false);
  });

  test('unlocks inventory on the first inventoryUpdated event', () => {
    const { unlocks, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', sampleInventory);
    expect(unlocks.isUnlocked('inventory')).toBe(true);
    expect(unlocks.getState()).toEqual({ unlocked: ['inventory'] });
  });

  test('emits featureUnlocked when a feature unlocks', () => {
    const { events, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', sampleInventory);
    expect(events).toEqual([{ name: 'featureUnlocked', payload: { feature: 'inventory' } }]);
  });

  test('does not re-unlock or re-emit on subsequent trigger events', () => {
    const { unlocks, events, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', sampleInventory);
    simulateEvent('inventoryUpdated', sampleInventory);
    expect(unlocks.getState()).toEqual({ unlocked: ['inventory'] });
    expect(events).toHaveLength(1);
  });

  test('getState returns a copy, not the internal array', () => {
    const { unlocks, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', sampleInventory);
    const snapshot = unlocks.getState();
    snapshot.unlocked.push('inventory');
    expect(unlocks.getState()).toEqual({ unlocked: ['inventory'] });
  });

  test('save/load round-trips state', () => {
    const { unlocks, simulateEvent } = makeUnlocks();
    simulateEvent('inventoryUpdated', sampleInventory);
    const saved = unlocks.save();

    const restored = makeUnlocks().unlocks;
    restored.load(saved);
    expect(restored.getState()).toEqual(unlocks.getState());
    expect(restored.isUnlocked('inventory')).toBe(true);
  });
});
