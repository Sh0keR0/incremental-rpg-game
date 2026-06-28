import { describe, expect, test, vi } from 'vitest';
import { STAGES } from './content/stages.ts';
import { createGame, type Game } from './createGame.ts';
import { createMemoryStorage, type SaveStorage } from './persistence/storage.ts';

// Actions enqueue commands that the always-running loop drains on the next
// tick, so tests drive a manual frame pump: enqueue via an action, then tick().
function newGame() {
    let queuedFrame: (() => void) | null = null;
    let clock = 0;
    const game = createGame({
        rng: () => 0,
        now: () => clock,
        requestFrame: (callback) => {
            queuedFrame = callback;
            return 1;
        },
        cancelFrame: () => {
            queuedFrame = null;
        },
    });
    game.start();
    const tick = (deltaMs = 16): void => {
        clock += deltaMs;
        const frame = queuedFrame;
        queuedFrame = null;
        frame?.();
    };
    return { game, tick };
}

type GamePump = { game: Game; tick: (deltaMs?: number) => void };

// Each attack enqueues a command, so a tick must follow it to drain + apply.
// The manual attack has no cooldown, so a single tick per attack lands every
// one; we bank any earned stat points into strength so bosses stay beatable
// within their timer.
function attackUntil(pump: GamePump, done: () => boolean, limit = 5000): void {
    let safety = 0;
    while (!done() && safety++ < limit) {
        const unspentPoints = pump.game.getState().stats.unspentPoints;
        for (let point = 0; point < unspentPoints; point++) {
            pump.game.actions.allocateStat('strength');
        }
        pump.game.actions.attack();
        pump.tick();
    }
    if (safety >= limit) throw new Error('attackUntil exceeded its safety limit');
}

// This is a full-game integration test, so it exercises whatever enemy the game
// actually spawns. Expectations are derived from the live spawned enemy and the
// player's attack rather than hardcoded stats, so they survive content changes.

describe('createGame', () => {
    test('exposes initial player and enemy state', () => {
        const state = newGame().game.getState();
        expect(state.player.level).toBe(1);
        expect(state.combat.enemy.hp).toBe(state.combat.enemy.maxHp);
        expect(state.combat.enemy.name).toBeTruthy();
    });

    test('attack lowers enemy HP and notifies subscribers + events', () => {
        const { game, tick } = newGame();
        const { attack } = game.getState().player;
        const enemy = game.getState().combat.enemy;
        const onState = vi.fn();
        const onAttacked = vi.fn();
        game.subscribe(onState);
        game.on('attacked', onAttacked);

        game.actions.attack();
        tick();

        expect(game.getState().combat.enemy.hp).toBe(enemy.hp - attack);
        expect(onState).toHaveBeenCalledTimes(1);
        expect(onAttacked).toHaveBeenCalledWith({
            damage: attack,
            enemyHp: enemy.hp - attack,
            enemyName: enemy.name,
        });
    });

    test('killing an enemy awards EXP and respawns', () => {
        const { game, tick } = newGame();
        const { attack } = game.getState().player;
        const enemy = game.getState().combat.enemy;
        const hitsToKill = Math.ceil(enemy.maxHp / attack);
        const onDefeated = vi.fn();
        game.on('enemyDefeated', onDefeated);

        for (let hit = 0; hit < hitsToKill; hit++) {
            game.actions.attack();
            tick();
        }

        expect(onDefeated).toHaveBeenCalledWith({
            name: enemy.name,
            expReward: enemy.expReward,
            drops: enemy.drops, // rng: () => 0 rolls every drop
            isBoss: false,
        });
        expect(game.getState().combat.enemy.hp).toBe(game.getState().combat.enemy.maxHp); // fresh enemy
    });

    test('killing an enemy drops its loot into the inventory', () => {
        const { game, tick } = newGame();
        const { attack } = game.getState().player;
        const enemy = game.getState().combat.enemy;
        const hitsToKill = Math.ceil(enemy.maxHp / attack);

        for (let hit = 0; hit < hitsToKill; hit++) {
            game.actions.attack();
            tick();
        }

        // Inventory reacts to enemyDefeated; rng: () => 0 rolls every drop.
        const itemsInBag = game.getState().inventory.slots.flat().filter(Boolean);
        for (const drop of enemy.drops) {
            expect(itemsInBag).toContain(drop.itemId);
        }
    });

    test('accumulated EXP eventually levels the player up', () => {
        const { game, tick } = newGame();
        const onLevelUp = vi.fn();
        game.on('leveledUp', onLevelUp);

        let safety = 0;
        while (game.getState().player.level < 2 && safety++ < 1000) {
            game.actions.attack();
            tick();
        }

        expect(onLevelUp).toHaveBeenCalledWith({ level: 2 });
        expect(game.getState().player.level).toBe(2);
    });

    test('initial snapshot includes default stats', () => {
        const state = newGame().game.getState();
        expect(state.stats).toEqual({
            unspentPoints: 0,
            stats: { strength: 0, agility: 0, endurance: 0 },
        });
    });

    test('level up awards stat points and allocateStat spends them', () => {
        const { game, tick } = newGame();

        let safety = 0;
        while (game.getState().player.level < 2 && safety++ < 1000) {
            game.actions.attack();
            tick();
        }

        // Synchronous events: the point awarded by the leveledUp reaction lands in
        // the same tick/snapshot as the level-up — no one-frame lag.
        expect(game.getState().stats.unspentPoints).toBe(1);

        game.actions.allocateStat('strength');
        tick();
        expect(game.getState().stats.stats.strength).toBe(1);
        expect(game.getState().stats.unspentPoints).toBe(0);
    });

    test('no features are unlocked initially', () => {
        expect(newGame().game.getState().unlocks).toEqual({ unlocked: [] });
    });

    test('inventory unlocks and featureUnlocked fires once an enemy drops an item', () => {
        const pump = newGame();
        const onUnlocked = vi.fn();
        pump.game.on('featureUnlocked', onUnlocked);

        // rng: () => 0 rolls every drop, so the first kill yields loot.
        expect(pump.game.getState().combat.enemy.drops.length).toBeGreaterThan(0);
        attackUntil(pump, () => pump.game.getState().unlocks.unlocked.includes('inventory'));

        expect(pump.game.getState().unlocks.unlocked).toContain('inventory');
        expect(onUnlocked).toHaveBeenCalledWith({ feature: 'inventory' });
    });

    test('exp unlocks after the first kill grants experience', () => {
        const pump = newGame();
        attackUntil(pump, () => pump.game.getState().unlocks.unlocked.includes('exp'));
        expect(pump.game.getState().unlocks.unlocked).toContain('exp');
    });

    test('stats unlocks after the first level-up awards a point', () => {
        const pump = newGame();
        attackUntil(pump, () => pump.game.getState().unlocks.unlocked.includes('stats'));
        expect(pump.game.getState().player.level).toBeGreaterThanOrEqual(2);
        expect(pump.game.getState().unlocks.unlocked).toContain('stats');
    });

    test('stage unlocks once the boss becomes available', () => {
        const pump = newGame();
        attackUntil(pump, () => pump.game.getState().stages.bossUnlocked);
        expect(pump.game.getState().unlocks.unlocked).toContain('stage');
    });

    test('statsChanged event fires on level up', () => {
        const { game, tick } = newGame();
        const onStatsChanged = vi.fn();
        game.on('statsChanged', onStatsChanged);

        let safety = 0;
        while (game.getState().player.level < 2 && safety++ < 1000) {
            game.actions.attack();
            tick();
        }

        expect(onStatsChanged).toHaveBeenCalledWith(expect.objectContaining({ unspentPoints: 1 }));
    });
});

describe('createGame save/load', () => {
    // Same manual frame pump as newGame(), but with an injectable storage so two
    // game instances can share one save and we can assert a persistence round-trip.
    function pumpWith(storage: SaveStorage) {
        let queuedFrame: (() => void) | null = null;
        let clock = 0;
        const game = createGame({
            storage,
            rng: () => 0,
            now: () => clock,
            requestFrame: (callback) => {
                queuedFrame = callback;
                return 1;
            },
            cancelFrame: () => {
                queuedFrame = null;
            },
        });
        game.start();
        const tick = (deltaMs = 16): void => {
            clock += deltaMs;
            const frame = queuedFrame;
            queuedFrame = null;
            frame?.();
        };
        return { game, tick };
    }

    test('load returns false and hasSave is false with empty storage', () => {
        const game = createGame({ storage: createMemoryStorage() });
        expect(game.hasSave()).toBe(false);
        expect(game.load()).toBe(false);
    });

    test('save then load into a fresh game restores the full snapshot', () => {
        const storage = createMemoryStorage();

        const first = pumpWith(storage);
        // Mutate state across several attacks so the snapshot is non-default.
        for (let hit = 0; hit < 10; hit++) {
            first.game.actions.attack();
            first.tick();
        }
        const expected = first.game.getState();
        first.game.save();
        expect(storage.read()).not.toBeNull();

        const second = pumpWith(storage);
        expect(second.game.hasSave()).toBe(true);
        expect(second.game.load()).toBe(true);
        expect(second.game.getState()).toEqual(expected);
    });
});

describe('createGame stage system', () => {
    const FIRST = STAGES[0];
    const SECOND = STAGES[1];

    test('starts on the first stage with the boss locked', () => {
        const state = newGame().game.getState();
        expect(state.stages.currentStageId).toBe(FIRST.id);
        expect(state.stages.bossUnlocked).toBe(false);
        expect(state.combat.isBoss).toBe(false);
    });

    test('clearing enough enemies unlocks the boss', () => {
        const pump = newGame();
        const onUnlocked = vi.fn();
        pump.game.on('bossUnlocked', onUnlocked);

        attackUntil(pump, () => pump.game.getState().stages.bossUnlocked);

        expect(onUnlocked).toHaveBeenCalledWith({ stageId: FIRST.id });
    });

    test('fightBoss is ignored until the boss is unlocked', () => {
        const pump = newGame();
        pump.game.actions.fightBoss();
        pump.tick();
        expect(pump.game.getState().stages.mode).toBe('normal');
        expect(pump.game.getState().combat.isBoss).toBe(false);
    });

    test('fighting and defeating the boss unlocks and advances to the next stage', () => {
        const pump = newGame();
        const onStageUnlocked = vi.fn();
        pump.game.on('stageUnlocked', onStageUnlocked);

        attackUntil(pump, () => pump.game.getState().stages.bossUnlocked);
        pump.game.actions.fightBoss();
        pump.tick();
        expect(pump.game.getState().combat.isBoss).toBe(true);

        attackUntil(pump, () => pump.game.getState().stages.currentStageId !== FIRST.id);

        expect(pump.game.getState().stages.currentStageId).toBe(SECOND.id);
        expect(pump.game.getState().combat.isBoss).toBe(false); // back to normal enemies
        expect(onStageUnlocked).toHaveBeenCalledWith({ stageId: SECOND.id });
    });

    test('defeating the first boss unlocks auto-attack', () => {
        const pump = newGame();
        const onBossDefeated = vi.fn();
        pump.game.on('bossDefeated', onBossDefeated);

        expect(pump.game.getState().unlocks.unlocked).not.toContain('autoAttack');

        attackUntil(pump, () => pump.game.getState().stages.bossUnlocked);
        pump.game.actions.fightBoss();
        pump.tick();
        attackUntil(pump, () => pump.game.getState().stages.currentStageId !== FIRST.id);

        expect(onBossDefeated).toHaveBeenCalledWith({ stageId: FIRST.id });
        expect(pump.game.getState().unlocks.unlocked).toContain('autoAttack');
    });

    test('enabled auto-attack lands hits on its cooldown without manual input', () => {
        const pump = newGame();
        pump.game.actions.toggleAutoAttack();
        pump.tick();
        expect(pump.game.getState().combat.autoAttackEnabled).toBe(true);

        const cooldownMs = pump.game.getState().combat.autoAttackCooldownMs;
        const startHp = pump.game.getState().combat.enemy.hp;
        pump.tick(cooldownMs); // a full cooldown elapses, so one auto-hit lands
        expect(pump.game.getState().combat.enemy.hp).toBeLessThan(startHp);
    });

    test('defeating the boss spawns exactly one replacement enemy (no double spawn)', () => {
        const pump = newGame();
        attackUntil(pump, () => pump.game.getState().stages.bossUnlocked);
        pump.game.actions.fightBoss();
        pump.tick();
        expect(pump.game.getState().combat.isBoss).toBe(true);

        // Listen only across the killing blow: the boss is already up, so the sole
        // spawn during this window is the single normal enemy that replaces it.
        // A regression that re-emitted stageSelected from completeBossFight would
        // spawn twice and trip this.
        const onSpawned = vi.fn();
        pump.game.on('enemySpawned', onSpawned);
        attackUntil(pump, () => pump.game.getState().stages.currentStageId !== FIRST.id);

        expect(onSpawned).toHaveBeenCalledTimes(1);
        expect(pump.game.getState().combat.isBoss).toBe(false);
    });

    test('player can move back to an earlier unlocked stage, keeping its progress', () => {
        const pump = newGame();
        attackUntil(pump, () => pump.game.getState().stages.bossUnlocked);
        pump.game.actions.fightBoss();
        pump.tick();
        attackUntil(pump, () => pump.game.getState().stages.currentStageId === SECOND.id);

        pump.game.actions.selectStage(FIRST.id);
        pump.tick();
        expect(pump.game.getState().stages.currentStageId).toBe(FIRST.id);
        expect(pump.game.getState().stages.bossUnlocked).toBe(true); // first stage stayed cleared
    });

    test('selecting a locked stage does nothing', () => {
        const pump = newGame();
        const last = STAGES[STAGES.length - 1];
        pump.game.actions.selectStage(last.id);
        pump.tick();
        expect(pump.game.getState().stages.currentStageId).toBe(FIRST.id);
    });

    test('letting the boss timer expire fails the fight and returns to normal enemies', () => {
        const pump = newGame();
        attackUntil(pump, () => pump.game.getState().stages.bossUnlocked);
        pump.game.actions.fightBoss();
        pump.tick();
        expect(pump.game.getState().stages.mode).toBe('boss');

        const onFailed = vi.fn();
        pump.game.on('bossFailed', onFailed);
        // One long frame drains the boss timer in Stages.onTick.
        pump.tick(FIRST.bossTimeLimitMs + 1000);

        expect(pump.game.getState().stages.mode).toBe('normal');
        expect(pump.game.getState().combat.isBoss).toBe(false);
        expect(onFailed).toHaveBeenCalledWith({ stageId: FIRST.id });
    });
});
