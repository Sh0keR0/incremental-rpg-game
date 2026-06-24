/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Served from https://<user>.github.io/incremental-rpg-game/ on GitHub Pages,
  // so assets must resolve under the repo subpath.
  base: '/incremental-rpg-game/',
  test: {
    // Game logic is kept separate from the DOM, so the default node
    // environment is enough. Switch to 'jsdom' if a test touches the DOM.
    include: ['src/**/*.test.ts'],
  },
});
