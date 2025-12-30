/**
 * Jest Test Setup
 *
 * Runs before all tests to set up the testing environment.
 */

// Mock VS Code module
jest.mock('vscode', () => require('./mocks/vscode'), { virtual: true });

// Increase timeout for async tests
jest.setTimeout(10000);

// Suppress console output during tests (optional)
// Uncomment to suppress logs during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test utilities
beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
});
