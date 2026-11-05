import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15000,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
