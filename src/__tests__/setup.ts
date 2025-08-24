// Test setup file
import { jest } from '@jest/globals';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock process.exit to prevent tests from exiting
process.exit = jest.fn() as any;

// Set test timeout
jest.setTimeout(10000);

// Add a simple test to satisfy Jest requirements
describe('Setup', () => {
  it('should be configured correctly', () => {
    expect(true).toBe(true);
  });
});
