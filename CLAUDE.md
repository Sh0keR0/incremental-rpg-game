# CLAUDE.md

Guidance for working in this repository.

## Project

A simple, short incremental RPG game. Keep scope small — this is meant to be a
focused, finishable game, not a sprawling idle engine. Favor clarity over
feature count.

- **Platform:** Web — static site, bundled with Vite.
- **Stack:** HTML, CSS, TypeScript (no UI framework).
- **Linting:** Biome (linting only — formatting is disabled).
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

## Layout

- `index.html` — entry HTML; mounts into `#app`.
- `src/main.ts` — app entry point.
- `src/style.css` — global styles.
- `src/assets/` — images and SVGs.
- `public/` — static files served as-is (favicon, icons).
- `tsconfig.json` — strict bundler-mode config; `noEmit` (Vite handles emit).

## Conventions

- TypeScript is configured strictly: `noUnusedLocals`, `noUnusedParameters`,
  and `verbatimModuleSyntax` are on. Use `import type` for type-only imports.
- Biome handles linting only — do not rely on it to format. Match the
  surrounding style by hand.
- Keep game logic (state, ticks, progression math) separate from DOM rendering
  so it can be unit-tested with Vitest without a browser.

## Testing

Vitest is the test runner. The goal is confidence in the game's *rules and
math*, not coverage for its own sake — test the logic that would silently
break the game if it were wrong.

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

## Setup status

Biome and Vitest are configured. Biome (`biome.json`) runs the recommended
lint rules with both the formatter and the assist (import organizing)
disabled, so it never reformats. Vitest config lives in `vite.config.ts`.

Still scaffold, still to do:

- Replace the scaffold UI in `src/main.ts` / `index.html` with the game.
- Remove leftover template files (`src/counter.ts`, demo assets) once unused.
  Biome currently reports warnings against this scaffold code; they clear
  once it's replaced.
