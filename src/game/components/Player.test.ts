import { describe, expect, test } from 'vitest';
import { expForLevel } from '../systems/progression.ts';
import { makeTestContext } from '../testing/makeTestContext.ts';
import { DEFAULT_PLAYER_ATTACK, Player } from './Player.ts';

function makePlayer() {
    const { gameContext, events, simulateEvent } = makeTestContext();
    const player = new Player();
    player.initialize(gameContext);
    return { player, events, simulateEvent };
}

describe('Player', () => {
    test('starts at level 1 with base stats', () => {
        const { player } = makePlayer();
        expect(player.getState()).toEqual({
            level: 1,
            exp: 0,
            expToNext: expForLevel(1),
            attack: DEFAULT_PLAYER_ATTACK,
        });
        expect(player.getAttack()).toBe(DEFAULT_PLAYER_ATTACK);
    });

    test('gainExp accumulates and emits expGained without leveling', () => {
        const { player, events } = makePlayer();
        const belowThreshold = expForLevel(1) - 1;
        player.gainExp(belowThreshold);
        expect(player.getState()).toMatchObject({ level: 1, exp: belowThreshold });
        expect(events).toEqual([
            {
                name: 'expGained',
                payload: { amount: belowThreshold, exp: belowThreshold, expToNext: expForLevel(1) },
            },
        ]);
    });

    test('gainExp levels up and emits one leveledUp per level', () => {
        const { player, events } = makePlayer();
        const remainder = 10;
        // Enough to clear levels 2, 3 and 4 with some EXP to spare, derived from the curve.
        player.gainExp(expForLevel(1) + expForLevel(2) + expForLevel(3) + remainder);
        expect(player.getState()).toMatchObject({ level: 4, exp: remainder });
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
        player.gainExp(expForLevel(1) + 3); // level 2, exp 3
        const saved = player.save();

        const restored = makePlayer().player;
        restored.load(saved);
        expect(restored.getState()).toEqual(player.getState());
    });
});
