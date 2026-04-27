// Global Jest setup. This file is referenced by setupFilesAfterEach in
// jest.config.js — it is NOT picked up as a test file (see
// testPathIgnorePatterns).

import { jest } from '@jest/globals';

// Quiet noisy console output but keep error visible so genuine failures show.
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
};

jest.setTimeout(15_000);
