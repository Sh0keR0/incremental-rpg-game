import { EventEmitter } from './internal/emitter.ts';
import type {
  ComponentClass,
  GameContext,
  GameEventMap,
  GameEventName,
  IGameComponent,
} from './types.ts';

export interface GameCoreOptions {
  components: ComponentClass[];
  rng?: () => number;
  now?: () => number;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

export class GameCore {
  private readonly components = new Map<ComponentClass, IGameComponent>();
  private readonly emitter = new EventEmitter();
  private readonly stateListeners = new Set<() => void>();
  private readonly gameContext: GameContext;

  private readonly now: () => number;
  private readonly requestFrame: (callback: () => void) => number;
  private readonly cancelFrame: (handle: number) => void;

  private frameHandle: number | null = null;
  private lastNow = 0;
  private dispatchDepth = 0;
  private readonly eventQueue: Array<() => void> = [];

  constructor(options: GameCoreOptions) {
    const rng = options.rng ?? Math.random;
    this.now = options.now ?? (() => performance.now());
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));

    this.gameContext = {
      rng,
      emit: (name, payload) => this.queueEvent(name, payload),
      on: (name, listener) => this.emitter.on(name, listener),
      getGameComponent: (componentClass) => this.getGameComponent(componentClass),
    };

    for (const Component of options.components) {
      this.components.set(Component, new Component());
    }
    for (const component of this.components.values()) {
      component.initialize?.(this.gameContext);
    }
  }

  getGameComponent<T extends IGameComponent>(componentClass: ComponentClass<T>): T {
    const component = this.components.get(componentClass);
    if (!component) {
      throw new Error(`Game component not registered: ${componentClass.name}`);
    }
    return component as T;
  }

  on<K extends GameEventName>(name: K, listener: (payload: GameEventMap[K]) => void): () => void {
    return this.emitter.on(name, listener);
  }

  subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  // Transaction: run the mutation, then notify subscribers, then flush events,
  // so the UI renders settled state before transient FX fire.
  dispatch(mutator: () => void): void {
    this.dispatchDepth += 1;
    try {
      mutator();
    } finally {
      this.dispatchDepth -= 1;
    }
    if (this.dispatchDepth === 0) {
      for (const listener of [...this.stateListeners]) {
        listener();
      }
      this.flushEvents();
    }
  }

  start(): void {
    if (this.frameHandle !== null) return;
    this.lastNow = this.now();
    const frame = (): void => {
      const current = this.now();
      const deltaMs = current - this.lastNow;
      this.lastNow = current;
      this.dispatch(() => {
        for (const component of this.components.values()) {
          component.onTick?.(deltaMs);
        }
      });
      this.frameHandle = this.requestFrame(frame);
    };
    this.frameHandle = this.requestFrame(frame);
  }

  stop(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  save(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const component of this.components.values()) {
      if (component.save) {
        data[component.id] = component.save();
      }
    }
    return data;
  }

  load(data: Record<string, unknown>): void {
    for (const component of this.components.values()) {
      const componentData = data[component.id];
      if (componentData !== undefined) {
        component.load?.(componentData);
      }
    }
  }

  private queueEvent<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
    if (this.dispatchDepth === 0) {
      this.emitter.emit(name, payload);
      return;
    }
    this.eventQueue.push(() => this.emitter.emit(name, payload));
  }

  private flushEvents(): void {
    const queued = this.eventQueue.splice(0);
    for (const emitQueuedEvent of queued) {
      emitQueuedEvent();
    }
  }
}
