# Architecture

How the game is structured. This is the source of truth for the engine design;
`CLAUDE.md` links here.

> This events-first engine — a command queue, an always-on tick, and
> synchronous order-independent events with no `dispatch`/FX layer — is the
> engine as it stands. **[docs/MIGRATION.md](MIGRATION.md)** records how it got
> here from the earlier `dispatch`/FX-flush design.

## Big picture

```
┌────────────┐   commands    ┌──────────────┐   queries (getGameComponent)  ┌──────────────┐
│            │ ────────────▶ │              │ ────────────────────────────▶ │  Components  │
│  UI layer  │   subscribe   │  createGame  │      enqueue / on(events)     │  (Player,    │
│ (src/ui)   │ ◀──────────── │   (facade)   │ ◀───────────────────────────▶ │   Combat…)   │
│            │   on(events)  │  + GameCore  │   tick → events → react       │              │
└────────────┘               └──────────────┘                               └──────────────┘
```

The hard rule still holds: **core game logic and the UI are strictly separate.**
The UI imports only from the `src/game` barrel and talks to the game exclusively
through the `Game` facade — never to components or engine internals directly.

Three layers inside `src/game`:

- **`GameCore`** — the reusable engine. Game-agnostic: it knows nothing about
  players or enemies. Owns the always-running loop, the components, the command
  queue, the event bus, and the save/load seam.
- **`createGame` (composition / "game layer")** — the thin, game-specific glue.
  It picks which components exist, exposes the player **actions** (which enqueue
  commands), builds the typed state snapshot, and returns the `Game` facade.
- **Components** (`IGameComponent`) — the actual game logic, one concern each.

This split is what makes the engine reusable across future incremental games:
only the composition layer and the component set change per game.

## The three kinds of message

Everything that crosses a component boundary is one of exactly three things.
Keeping them distinct is what stops an events-first engine from turning into
untraceable spaghetti.

| Kind        | Meaning                                  | Direction          | Handlers | Ordering                          |
| ----------- | ---------------------------------------- | ------------------ | -------- | --------------------------------- |
| **Command** | "please do X" — an *intent*, not yet real | UI / tick → engine | exactly 1 | queued, processed at tick start   |
| **Event**   | "X happened" — a *fact*, already true     | component → anyone | 0..N      | **unordered**, synchronous fan-out |
| **Query**   | "what is X right now?"                    | component → component | n/a    | synchronous direct call, returns a value |

The communication rule that follows:

> **Communicate facts via events. Read state via direct query calls. Use a
> direct command call (instead of an event) only when one specific thing must
> happen before another.**

Events are the default channel. Queries (`getGameComponent(Player).getAttack()`)
stay direct calls — they return a value and have no meaningful "order," so they
are never events. A direct *command-style* call between components is reserved
for the rare case where ordering is essential and cannot be expressed as a
fact-chain of events.

## The loop (always running)

The tick loop never stops. Each frame is one transaction; state changes only
ever happen inside a tick.

```
frame():
  deltaMs = now - lastNow
  core.tick(deltaMs):
    1. drainCommands()              apply queued player intents (each may emit events)
    2. for each component: onTick?  time-based progression (each may emit events)
    3. events emitted in 1–2 fire synchronously and cascade until settled
  renderOnce()                      notify state subscribers with the final snapshot
  requestFrame(frame)
```

Commands are drained **before** `onTick`, so input that arrived since the last
frame is reflected in this frame's progression. Because events fire
synchronously, by the time `tick` returns the whole cascade has settled — so the
UI renders exactly once, against fully-settled state. There is no separate
post-render phase.

The loop is started through the `Game` facade: `game.start()` / `game.stop()`
wrap `GameCore`'s frame scheduler. `mountUI` calls `start()` once at bootstrap,
so in the running game the loop is always live. Tests don't call the real
scheduler — they inject a frame pump and step it by hand (see
[Testing the engine](#testing-the-engine)).

## Events fire in an unspecified order

This is the load-bearing constraint of the whole design. When an event is
emitted, its listeners run synchronously, but **the order between listeners is
not guaranteed** — treat it as arbitrary. Code that reacts to events must be
correct regardless of listener order. Three rules keep that true:

1. **One owner per piece of state.** Each field is mutated by exactly one
   component, only in reaction to the events/commands it handles. Combat owns
   enemy HP; Player owns level/exp; PlayerStats owns points. No shared mutation.

2. **No read-after-write across handlers of the same event.** If component A
   reacts to an event by *reading* state that component B *also updates* in
   response to the same event, the result depends on listener order — a bug.
   When you genuinely need "B updates before A reads," that is an **ordering
   dependency**: promote it to a direct command call, or split it into a
   sequenced fact-chain (B reacts and emits a *new* event; A reacts to that).

3. **Handlers must be commutative.** A handler may depend only on the event
   payload and its own state — never on side effects of sibling handlers. If two
   handlers can't be safely reordered, one of them is secretly a command.

Ordering you *do* get for free: a component that mutates its own state and
**then** emits a fact emits it after the mutation, so any listener of that fact
sees the updated owner. Sequencing therefore comes from chaining facts
(`enemyDefeated → leveledUp → statsChanged`), not from listener order.

### Bounding cascades

Events represent facts, and a handler must not emit an event that re-triggers
itself (no cycles). To surface accidental cycles in dev, `GameCore` accepts an
optional `cascadeWarnDepth` (default 50; `0` disables): when a synchronous
cascade nests past it, the emitter **logs a single warning** per top-level
cascade. The guard is a diagnostic only — it never throws and never enforces a
limit.

## IGameComponent

A component is a plain class implementing this interface (defined in `types.ts`,
which is canonical if this drifts):

```ts
interface IGameComponent {
  readonly id: string                  // stable key — see note below
  initialize?(ctx: GameContext): void  // one-time setup: subscribe to events / register command handlers
  onTick?(dt: number): void            // called each frame if present
  save?(): unknown                     // JSON-serializable snapshot
  load?(data: unknown): void           // restore from save()
  getState?(): unknown                 // read-only snapshot for rendering
}
```

Only `id` is required; implement the hooks you need.

**`id` must be a hand-written stable string** (`'player'`, `'combat'`), never
`class.name` — production builds are minified and class names are not stable.
`id` keys both the save blob and the render snapshot.

### Persistence seam

`GameCore.save()` aggregates each component's `save()` into `{ [id]: snapshot }`;
`load(data)` hands each blob back to the component with the matching `id` by
calling its `load()`. This is exactly why `id` must be stable — it's the key that
pairs a saved blob with its component across runs and builds. A component without
`save`/`load` is simply skipped. (The real save *system* — storage, versioning,
migration — layers on top of this seam later.)

### GameContext

Passed to `initialize`; components keep the reference for later use. The exact
signatures live in `types.ts` (canonical) — this is the shape:

```ts
interface GameContext {
  rng(): number
  emit<K>(name: K, payload: GameEventMap[K]): void          // announce a fact
  on<K>(name: K, fn: (p: GameEventMap[K]) => void): () => void  // react to a fact
  enqueue<K>(name: K, payload: GameCommandMap[K]): void      // request a command be run next drain
  handle<K>(name: K, fn: (p: GameCommandMap[K]) => void): void  // own a command (exactly one handler)
  getGameComponent<T>(ctor: ComponentClass<T>): T            // query another component
}
```

**Do not call `getGameComponent` inside `initialize`.** All components exist by
then, but their own `initialize` may not have run yet, so their state isn't
ready. Use it from `onTick`, event handlers, command handlers, or public methods
instead. (Convention, not enforced.)

`initialize` is the place to **subscribe to events** (`on`) and **register
command handlers** (`handle`).

## Events (`GameEventMap`) and Commands (`GameCommandMap`)

Both are centrally typed in `types.ts`: one interface maps each name to its
payload, so `emit`/`on` and `enqueue`/`handle` are fully type-checked against
them. **`types.ts` is the authoritative, current list** — it's not duplicated
here so it can't drift. The two maps look like, by way of illustration:

```ts
interface GameEventMap {        // facts: "X happened"
  enemyDefeated: { name: string; expReward: number; drops: DroppableItem[] }
  leveledUp:     { level: number }
  // …attacked, expGained, enemySpawned, inventoryUpdated, statsChanged, …
}

interface GameCommandMap {      // intents: "please do X"
  allocateStat: { statName: StatName }
  // …attack, …
}
```

Add an event or command by adding one line to the relevant map in `types.ts`.

Two rules the engine **enforces** on commands (unlike events, which fan out to
0..N listeners and never error on zero): a command has **exactly one** handler —
`handle` throws if a second registers — and draining a queued command with no
registered handler throws. Handlers resolve at drain time, so a command may be
enqueued before its owner has registered in `initialize`.

## Worked example: the Attack flow

Contrast this with how the old engine did it — the cross-component direct calls
(`Combat → Player.gainExp`, `Combat → Inventory.add`) become event reactions to
the `enemyDefeated` *fact*. The only direct call left is the query for the
player's attack.

1. UI Attack button → `game.actions.attack()` → `enqueue('attack', {})`.
2. Next tick, `drainCommands()` routes `attack` to its single handler in
   `Combat`.
3. `Combat` **queries** `getGameComponent(Player).getAttack()` (a read — direct,
   returns a value), lowers enemy HP, and `emit('attacked', …)`.
4. If HP hit 0, `Combat` emits the **fact** `enemyDefeated` (with `expReward`
   and rolled `drops`), then spawns the next enemy and emits `enemySpawned`.
5. Reactions to `enemyDefeated` fan out, order-independently:
   - `Player` reacts → `gainExp(payload.expReward)` → mutates level/exp, then
     emits `expGained` and (if crossed) `leveledUp`.
   - `Inventory` reacts → adds `payload.drops` → emits `inventoryUpdated`.
   These two are commutative; neither reads the other's state.
6. `PlayerStats` reacts to the **`leveledUp` fact** → `awardPoints(1)` → emits
   `statsChanged`. (Correct ordering comes from the chain: Player updates its
   level *then* emits `leveledUp`, so the level is already current here — no
   reliance on listener order.)
7. The cascade settles; `tick` returns; the UI renders once against final state.
   The awarded point is already in the snapshot — there is no one-frame lag.

## UI integration

The UI talks to the game through the `Game` facade only, via two channels:

- **`subscribe(listener)`** — called once per tick with the settled
  `GameSnapshot`. This is how the screen is painted. Rendering is a pure
  function of the snapshot.
- **`on(event, listener)`** — optional. Lets the UI react to specific facts
  (e.g. play a sound, fire analytics) without those reactions being part of
  rendering. FX as a privileged layer are gone, but this hook remains.

The UI never mutates game state. Player interactions become **commands**:

### Player input: batch to the next tick

Because the loop always runs, the next tick is ≤16ms away, so batching input is
imperceptible and buys a single serialized timeline (deterministic, testable,
replayable). The rule:

- **Game-state interactions** (attack, allocate a stat, buy an upgrade): the
  facade action **enqueues a command**, drained at the start of the next tick.
  Input never mutates state directly — *all* state change originates inside a
  tick.
- **Pure-UI interactions** (open a panel, switch a tab, hover a tooltip): never
  enter the engine at all. They are UI-local state, handled immediately in
  `src/ui`. Don't route them through commands.

## Module layout

```
src/game/
  index.ts          public barrel — createGame, types, + static content (no engine/components)
  GameCore.ts       the engine: loop, components, command queue, event bus
  createGame.ts     composition: component list, actions (enqueue commands), Game facade + GameSnapshot
  types.ts          GLOBAL/engine types only: IGameComponent, GameContext, ComponentClass, GameEventMap, GameCommandMap
  components/        Player.ts, Combat.ts, Inventory.ts, PlayerStats.ts (+ their *State types) (+ tests)
  systems/          pure rules helpers (progression: expForLevel, applyExp)
  content/          game data (enemies, items, stages) + pure lookups over it
  internal/         engine plumbing (emitter, command queue)
```

**Static content is public.** The barrel also re-exports read-only game content
(e.g. `STAGES`, `StageDefinition`) and the pure helpers over it
(`getStageById`, `getNavigableStageId`). This keeps component **state** purely
dynamic — kills, unlocked set, boss timer — instead of re-forwarding static
fields like stage names and thresholds. The UI composes a view from the dynamic
snapshot plus the static content it imports from the barrel; it still never
reaches past the barrel into the engine or components.

**Type placement:** a component's own state type lives in and is exported from
that component's file. `types.ts` holds only global/engine types. Game-specific
composition types (`Game`, `GameSnapshot`) live in `createGame.ts`. The barrel
re-exports whatever the UI needs.

## Extending the game

- **Add a component**: create a class in `components/` with an `id` and the hooks
  you need; define and export its state type from the same file; register its
  class in the `createGame` component list. In `initialize`, subscribe to the
  events it reacts to and register any commands it owns. Other components reach
  it via `getGameComponent` (queries only — not inside `initialize`).
- **Add an event (fact)**: add a line to `GameEventMap`; `emit`/`on` are typed
  automatically. Decide who emits it and who reacts; keep reactions commutative.
- **Add a command (intent)**: add a line to `GameCommandMap`; register exactly
  one `handle` for it; expose a facade action that `enqueue`s it.
- **Surface new data to the UI**: return it from the component's `getState`, then
  read it in `src/ui/render.ts`.
- **Test it**: a new pure rule → a `systems/` unit test; a new component or
  event reaction → a `makeTestContext` unit test for the component, plus a
  `createGame` integration test when the behaviour spans components (e.g. a new
  reaction to an existing fact). See [Testing the engine](#testing-the-engine).

Keep game rules in components/`systems` (pure, fully tested per `CLAUDE.md`);
keep the UI free of game logic.

## Testing the engine

`CLAUDE.md` covers the testing *philosophy* (what to test, what not to). This is
the engine-specific *how-to*: the seams, the patterns, and the traps unique to
the command/tick/event model. The test files cited below are the canonical,
runnable examples.

### Deterministic seams

`GameCore` / `createGame` take injectable functions so a test owns time,
randomness, and the frame clock — never reach for real timers or `Math.random`:

- `rng` — the RNG. Inject a fixed function (`() => 0`) for deterministic rolls.
- `now` — the clock read each frame. Inject a manual counter for an exact `dt`.
- `requestFrame` / `cancelFrame` — the frame scheduler. Inject a capture-and-step
  pump (below) instead of `requestAnimationFrame`.
- `cascadeWarnDepth` — the cascade-guard threshold (`0` disables); the emitter's
  warn sink is injectable when you want to assert it logged.

### Three test levels — pick the lowest that covers the rule

1. **Pure rules → test the `systems/` function directly.** Progression math,
   formulas, save round-trips. No engine, no context.
   (`systems/progression.test.ts`)
2. **One component → `makeTestContext`.** Drive a single component in isolation
   with a faithful fake context (below). (`components/*.test.ts`)
3. **Cross-component flow → a real `createGame` integration + frame pump.** When
   the behaviour spans components reacting to each other's events (kill → reward,
   level-up → points). (`createGame.test.ts`) **Do not** fake sibling components
   with `getGameComponent` stubs to test a cross-component flow — it's brittle (it
   broke the moment rewards moved to events). Use a real integration.

### Driving ticks

The loop always runs and input batches to the next tick, so an integration test
injects a manual frame pump — a captured `requestFrame` callback plus a `now`
counter, started once, then stepped. Enqueue via an action, then `tick()`:

```ts
function newGame() {
  let queuedFrame: (() => void) | null = null;
  let clock = 0;
  const game = createGame({
    rng: () => 0,
    now: () => clock,
    requestFrame: (callback) => { queuedFrame = callback; return 1; },
    cancelFrame: () => { queuedFrame = null; },
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

game.actions.attack(); // enqueues a command
tick();                // drains it, runs the frame, renders once
```

### Mocking one component: `makeTestContext`

`src/game/testing/makeTestContext.ts` is the one canonical fake `GameContext`.
Construct it, `initialize` the component with its `gameContext`, then:

- `events` — facts the component **emitted**, in order (assert against this).
- `commands` — commands it **enqueued**.
- `simulateEvent(name, payload)` — deliver an **incoming** fact to the listeners
  the component registered via `on()`; this is how you trigger a reaction.
- `runCommand(name, payload)` — invoke the handler it registered via `handle()`.
- `getGameComponent` — throws by default; pass an override only if the unit under
  test queries another component.

The key distinction: **`emit` captures, it does not deliver.** Feed a component
its inputs with `simulateEvent` and read its outputs from `events` — that keeps
the unit isolated. If you need a real cascade, that's a level-3 integration.

### What to avoid

- **Relying on event listener order.** The engine guarantees none (see "Events
  fire in an unspecified order"); a test asserting call order between two
  listeners encodes a forbidden assumption.
- **Reading state right after an action without ticking.** Commands batch — the
  change isn't visible until the next `tick()`.
- **Real `requestAnimationFrame` / `performance.now`.** Non-deterministic and
  async; always inject them.
- **Reaching into private component fields.** Assert via `getState()`, public
  query methods, or emitted `events`.
