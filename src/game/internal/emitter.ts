import type { GameEventMap, GameEventName } from '../types.ts';

type AnyListener = (payload: unknown) => void;

export interface EventEmitterOptions {
    // Log (never throw) when a synchronous event cascade nests deeper than this,
    // surfacing accidental cycles in dev. Set to 0 to disable. Default 50.
    warnDepth?: number;
    warn?: (message: string) => void;
}

export class EventEmitter {
    private readonly listeners = new Map<GameEventName, Set<AnyListener>>();
    private readonly warnDepth: number;
    private readonly warn: (message: string) => void;
    private depth = 0;
    private warnedThisCascade = false;

    constructor(options: EventEmitterOptions = {}) {
        this.warnDepth = options.warnDepth ?? 50;
        this.warn = options.warn ?? ((message) => console.warn(message));
    }

    on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void {
        let set = this.listeners.get(name);
        if (!set) {
            set = new Set();
            this.listeners.set(name, set);
        }
        const wrapped = listener as AnyListener;
        set.add(wrapped);
        return () => {
            set.delete(wrapped);
        };
    }

    emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
        const set = this.listeners.get(name);
        if (!set) return;
        this.depth += 1;
        if (this.warnDepth > 0 && this.depth > this.warnDepth && !this.warnedThisCascade) {
            this.warnedThisCascade = true;
            this.warn(
                `Event cascade exceeded depth ${this.warnDepth} (at '${String(name)}') — possible cycle. Logged only, not enforced.`,
            );
        }
        try {
            // Copy so a listener unsubscribing mid-emit can't disturb iteration.
            for (const listener of [...set]) {
                listener(payload);
            }
        } finally {
            this.depth -= 1;
            if (this.depth === 0) {
                this.warnedThisCascade = false;
            }
        }
    }
}
