import { describe, expect, test } from 'vitest';
import { makeTestContext } from '../testing/makeTestContext.ts';
import Inventory from './Inventory.ts';

function makeInventory() {
  const { gameContext, events, simulateEvent } = makeTestContext();
  const inventory = new Inventory();
  inventory.initialize(gameContext);
  return { inventory, events, simulateEvent };
}

describe('Inventory', () => {
  test('starts empty with a 5x5 grid of undefined slots', () => {
    const { inventory } = makeInventory();
    const { slots } = inventory.getState();
    expect(slots.length).toBe(5);
    expect(slots.every((row) => row.length === 5)).toBe(true);
    expect(slots.flat().every((slot) => slot === undefined)).toBe(true);
    expect(inventory.isInventoryFull()).toBe(false);
  });

  test('add places the item in the first available slot and emits inventoryUpdated', () => {
    const { inventory, events } = makeInventory();
    const added = inventory.add('WoodenSword');

    expect(added).toBe(true);
    expect(inventory.getState().slots[0][0]).toBe('WoodenSword');
    expect(events).toEqual([
      { name: 'inventoryUpdated', payload: { inventory: inventory.getState() } },
    ]);
  });

  test('add fills slots left-to-right, top-to-bottom', () => {
    const { inventory } = makeInventory();
    inventory.add('WoodenSword');
    inventory.add('ShortSword');

    const { slots } = inventory.getState();
    expect(slots[0][0]).toBe('WoodenSword');
    expect(slots[0][1]).toBe('ShortSword');
  });

  test('add throws for an unknown item id', () => {
    const { inventory } = makeInventory();
    expect(() => inventory.add('NotARealItem')).toThrow('Item with id NotARealItem not found.');
  });

  test('add returns false and does not emit when the inventory is full', () => {
    const { inventory, events } = makeInventory();
    for (let slot = 0; slot < 25; slot++) {
      inventory.add('WoodenSword');
    }
    expect(inventory.isInventoryFull()).toBe(true);

    const eventsBefore = events.length;
    const added = inventory.add('ShortSword');

    expect(added).toBe(false);
    expect(events.length).toBe(eventsBefore);
  });

  test('save/load round-trips the inventory state', () => {
    const { inventory } = makeInventory();
    inventory.add('WoodenSword');
    inventory.add('ShortSword');
    const saved = inventory.save();

    const restored = makeInventory().inventory;
    restored.load(saved as ReturnType<Inventory['getState']>);
    expect(restored.getState()).toEqual(inventory.getState());
  });
});
