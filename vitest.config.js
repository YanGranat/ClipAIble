import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['scripts/**/*.js', 'popup/**/*.js', 'print/**/*.js', 'src/**/*.js', 'offscreen.js', 'lib/jszip-wrapper.js'],
      exclude: ['scripts/extraction/automatic.js', 'scripts/types.js', 'scripts/extraction/extractor/types.js', 'scripts/apply-extraction-build.js'],
      thresholds: { lines: 62, statements: 61, functions: 68, branches: 52 }
    }
  },
  resolve: {
    alias: {
      '@': new URL('./scripts', import.meta.url).pathname
    }
  }
});

