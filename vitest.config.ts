import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'build'],
        testTimeout: 10000,
        hookTimeout: 10000,
        setupFiles: ['./src/test-setup.ts'],
    },
});
