import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'text'],
      reportsDirectory: './coverage',
      // Explicit include ensures payment-recovery and vnpay-inquiry are
      // always present in coverage-summary.json even when mocked in unit tests.
      include: [
        'src/**/*.ts',
      ],
      exclude: [
        'src/generated/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/**/*.decorator.ts',
        'src/**/*.guard.ts',
        'src/**/*.strategy.ts',
        'src/**/*.entity.ts',
        'src/**/*.interface.ts',
      ],
    },
  },
});
