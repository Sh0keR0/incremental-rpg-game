import { describe, expect, test } from 'vitest';
import { EventEmitter } from './emitter.ts';

describe('EventEmitter', () => {
    test('delivers a payload to every subscribed listener', () => {
        const emitter = new EventEmitter();
        const seen: number[] = [];
        emitter.on('leveledUp', (payload) => seen.push(payload.level));
        emitter.on('leveledUp', (payload) => seen.push(payload.level * 10));

        emitter.emit('leveledUp', { level: 2 });
        expect(seen).toEqual([2, 20]);
    });

    test('a returned unsubscribe stops further delivery', () => {
        const emitter = new EventEmitter();
        let calls = 0;
        const off = emitter.on('leveledUp', () => {
            calls += 1;
        });
        emitter.emit('leveledUp', { level: 1 });
        off();
        emitter.emit('leveledUp', { level: 1 });
        expect(calls).toBe(1);
    });

    test('warns (without throwing) when a cascade exceeds the configured depth', () => {
        const warnings: string[] = [];
        const emitter = new EventEmitter({
            warnDepth: 3,
            warn: (message) => warnings.push(message),
        });

        let count = 0;
        emitter.on('leveledUp', () => {
            count += 1;
            if (count < 10) emitter.emit('leveledUp', { level: count });
        });

        expect(() => emitter.emit('leveledUp', { level: 0 })).not.toThrow();
        expect(warnings).toHaveLength(1); // once per top-level cascade, not per nested emit
    });

    test('does not warn for cascades within the depth limit', () => {
        const warnings: string[] = [];
        const emitter = new EventEmitter({
            warnDepth: 3,
            warn: (message) => warnings.push(message),
        });
        emitter.on('leveledUp', () => {});

        emitter.emit('leveledUp', { level: 1 });
        expect(warnings).toEqual([]);
    });

    test('warnDepth 0 disables the guard entirely', () => {
        const warnings: string[] = [];
        const emitter = new EventEmitter({
            warnDepth: 0,
            warn: (message) => warnings.push(message),
        });

        let count = 0;
        emitter.on('leveledUp', () => {
            count += 1;
            if (count < 10) emitter.emit('leveledUp', { level: count });
        });

        emitter.emit('leveledUp', { level: 0 });
        expect(warnings).toEqual([]);
    });
});
