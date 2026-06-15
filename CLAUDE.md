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
- Co-locate tests as `*.test.ts` next to the code they cover.

## Setup status

Biome and Vitest are configured. Biome (`biome.json`) runs the recommended
lint rules with both the formatter and the assist (import organizing)
disabled, so it never reformats. Vitest config lives in `vite.config.ts`.

Still scaffold, still to do:

- Replace the scaffold UI in `src/main.ts` / `index.html` with the game.
- Remove leftover template files (`src/counter.ts`, demo assets) once unused.
  Biome currently reports warnings against this scaffold code; they clear
  once it's replaced.
