import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'test/core/**/*.test.ts',
      'test/client/**/*.test.ts',
      'test/i18n/**/*.test.ts',
      'test/golden/**/*.test.ts',
    ],
  },
});
