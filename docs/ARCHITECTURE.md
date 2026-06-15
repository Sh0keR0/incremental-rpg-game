# Architecture

How the game is structured. This is the source of truth for the engine design;
`CLAUDE.md` links here.

## Big picture

```
┌────────────┐   actions     ┌──────────────┐   getGameComponent   ┌──────────────┐
│            │ ────────────▶ │              │ ───────────────────▶ │  Components  │
│  UI layer  │   subscribe   │  createGame  │      dispatch        │  (Player,    │
│ (src/ui)   │ ◀──────────── │   (facade)   │ ◀──────────────────▶ │   Combat…)   │
│            │   on(events)  │  + GameCore  │      onTick/emit      │              │
└────────────┘               └──────────────┘                      └──────────────┘
```

The hard rule still holds: **core game logic and the UI are strictly separate.**
The UI imports only from the `src/game` barrel and talks to the game exclusively
through the `Game` facade — never to components or engine internals directly.

Three layers inside `src/game`:

- **`GameCore`** — the reusable engine. Game-agnostic: it knows nothing about
  players or enemies. Owns the loop, the components, the event bus, and the
  `dispatch` transaction.
- **`createGame` (composition / "game layer")** — the thin, game-specific glue.
  It picks which components exist, defines the player **actions**, builds the
  typed state snapshot, and returns the `Game` facade for the UI.
- **Components** (`IGameComponent`) — the actual game logic, one concern each.

This split is what makes the engine reusable across future incremental games:
only the composition layer and the component set change per game.

## GameCore

The engine. Constructed with a list of component **classes** plus injectable
`rng` / clock / frame functions (for deterministic tests).

Responsibilities:

- **Creation** — `new`s each component class (constructors are arg-free), stores
  them in a `Map` keyed by their constructor, builds the `GameContext`, then calls
  `initialize?(ctx)` on each in registration order.
- **Lookup** — `getGameComponent(Ctor)` returns the typed instance.
- **Game loop** — `start()` / `stop()` drive a `requestAnimationFrame` loop. Each
  frame computes `dt` and ticks every component that implements `onTick`.
- **Events** — a typed event bus (`on` / `emit`) keyed by `GameEventMap`.
- **`dispatch(mutator)`** — the transaction primitive (see below).
- **Persistence seam** — `save()` aggregates `{ [id]: component.save() }`;
  `load(data)` distributes it back by `id`. (The real save *system* — storage,
  versioning — comes later and calls these.)

### The dispatch transaction

Every state mutation — a player action or a loop tick — runs inside
`dispatch(mutator)`:

1. Run `mutator()`. Components mutate their state and `emit` events. **Emitted
   events are queued, not delivered yet.**
2. Notify state subscribers → the UI re-renders against settled state.
3. Flush the queued events → transient FX (damage numbers, toasts) fire.

This guarantees the UI renders the new state *before* event-driven effects play,
consistently for both actions and ticks. Nested dispatches flush only at the
outermost level.

## IGameComponent

A component is a plain class implementing:

```ts
interface IGameComponent {
  readonly id: string                  // stable key — see note below
  initialize?(ctx: GameContext): void  // one-time setup
  onTick?(dt: number): void            // called each frame if present
  save?(): unknown                     // JSON-serializable snapshot
  load?(data: unknown): void           // restore from save()
  getState?(): unknown                 // read-only snapshot for rendering
}
```

Only `id` is required; implement the hooks you need (e.g. `Player` has no
`onTick`; a derived/stateless component may skip `save`/`load`).

**`id` must be a hand-written stable string** (`'player'`, `'combat'`), never
`class.name` — production builds are minified and class names are not stable.
`id` keys both the save blob and the render snapshot.

### GameContext

Passed to `initialize`, components keep the reference for later use:

```ts
interface GameContext {
  rng(): number
  emit<K>(name: K, payload: GameEventMap[K]): void
  on<K>(name: K, fn: (p: GameEventMap[K]) => void): () => void
  getGameComponent<T>(ctor: ComponentClass<T>): T
}
```

**Do not call `getGameComponent` inside `initialize`.** All components exist by
then, but their own `initialize` may not have run yet, so their state isn't ready.
Use it from `onTick`, public methods, or action handlers instead. (Not enforced
in code for now — a convention.)

### Component communication

Components call each other **directly** through `getGameComponent`. Example:
`Combat`, on a kill, calls `getGameComponent(Player).gainExp(reward)`. Use events
for fire-and-forget signals (mostly UI updates and loose cross-component
reactions); use direct calls when one component needs another's data or behavior.

## Events (`GameEventMap`)

Events are centrally typed: one interface maps each event name to its payload.

```ts
interface GameEventMap {
  attacked:      { damage: number; enemyHp: number; enemyName: string }
  enemyDefeated: { name: string; expReward: number }
  expGained:     { amount: number; exp: number; expToNext: number }
  leveledUp:     { level: number }
  enemySpawned:  { name: string; maxHp: number }
}
```

`emit` and `on` are fully type-checked against this map — the payload type follows
from the event name. Add an event by adding one line here.

## Worked example: the Attack flow

1. UI Attack button → `game.actions.attack()`.
2. The action (composition layer) runs inside `core.dispatch`:
   `combat.damageEnemy(player.getAttack())`.
3. `Combat.damageEnemy` lowers enemy HP and `emit('attacked', …)`.
4. If HP hit 0: `emit('enemyDefeated', …)`, then
   `getGameComponent(Player).gainExp(reward)` (Player emits `expGained` and any
   `leveledUp`), then spawn the next enemy and `emit('enemySpawned', …)`.
5. `dispatch` notifies subscribers → UI renders new HP / EXP / level.
6. `dispatch` flushes queued events → floating damage / EXP / level-up FX play.

## Module layout

```
src/game/
  index.ts          public barrel — createGame + types ONLY (no components)
  GameCore.ts       the engine
  createGame.ts     composition: component list, actions, typed snapshot, facade
  types.ts          IGameComponent, GameContext, GameEventMap, Game, GameSnapshot, Enemy
  components/        Player.ts, Combat.ts (+ tests)
  systems/          pure rules helpers (progression: expForLevel, applyExp)
  content/          game data (enemies: ENEMY_POOL, spawnEnemy)
  internal/         engine plumbing (emitter)
```

## Extending the game

- **Add a component**: create a class in `components/` with an `id` and the hooks
  you need; register its class in the `createGame` component list. Other
  components reach it via `getGameComponent`.
- **Add an event**: add a line to `GameEventMap`; `emit`/`on` are typed
  automatically.
- **Add a player action**: add it to the `actions` object in `createGame`,
  orchestrating components inside `core.dispatch`.
- **Surface new data to the UI**: return it from the component's `getState`, then
  read it in `src/ui/render.ts`.

Keep game rules in components/`systems` (pure, fully tested per `CLAUDE.md`); keep
the UI free of game logic.
