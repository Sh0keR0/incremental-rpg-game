import { CommandQueue } from './internal/commandQueue.ts';
import { EventEmitter } from './internal/emitter.ts';
import type {
  ComponentClass,
  GameCommandMap,
  GameCommandName,
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
  // Optional dev aid: log (never throw) when an event cascade nests this deep.
  // 0 disables it. See EventEmitter.
  cascadeWarnDepth?: number;
  // Optional test/dev seam: observe every event at emit time, before it is
  // dispatched to listeners. Fires in true cascade order (parent before
  // children) so a harness can record an ordered log. Never used in production.
  observeEvent?: <K extends GameEventName>(name: K, payload: GameEventMap[K]) => void;
}

export class GameCore {
  private readonly components = new Map<ComponentClass, IGameComponent>();
  private readonly emitter: EventEmitter;
  private readonly commandQueue = new CommandQueue();
  private readonly stateListeners = new Set<() => void>();
  private readonly gameContext: GameContext;

  private readonly now: () => number;
  private readonly requestFrame: (callback: () => void) => number;
  private readonly cancelFrame: (handle: number) => void;

  private frameHandle: number | null = null;
  private lastNow = 0;

  constructor(options: GameCoreOptions) {
    const rng = options.rng ?? Math.random;
    this.emitter = new EventEmitter({ warnDepth: options.cascadeWarnDepth });
    this.now = options.now ?? (() => performance.now());
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));

    const observeEvent = options.observeEvent;
    this.gameContext = {
      rng,
      emit: (name, payload) => {
        observeEvent?.(name, payload);
        this.emitter.emit(name, payload);
      },
      on: (name, listener) => this.emitter.on(name, listener),
      enqueue: (name, payload) => this.commandQueue.enqueue(name, payload),
      handle: (name, handler) => this.commandQueue.handle(name, handler),
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

  enqueueCommand<K extends GameCommandName>(name: K, payload: GameCommandMap[K]): void {
    this.commandQueue.enqueue(name, payload);
  }

  drainCommands(): void {
    this.commandQueue.drain();
  }

  subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  // One frame of the game: apply queued player intents, then run time-based
  // progression. Events emitted along the way fire synchronously and cascade,
  // so by the time we render the whole frame has settled. Commands drain before
  // onTick so input queued since the last frame lands this frame.
  tick(deltaMs: number): void {
    this.drainCommands();
    for (const component of this.components.values()) {
      component.onTick?.(deltaMs);
    }
    for (const listener of [...this.stateListeners]) {
      listener();
    }
  }

  start(): void {
    if (this.frameHandle !== null) return;
    this.lastNow = this.now();
    const frame = (): void => {
      const current = this.now();
      const deltaMs = current - this.lastNow;
      this.lastNow = current;
      this.tick(deltaMs);
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
}
