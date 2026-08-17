export default {
  displayName: 'api-e2e',
  preset: '../../jest.preset.js',
  globalSetup: '<rootDir>/src/support/global-setup.ts',
  globalTeardown: '<rootDir>/src/support/global-teardown.ts',
  setupFiles: ['<rootDir>/src/support/test-setup.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/api-e2e',
  // Jest's 5s default is a unit-test budget. These specs are HTTP round trips
  // against a real API, Postgres and SMTP, and the auth-heavy ones deliberately
  // hash passwords with argon2 — so on a machine with enough cores to run many
  // workers at once, they queue behind each other on one API process and blow a
  // 5s deadline while being perfectly correct. Slow is not wrong here; a test
  // that genuinely hangs still fails, just later.
  testTimeout: 30_000,
};
