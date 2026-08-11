import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config for `@nothing/web`. Node environment (no jsdom yet — the two
 * modules currently under test are pure logic + zod schemas). Alias `@` to
 * `./src` to mirror the tsconfig `paths` entry.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
