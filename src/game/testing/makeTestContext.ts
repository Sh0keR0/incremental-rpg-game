import type {
  ComponentClass,
  GameCommandMap,
  GameCommandName,
  GameContext,
  GameEventMap,
  GameEventName,
  IGameComponent,
} from '../types.ts';

interface Captured<NameType> {
  name: NameType;
  payload: unknown;
}

export interface TestContextOptions {
  rng?: () => number;
  getGameComponent?: <T extends IGameComponent>(componentClass: ComponentClass<T>) => T;
}

export interface TestContext {
  gameContext: GameContext;
  // Facts the component emitted, in order. `emit` captures here; it does NOT
  // deliver to listeners — use simulateEvent for that (keeps unit tests isolated).
  events: Captured<GameEventName>[];
  // Commands the component enqueued, in order.
  commands: Captured<GameCommandName>[];
  // Deliver an external fact to the listeners the component registered via on().
  simulateEvent<K extends GameEventName>(name: K, payload: GameEventMap[K]): void;
  // Invoke the command handler the component registered via handle().
  runCommand<K extends GameCommandName>(name: K, payload: GameCommandMap[K]): void;
}

// A faithful in-memory GameContext for unit-testing a single component in
// isolation. emit/enqueue are captured (not routed); on/handle are recorded so
// the test can drive the component with simulateEvent/runCommand. For
// cross-component behaviour use a real createGame integration instead.
export function makeTestContext(options: TestContextOptions = {}): TestContext {
  const events: Captured<GameEventName>[] = [];
  const commands: Captured<GameCommandName>[] = [];
  const listeners = new Map<GameEventName, Set<(payload: unknown) => void>>();
  const handlers = new Map<GameCommandName, (payload: unknown) => void>();

  const gameContext: GameContext = {
    rng: options.rng ?? (() => 0),
    emit: (name, payload) => {
      events.push({ name, payload });
    },
    on: (name, listener) => {
      let set = listeners.get(name);
      if (!set) {
        set = new Set();
        listeners.set(name, set);
      }
      const wrapped = listener as (payload: unknown) => void;
      set.add(wrapped);
      return () => {
        set.delete(wrapped);
      };
    },
    enqueue: (name, payload) => {
      commands.push({ name, payload });
    },
    handle: (name, handler) => {
      handlers.set(name, handler as (payload: unknown) => void);
    },
    getGameComponent:
      options.getGameComponent ??
      (() => {
        throw new Error('getGameComponent not available in this test');
      }),
  };

  return {
    gameContext,
    events,
    commands,
    simulateEvent: (name, payload) => {
      for (const listener of listeners.get(name) ?? []) listener(payload);
    },
    runCommand: (name, payload) => {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`No handler registered for command: ${name}`);
      }
      handler(payload);
    },
  };
}
