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

  test('dispatch notifies subscribers before flushing events', () => {
    const core = new GameCore(harness);
    const order: string[] = [];
    core.subscribe(() => order.push('state'));
    core.on('leveledUp', () => order.push('event'));

    core.dispatch(() => {
      core.getGameComponent(Counter).gameContext.emit('leveledUp', { level: 2 });
    });
    expect(order).toEqual(['state', 'event']);
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
