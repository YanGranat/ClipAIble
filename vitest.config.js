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
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.js',
        'lib/',
        'popup/',
        'print/',
        'config/',
        'icons/',
        'docs/',
        'doc/',
        'memory-bank/'
      ]
    }
  },
  resolve: {
    alias: {
      '@': new URL('./scripts', import.meta.url).pathname
    }
  }
});

