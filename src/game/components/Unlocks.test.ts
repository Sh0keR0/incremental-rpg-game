import { describe, expect, test } from 'vitest';
import { makeTestContext } from '../testing/makeTestContext.ts';
import { Unlocks } from './Unlocks.ts';

const sampleInventory = { inventory: { slots: [] } };
const sampleExp = { amount: 1, exp: 1, expToNext: 10 };
const sampleStats = { stats: { strength: 0, agility: 0, endurance: 0 }, unspentPoints: 1 };

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

    test('unlocks exp on the first expGained event', () => {
        const { unlocks, simulateEvent } = makeUnlocks();
        simulateEvent('expGained', sampleExp);
        expect(unlocks.isUnlocked('exp')).toBe(true);
    });

    test('unlocks stats on the first statsChanged event', () => {
        const { unlocks, simulateEvent } = makeUnlocks();
        simulateEvent('statsChanged', sampleStats);
        expect(unlocks.isUnlocked('stats')).toBe(true);
    });

    test('unlocks inventory on the first inventoryUpdated event', () => {
        const { unlocks, simulateEvent } = makeUnlocks();
        simulateEvent('inventoryUpdated', sampleInventory);
        expect(unlocks.isUnlocked('inventory')).toBe(true);
    });

    test('unlocks stage on the first bossUnlocked event', () => {
        const { unlocks, simulateEvent } = makeUnlocks();
        simulateEvent('bossUnlocked', { stageId: 'stage-1' });
        expect(unlocks.isUnlocked('stage')).toBe(true);
    });

    test('unlocks auto-attack on the first bossDefeated event', () => {
        const { unlocks, simulateEvent } = makeUnlocks();
        expect(unlocks.isUnlocked('autoAttack')).toBe(false);
        simulateEvent('bossDefeated', { stageId: 'stage-1' });
        expect(unlocks.isUnlocked('autoAttack')).toBe(true);
    });

    test('emits featureUnlocked when a feature unlocks', () => {
        const { events, simulateEvent } = makeUnlocks();
        simulateEvent('inventoryUpdated', sampleInventory);
        expect(events).toEqual([{ name: 'featureUnlocked', payload: { feature: 'inventory' } }]);
    });

    test('unlocks features independently as their triggers fire', () => {
        const { unlocks, events, simulateEvent } = makeUnlocks();
        simulateEvent('expGained', sampleExp);
        simulateEvent('inventoryUpdated', sampleInventory);
        expect(unlocks.getState()).toEqual({ unlocked: ['exp', 'inventory'] });
        expect(events).toEqual([
            { name: 'featureUnlocked', payload: { feature: 'exp' } },
            { name: 'featureUnlocked', payload: { feature: 'inventory' } },
        ]);
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
