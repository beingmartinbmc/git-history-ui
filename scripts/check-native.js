#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Verifies that the optional `better-sqlite3` native addon can be loaded
 * against the *current* Node.js ABI. If it was compiled for a different
 * Node version (the classic `NODE_MODULE_VERSION` mismatch), this attempts
 * a one-shot `npm rebuild better-sqlite3`.
 *
 * Design goals:
 *  - Never fail the install. `better-sqlite3` is an optionalDependency used
 *    only to accelerate search; the app degrades gracefully without it.
 *  - Be a no-op on the happy path (module already loads).
 *  - Help both contributors and package consumers who hit an ABI mismatch.
 */
'use strict';

const { spawnSync } = require('child_process');

function canLoad() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE _probe (x)');
    db.close();
    return true;
  } catch {
    return false;
  }
}

function main() {
  // If the optional dep isn't installed at all, there is nothing to do.
  try {
    require.resolve('better-sqlite3');
  } catch {
    return;
  }

  if (canLoad()) {
    return; // happy path — no-op
  }

  console.warn(
    '[git-history-ui] better-sqlite3 failed to load (likely a Node ABI ' +
      'mismatch). Attempting a one-time rebuild…'
  );

  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['rebuild', 'better-sqlite3'],
    { stdio: 'inherit' }
  );

  if (result.status === 0 && canLoad()) {
    console.warn('[git-history-ui] better-sqlite3 rebuilt successfully.');
  } else {
    console.warn(
      '[git-history-ui] Could not rebuild better-sqlite3. Search will fall ' +
        'back to the slower in-memory path. To fix manually, run: ' +
        'npm rebuild better-sqlite3'
    );
  }
}

main();
