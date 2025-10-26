import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'], // CLI entry point, tested via integration
      all: true,
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
