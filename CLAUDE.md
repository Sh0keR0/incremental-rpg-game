# CLAUDE.md

Guidance for working in this repository.

## Project

A simple, short incremental RPG game. Keep scope small — this is meant to be a
focused, finishable game, not a sprawling idle engine. Favor clarity over
feature count.

- **Platform:** Web — static site, bundled with Vite.
- **Stack:** HTML, CSS, TypeScript (no UI framework).
- **Linting/formatting:** Biome — recommended lint preset + a formatter tuned to
  the existing style (single quotes, 2-space indent, ~100 width, semicolons).
- **Testing:** Vitest.

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc type-check + vite build -> dist/
npm run preview  # serve the production build locally
npm test         # vitest (watch mode); `vitest run` for a single pass
npm run lint     # biome check (lint only)
npm run lint:fix # biome check --write (apply safe lint fixes)
```

## Architecture

The game runs on a **component-based engine**. Full design and conventions live
in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — read it before changing the
engine.

> The engine runs an **events-first** model (command queue + always-on tick +
> synchronous, order-independent events, no `dispatch`/FX). `ARCHITECTURE.md`
> describes it; **[docs/MIGRATION.md](docs/MIGRATION.md)** records how it got
> there from the earlier `dispatch`/FX design.

The essentials:

- **`GameCore`** (`src/game/GameCore.ts`) — the reusable, game-agnostic engine:
  owns the always-running loop, creates/holds components, drains the command
  queue, runs the typed event bus, and exposes `getGameComponent<T>`.
- **`createGame`** (`src/game/createGame.ts`) — the game-specific composition that
  picks components, exposes `actions` (which **enqueue commands**), builds the
  typed `GameSnapshot`, and returns the `Game` facade the UI uses.
- **Components** (`src/game/components/`) — `IGameComponent` classes (Player,
  Combat, Inventory, PlayerStats) holding logic.
- **`src/ui/`** — DOM only, no game rules. Imports only from the `src/game` barrel
  and talks to the game through the `Game` facade.

**Communication:** three message kinds — **commands** (intents, exactly one
handler, queued and drained at tick start), **events** (facts, fan-out to 0..N
listeners, fired synchronously in **unspecified order**), and **queries**
(reading another component via `getGameComponent`, a direct call). Default to
events for facts; keep queries direct; use a direct command call only when
ordering is essential. Event handlers must be commutative — never rely on
listener order (see the doc's order-independence rules).

The hard rule still holds: **core game logic and the UI stay strictly separate.**
The barrel (`src/game/index.ts`) exports only `createGame` + types — never the
engine, components, or other internals.

Two rules that bite if ignored: components key save/state by a hand-written `id`
(never `class.name` — minified); don't call `getGameComponent` inside
`initialize` (subscribe to events / register command handlers there instead). See
the doc for the full lifecycle, message maps, and "how to add a
component/event/command" checklist.

## Layout

- `index.html` — entry HTML; mounts into `#app`.
- `src/main.ts` — bootstrap: `createGame()` + `mountUI(#app)`.
- `src/game/` — the engine + game logic (see Architecture / the doc).
- `src/ui/` — `render.ts` (paint snapshot) + `index.ts` (`mountUI`: wire DOM to game).
- `src/style.css` — global styles.
- `public/` — static files served as-is (favicon, icons).
- `docs/ARCHITECTURE.md` — canonical engine design (target events-first model).
- `docs/MIGRATION.md` — phased plan for the move to the events-first engine.
- `tsconfig.json` — strict bundler-mode config; `noEmit` (Vite handles emit).

## Conventions

- Follow the coding rules in **[docs/CODING_STYLE.md](docs/CODING_STYLE.md)**:
  expressive names (`gameContext`, not `ctx`), no single-character variables,
  short functions (~100 lines max, soft).
- TypeScript is configured strictly: `noUnusedLocals`, `noUnusedParameters`,
  and `verbatimModuleSyntax` are on. Use `import type` for type-only imports.
- Biome formats and lints. Run `npm run lint:fix` to apply formatting (incl.
  semicolons, which are enforced); the config is tuned to the existing style, so
  it shouldn't reshape code beyond that.
- Keep game logic (state, ticks, progression math) separate from DOM rendering
  so it can be unit-tested with Vitest without a browser.

### Comments — don't over-comment

Default to **no comment**. Code should read on its own: prefer clear names and
small functions over narration.

- **Do not** restate what the code already says (`// loop over enemies`),
  add JSDoc that just echoes the signature, or label obvious sections
  (`// bind events`). Delete these on sight.
- **Do** comment only when something is genuinely non-obvious: a subtle
  invariant, a deliberate ordering, a type cast that needs justifying, a
  workaround, or *why* a surprising choice was made. Explain the **why**, not
  the **what**.
- Keep necessary comments short — one line where possible.
- A comment that explains a non-obvious magic number in a test (e.g. why an
  expected EXP value is what it is) counts as necessary.

## Testing

Vitest is the test runner. The goal is confidence in the game's *rules and
math*, not coverage for its own sake — test the logic that would silently
break the game if it were wrong.

> This section is the testing *philosophy*. For the engine-specific *how-to* —
> the deterministic seams, driving ticks, the `makeTestContext` helper, and the
> anti-patterns — see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** →
> "Testing the engine".

**What to test:**

- **Progression math** — XP curves, level-up thresholds, damage/cost formulas,
  and any exponential/idle-growth calculations. These are the easiest to get
  subtly wrong and the most important to pin down.
- **Tick/state transitions** — applying a game tick should produce the expected
  next state. Test edge cases: zero/elapsed time, large offline gaps, resource
  caps, and reaching a win/end condition.
- **Pure helpers** — formatting (numbers, currency), random rolls (inject the
  RNG so outcomes are deterministic), save/load serialization round-trips.
- **Game Logic** - Any game related logic or mechanics should have full test coverage

**What not to test:**

- DOM wiring and rendering glue. Keep that thin; if logic creeps into it,
  extract the logic into a pure function and test that instead.
- Vite, Biome, or other third-party behavior.

**Conventions:**

- Co-locate tests as `*.test.ts` next to the code they cover
  (e.g. `src/combat.ts` → `src/combat.test.ts`).
- Test pure functions with explicit inputs and outputs — no global state.
  Pass time, RNG, and config in as arguments rather than reading them inside
  the function, so tests stay deterministic.
- Keep one behavior per `test`; name it after the rule being verified
  (`'levels up when XP crosses the threshold'`), not the function name.
- Use `vitest run` in CI / one-off checks; `npm test` watches during dev.
- Add a regression test alongside any bug fix that reaches game logic.

## Tooling

Biome (`biome.json`) runs the recommended lint preset plus a formatter tuned to
match the codebase (single quotes, 2-space indent, ~100 line width, semicolons
`always`); the assist (import organizing) stays disabled. Vitest config lives in
`vite.config.ts`. The Vite scaffold has been replaced by the
game; the first vertical slice (click-to-attack combat → EXP → level-up) is in
place. See `Follow-ups` in any plan for what's intentionally deferred
(save/load, auto-combat via `tick`, level-up stat effects).
