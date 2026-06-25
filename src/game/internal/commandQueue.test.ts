import { describe, expect, test } from 'vitest';
import { CommandQueue } from './commandQueue.ts';

describe('CommandQueue', () => {
  test('drain routes a queued command to its registered handler', () => {
    const queue = new CommandQueue();
    const received: string[] = [];
    queue.handle('allocateStat', (payload) => received.push(payload.statName));

    queue.enqueue('allocateStat', { statName: 'strength' });
    queue.drain();

    expect(received).toEqual(['strength']);
  });

  test('drains commands in enqueue order', () => {
    const queue = new CommandQueue();
    const order: string[] = [];
    queue.handle('attack', () => order.push('attack'));
    queue.handle('allocateStat', (payload) => order.push(payload.statName));

    queue.enqueue('attack', {});
    queue.enqueue('allocateStat', { statName: 'agility' });
    queue.drain();

    expect(order).toEqual(['attack', 'agility']);
  });

  test('a second drain does not re-run already-drained commands', () => {
    const queue = new CommandQueue();
    let runs = 0;
    queue.handle('attack', () => {
      runs += 1;
    });

    queue.enqueue('attack', {});
    queue.drain();
    queue.drain();

    expect(runs).toBe(1);
  });

  test('handlers can be registered after a command is enqueued', () => {
    const queue = new CommandQueue();
    let handled = false;
    queue.enqueue('attack', {});
    queue.handle('attack', () => {
      handled = true;
    });

    queue.drain();

    expect(handled).toBe(true);
  });

  test('throws when a command gets a second handler', () => {
    const queue = new CommandQueue();
    queue.handle('attack', () => {});
    expect(() => queue.handle('attack', () => {})).toThrow();
  });

  test('throws on drain when a queued command has no handler', () => {
    const queue = new CommandQueue();
    queue.enqueue('attack', {});
    expect(() => queue.drain()).toThrow();
  });
});
