import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    // 优先走 main（CJS）入口，确保 vi.mock 能正确拦截腾讯云 SDK
    mainFields: ['main'],
    conditions: ['require', 'node'],
  },
});
