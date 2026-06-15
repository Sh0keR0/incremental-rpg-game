/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    // Game logic is kept separate from the DOM, so the default node
    // environment is enough. Switch to 'jsdom' if a test touches the DOM.
    include: ['src/**/*.test.ts'],
  },
})
