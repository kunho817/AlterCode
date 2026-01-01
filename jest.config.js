/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@knowledge/(.*)$': '<rootDir>/src/knowledge/$1',
    '^@context/(.*)$': '<rootDir>/src/context/$1',
    '^@verification/(.*)$': '<rootDir>/src/verification/$1',
    '^@protocol/(.*)$': '<rootDir>/src/protocol/$1',
    '^@execution/(.*)$': '<rootDir>/src/execution/$1',
    '^@integration/(.*)$': '<rootDir>/src/integration/$1',
    '^@ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/extension.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  verbose: true,
};
