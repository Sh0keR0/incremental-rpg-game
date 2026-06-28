import { beforeEach, describe, expect, test } from 'vitest';
import { GameCore, type GameCoreOptions } from './GameCore.ts';
import type { GameContext, IGameComponent } from './types.ts';

class Counter implements IGameComponent {
    readonly id = 'counter';
    initialized = false;
    elapsed = 0;
    gameContext!: GameContext;

    initialize(gameContext: GameContext): void {
        this.initialized = true;
        this.gameContext = gameContext;
    }

    onTick(deltaMs: number): void {
        this.elapsed += deltaMs;
    }

    save(): unknown {
        return { elapsed: this.elapsed };
    }

    load(data: unknown): void {
        this.elapsed = (data as { elapsed: number }).elapsed;
    }
}

class Noop implements IGameComponent {
    readonly id = 'noop';
}

function makeHarness(): GameCoreOptions & { step(dt: number): void } {
    let queued: (() => void) | null = null;
    let handle = 0;
    let clock = 0;
    return {
        components: [Counter, Noop],
        rng: () => 0,
        now: () => clock,
        requestFrame: (callback) => {
            queued = callback;
            return ++handle;
        },
        cancelFrame: () => {
            queued = null;
        },
        step(deltaMs) {
            clock += deltaMs;
            const callback = queued;
            queued = null;
            callback?.();
        },
    };
}

let harness: ReturnType<typeof makeHarness>;

beforeEach(() => {
    harness = makeHarness();
});

describe('GameCore', () => {
    test('instantiates and initializes every component', () => {
        const core = new GameCore(harness);
        expect(core.getGameComponent(Counter).initialized).toBe(true);
        expect(core.getGameComponent(Counter)).toBeInstanceOf(Counter);
    });

    test('throws when looking up an unregistered component', () => {
        const core = new GameCore(harness);
        class Missing implements IGameComponent {
            readonly id = 'missing';
        }
        expect(() => core.getGameComponent(Missing)).toThrow();
    });

    test('events emitted during a tick are delivered before the render', () => {
        const order: string[] = [];
        class Emitter implements IGameComponent {
            readonly id = 'emitter';
            private gameContext!: GameContext;
            initialize(gameContext: GameContext): void {
                this.gameContext = gameContext;
            }
            onTick(): void {
                this.gameContext.emit('leveledUp', { level: 2 });
            }
        }
        const core = new GameCore({ ...harness, components: [Emitter] });
        core.on('leveledUp', () => order.push('event'));
        core.subscribe(() => order.push('render'));

        core.tick(16);
        expect(order).toEqual(['event', 'render']);
    });

    test('start/stop drives onTick via injected frames', () => {
        const core = new GameCore(harness);
        const counter = core.getGameComponent(Counter);
        core.start();

        harness.step(16);
        harness.step(10);
        expect(counter.elapsed).toBe(26);

        core.stop();
        harness.step(100);
        expect(counter.elapsed).toBe(26);
    });

    test('routes an enqueued command to a handler a component registered in initialize', () => {
        const attacks: number[] = [];
        class Attacker implements IGameComponent {
            readonly id = 'attacker';
            initialize(gameContext: GameContext): void {
                gameContext.handle('attack', () => attacks.push(1));
            }
        }
        const core = new GameCore({ ...harness, components: [Attacker] });

        core.enqueueCommand('attack', {});
        expect(attacks).toEqual([]); // not applied until drained
        core.drainCommands();
        expect(attacks).toEqual([1]);
    });

    test('tick drains queued commands before running onTick', () => {
        const order: string[] = [];
        class Recorder implements IGameComponent {
            readonly id = 'recorder';
            initialize(gameContext: GameContext): void {
                gameContext.handle('attack', () => order.push('command'));
            }
            onTick(): void {
                order.push('tick');
            }
        }
        const core = new GameCore({ ...harness, components: [Recorder] });

        core.enqueueCommand('attack', {});
        core.tick(16);
        expect(order).toEqual(['command', 'tick']);
    });

    test('tick renders subscribers exactly once', () => {
        const core = new GameCore({ ...harness, components: [Noop] });
        let renders = 0;
        core.subscribe(() => {
            renders += 1;
        });
        core.tick(16);
        expect(renders).toBe(1);
    });

    test('save aggregates by id and load distributes back', () => {
        const core = new GameCore(harness);
        core.start();
        harness.step(50);

        const saved = core.save();
        expect(saved).toEqual({ counter: { elapsed: 50 } });

        const restored = new GameCore(harness);
        restored.load(saved);
        expect(restored.getGameComponent(Counter).elapsed).toBe(50);
    });
});
