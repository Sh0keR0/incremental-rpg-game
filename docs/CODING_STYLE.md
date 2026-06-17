# Coding style

Project coding rules. These apply to all TypeScript in `src/`. See also the
commenting guidance in [CLAUDE.md](../CLAUDE.md).

## Naming

**Use expressive variable names.** A name should say what the value is without
needing the surrounding code to explain it.

```ts
// good
const gameContext = createContext()
const damageAmount = player.getAttack()

// bad
const ctx = createContext()
const dmg = player.getAttack()
```

**No single-character variable names.** This includes loop variables, callback
parameters, and destructured shorthands. 
However, when looping over indexes of an array or list, `i`/`j` is an acceptable variable name.

```ts
// good
for (const enemy of enemies) { ... }
events.map((event) => event.name)
const { player } = snapshot

// bad
for (const e of enemies) { ... }
events.map((e) => e.name)
const { p } = snapshot
```

Common abbreviations that are universally understood in their context are
acceptable (`id`, `dt` for delta-time, `i`/`j` are acceptable only if the context where it used is clear).
When unsure, prefer the longer, clearer name.

## Functions

**Keep functions short — aim for under 100 lines.** This is a guideline, not a
hard limit: a function pushing past it is a signal to extract helpers or split
responsibilities, not a rule to satisfy mechanically. Prefer many small,
well-named functions over one long one.

## Formatting

**Semicolons are required** and enforced by Biome (`semicolons: "always"`).
Run `npm run lint:fix` to apply formatting. The formatter is tuned to the
existing style — single quotes, 2-space indent, ~100-character lines — so it
won't reshape code beyond adding semicolons and basic layout.

The naming and function-length rules above are **not** enforced by the linter
(Biome has no rule for them) — they're on you in review.
