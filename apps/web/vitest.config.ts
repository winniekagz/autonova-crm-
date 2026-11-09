import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    include: ['src/**/*.spec.{ts,tsx}'],
    // Component specs opt in to jsdom with `// @vitest-environment jsdom`; plain logic specs stay on node.
    environment: 'node',
    setupFiles: ['./vitest.setup.tsx'],
  },
});
