import type { GameEventMap, GameEventName } from '../types.ts';

type AnyListener = (payload: unknown) => void;

export class EventEmitter {
  private readonly listeners = new Map<GameEventName, Set<AnyListener>>();

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
    // Copy so a listener unsubscribing mid-emit can't disturb iteration.
    for (const listener of [...set]) {
      listener(payload);
    }
  }
}
