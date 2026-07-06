module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/__tests__/setup\\.ts$',
    '/__tests__/helpers/'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/__tests__/**',
    // CLI is integration-tested by spawning the compiled binary in cli.test.ts;
    // jest's c8 doesn't see it. Excluding so it doesn't penalize the threshold.
    '!src/cli.ts',
    // Dev-server is just an `if (require.main === module)` shim around server.ts.
    '!src/backend/dev-server.ts',
    // sqliteIndex requires better-sqlite3 (native add-on). Tests exercise it via
    // jest.resetModules() + require() to control module loading, but this pattern
    // defeats ts-jest's instrumentation so coverage is never captured.
    '!src/backend/cache/sqliteIndex.ts'
  ],
  coverageThreshold: {
    global: {
      statements: 93,
      branches: 80,
      functions: 92,
      lines: 95
    }
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
