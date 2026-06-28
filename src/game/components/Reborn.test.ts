import { describe, expect, test } from 'vitest';
import { STAGES } from '../content/stages.ts';
import {
    attackMultiplier,
    CLEAVE_UNLOCK_COST,
    expMultiplier,
    expMultiplierCost,
    REBORN_UNLOCK_BOSS_TIER,
    remembrancePointsForBossTier,
} from '../systems/reborn.ts';
import { makeWorld, type WorldSeed } from '../testing/makeWorld.ts';
import { Player } from './Player.ts';
import { PlayerStats } from './PlayerStats.ts';
import { Reborn } from './Reborn.ts';
import { Stages } from './Stages.ts';

const UNLOCK_STAGE_ID = STAGES[REBORN_UNLOCK_BOSS_TIER].id;

function setup(seed: WorldSeed = {}) {
    const world = makeWorld({ seed });
    return { world, reborn: world.getComponent(Reborn) };
}

describe('Reborn', () => {
    test('killing the unlock-tier boss makes reborn available exactly once', () => {
        const { world, reborn } = setup();
        expect(reborn.getState().canReborn).toBe(false);

        world.emit('bossDefeated', { stageId: UNLOCK_STAGE_ID });
        expect(reborn.getState().canReborn).toBe(true);

        world.emit('bossDefeated', { stageId: UNLOCK_STAGE_ID });
        const availableEvents = world.events.filter((event) => event.name === 'rebornAvailable');
        expect(availableEvents).toHaveLength(1);
    });

    test('earlier bosses do not unlock reborn', () => {
        const { world, reborn } = setup();
        world.emit('bossDefeated', { stageId: STAGES[0].id });
        expect(reborn.getState().canReborn).toBe(false);
    });

    test('reborn awards points scaled by the highest boss tier killed', () => {
        const { world, reborn } = setup();
        world.emit('bossDefeated', { stageId: UNLOCK_STAGE_ID });
        world.clearEvents();

        world.runCommand('reborn', {});

        const expected = remembrancePointsForBossTier(REBORN_UNLOCK_BOSS_TIER);
        expect(reborn.getState().remembrancePoints).toBe(expected);
        const completed = world.events.find((event) => event.name === 'rebornCompleted');
        expect(completed?.payload).toEqual({ pointsAwarded: expected, total: expected });
        // The run-local tier resets, so a second reborn isn't immediately available.
        expect(reborn.getState().canReborn).toBe(false);
    });

    test('reborn resets player level, stat points, and stage progress', () => {
        const { world } = setup({
            player: { level: 6, exp: 25 },
            stats: { strength: 4, unspentPoints: 3 },
            stages: { currentStageId: UNLOCK_STAGE_ID, bossUnlocked: true },
        });
        world.emit('bossDefeated', { stageId: UNLOCK_STAGE_ID });

        world.runCommand('reborn', {});

        const player = world.getComponent(Player).getState();
        expect(player.level).toBe(1);
        expect(player.exp).toBe(0);
        const stats = world.getComponent(PlayerStats).getState();
        expect(stats).toEqual({
            unspentPoints: 0,
            stats: { strength: 0, agility: 0, endurance: 0 },
        });
        const stages = world.getComponent(Stages).getState();
        expect(stages.currentStageId).toBe(STAGES[0].id);
        expect(stages.unlockedStageIds).toEqual([STAGES[0].id]);
    });

    test('reborn is a no-op before the unlock tier is reached', () => {
        const { world, reborn } = setup();
        world.runCommand('reborn', {});
        expect(reborn.getState().remembrancePoints).toBe(0);
        expect(world.events.some((event) => event.name === 'rebornCompleted')).toBe(false);
    });

    test('buying the exp upgrade deducts its cost and raises the multiplier', () => {
        const { world, reborn } = setup({ reborn: { remembrancePoints: 1000 } });
        const firstCost = expMultiplierCost(0);

        world.runCommand('buyRebornUpgrade', { upgrade: 'expMultiplier' });
        expect(reborn.getState().remembrancePoints).toBe(1000 - firstCost);
        expect(reborn.getExpMultiplier()).toBeCloseTo(expMultiplier(1));

        const before = reborn.getState().remembrancePoints;
        const secondCost = expMultiplierCost(1);
        world.runCommand('buyRebornUpgrade', { upgrade: 'expMultiplier' });
        expect(reborn.getState().remembrancePoints).toBe(before - secondCost);
        expect(secondCost).toBeGreaterThan(firstCost);
        expect(reborn.getExpMultiplier()).toBeCloseTo(expMultiplier(2));
    });

    test('the attack upgrade raises the attack multiplier', () => {
        const { world, reborn } = setup({ reborn: { remembrancePoints: 1000 } });
        world.runCommand('buyRebornUpgrade', { upgrade: 'attackMultiplier' });
        expect(reborn.getAttackMultiplier()).toBeCloseTo(attackMultiplier(1));
    });

    test('an unaffordable upgrade purchase is rejected', () => {
        const { world, reborn } = setup({ reborn: { remembrancePoints: 0 } });
        expect(() => world.runCommand('buyRebornUpgrade', { upgrade: 'expMultiplier' })).toThrow();
        expect(reborn.getExpMultiplier()).toBe(expMultiplier(0));
    });

    test('cleave unlocks once for its cost and a second purchase is rejected', () => {
        const { world, reborn } = setup({ reborn: { remembrancePoints: CLEAVE_UNLOCK_COST } });
        world.runCommand('buyRebornUpgrade', { upgrade: 'cleave' });
        expect(reborn.isCleaveUnlocked()).toBe(true);
        expect(reborn.getState().remembrancePoints).toBe(0);

        expect(() => world.runCommand('buyRebornUpgrade', { upgrade: 'cleave' })).toThrow();
    });

    test('save/load round-trips points, upgrades, and the run-local tier', () => {
        const { world, reborn } = setup({ reborn: { remembrancePoints: 200 } });
        world.emit('bossDefeated', { stageId: UNLOCK_STAGE_ID });
        world.runCommand('buyRebornUpgrade', { upgrade: 'cleave' });
        const saved = reborn.save();

        const fresh = setup().reborn;
        fresh.load(saved);
        expect(fresh.isCleaveUnlocked()).toBe(true);
        expect(fresh.getState().remembrancePoints).toBe(reborn.getState().remembrancePoints);
        expect(fresh.getState().canReborn).toBe(true);
    });
});
