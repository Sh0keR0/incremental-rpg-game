# Migration: dispatch/FX engine → events-first engine

Tracks the move from the previous engine (synchronous `dispatch` transaction +
deferred event flush as a "transient FX" phase) to the target described in
**[docs/ARCHITECTURE.md](ARCHITECTURE.md)**: an always-running tick that drains a
command queue, fires events synchronously and order-independently, and renders
once per tick.

The migration is staged so `master` stays green at every phase — `npm test`,
`npm run lint`, and `npm run build` must all pass before a phase is considered
done. Each phase is a self-contained commit.

> **Status: complete.** All phases below (0–7) have landed; the engine now
> matches `ARCHITECTURE.md`. This document is kept as the record of how the
> migration was carried out.

## Target model in one paragraph

Player input enqueues **commands** (intents). The always-on tick drains commands,
runs `onTick` progression, and lets components **emit events** (facts) that other
components **react** to synchronously. Event listener order is unspecified, so
reactions must be commutative; ordering, when truly required, is expressed as a
fact-chain or a direct command call. The tick settles, then the UI renders once.
Direct calls survive only as **queries** (reading another component's current
value). There is no FX phase and no `dispatch`.

## What changes, concretely

| Concern | Today | Target |
| --- | --- | --- |
| State mutation entry point | `core.dispatch(mutator)` from actions + tick | `core.tick(dt)`: drain commands → `onTick` |
| Player actions | `dispatch` calls component methods directly | facade action `enqueue`s a typed command |
| Event delivery | queued during dispatch, flushed **after** render | synchronous at `emit()`, **before** render |
| FX | post-render flush phase | none; UI may `on(event)` like any subscriber |
| Cross-component reward (exp, drops) | `Combat` directly calls `Player.gainExp` / `Inventory.add` | `Player` / `Inventory` react to the `enemyDefeated` fact |
| Stat points on level-up | `PlayerStats` reacts to `leveledUp` (already event-driven, but lands one frame late) | same reaction, now lands in the same tick/snapshot |
| Reading another component | `getGameComponent(X).method()` | unchanged — this is a query, stays direct |

## Phases

### Phase 0 — Docs (this commit)
- Rewrite `docs/ARCHITECTURE.md` to the target design.
- Add this migration plan.
- Update `CLAUDE.md` architecture summary.
- No code changes yet; engine still on the old model.

### Phase 1 — Add command queue + typed commands (additive, non-breaking)
- Add `GameCommandMap` to `types.ts` (`attack`, `allocateStat`).
- Extend `GameContext` with `enqueue<K>(name, payload)` and `handle<K>(name, fn)`.
- In `GameCore`: add a command queue, `enqueue`, single-handler registration
  (`handle` — throw if a command gets a second handler), and `drainCommands()`.
- Do **not** wire it into the loop yet; `dispatch` still drives everything.
- Tests: a unit test that `enqueue` + drain routes to the registered handler and
  that double-registration throws.

### Phase 2 — Make the tick the transaction boundary
- Add `core.tick(dt)` that runs `drainCommands()` then each `onTick`, and renders
  once afterward.
- Point `start()`'s frame at `core.tick` instead of the old
  `dispatch(() => onTick…)`.
- Keep `dispatch` available for the actions that haven't moved yet (it can
  delegate to the same render-once path).
- Tests: ticking with queued commands applies them before progression; one render
  per tick.

### Phase 3 — Convert actions to commands
- `createGame` actions `attack()` / `allocateStat()` now `enqueue` commands
  instead of calling `dispatch`.
- `Combat` registers `handle('attack', …)` (queries `Player.getAttack()`, damages
  enemy, emits facts). `PlayerStats` registers `handle('allocateStat', …)`.
- Update `createGame.test.ts` to drive via the command path (enqueue → tick).

### Phase 4 — Make events synchronous; delete the FX flush
- Change `emit` to deliver synchronously (remove the `eventQueue` / `flushEvents`
  / `dispatchDepth` machinery).
- Remove `dispatch` entirely once nothing calls it.
- Verify nothing relied on the post-render flush ordering (search for `on(` usage
  in `src/ui`). The UI `on(event)` hook stays; it just fires earlier (pre-render),
  which is fine for non-FX subscribers.

### Phase 5 — Move rewards from direct calls to event reactions
- `Player`: in `initialize`, `on('enemyDefeated', p => this.gainExp(p.expReward))`.
  Remove the `Combat → Player.gainExp` direct call.
- `Inventory`: `on('enemyDefeated', p => addDrops(p.drops))`. Remove the
  `Combat → Inventory.add` direct call from `defeatEnemy`.
- Confirm the `enemyDefeated` reactions are commutative (Player and Inventory
  don't read each other) per ARCHITECTURE.md rule 2.
- `PlayerStats` keeps reacting to `leveledUp`; verify the awarded point now shows
  in the same tick's snapshot (the old one-frame lag is gone). Add/adjust a
  regression test asserting `unspentPoints` is updated in the same snapshot as the
  level-up.

### Phase 6 — Order-independence discipline + cascade guard
- Audit all event handlers against the three rules in ARCHITECTURE.md
  ("Events fire in an unspecified order"). Result: the `enemyDefeated` reactions
  (Player, Inventory) are commutative and `leveledUp → PlayerStats` is a
  fact-chain — no handler relies on listener order.
- Add a cascade-depth guard in `emit`. Per decision #3 it is **optional and
  log-only**: it warns once per top-level cascade past `cascadeWarnDepth`
  (default 50, `0` disables) and never throws. The warn sink is injectable for
  tests.

### Phase 7 — Cleanup
- Delete dead code (old `dispatch`, queue fields, unused FX wiring).
- Final pass on `ARCHITECTURE.md` to drop the "migration in progress" banner.
- `npm run lint:fix`, `npm run build`, `vitest run` all clean.

## Risks & watch-items

- **Synchronous reentrancy.** A handler that emits an event which (directly or
  transitively) re-triggers the same handler can recurse infinitely. Mitigated by
  the fact-only discipline and the Phase 6 depth guard.
- **Hidden order assumptions in existing tests.** Tests that asserted the old
  render-before-FX ordering, or that relied on `dispatch` flush timing, must be
  rewritten to the tick model. Expect churn in `GameCore.test.ts` and
  `createGame.test.ts`.
- **Read-after-write across `enemyDefeated` handlers.** Double-check no reaction
  reads another component's just-changed state during the same fan-out (rule 2).
- **Determinism.** With commands as serializable intents and injected RNG/clock,
  prefer driving tests by an enqueued command stream + fixed tick — this is the
  payoff and the best regression net for the rewrite.

## Resolved decisions

- **#3 Cascade bounding** — resolved: the guard is **optional and log-only**, not
  enforced. It warns once per top-level cascade past `cascadeWarnDepth` (default
  50, `0` disables) and never throws. No static re-emit restrictions.
