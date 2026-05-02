// Global Jest setup. This file is referenced by setupFilesAfterEach in
// jest.config.js — it is NOT picked up as a test file (see
// testPathIgnorePatterns).

import { jest } from '@jest/globals';

// Quiet noisy console output. Errors are also silenced so the expected
// "API error: ..." log from the server's 500 path doesn't pollute output;
// real failures still surface via Jest assertions.
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

jest.setTimeout(15_000);
