import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Smoke-tests the compiled CLI to guard against the v3.2.0 regression
 * where `npx git-history-ui` printed help and exited (because the root
 * commander program had no `.action()` once a subcommand was registered).
 *
 * We don't actually let the server bind a port — `--help` and `--version`
 * cover the no-args entry path without side effects.
 */
describe('cli', () => {
  const cliPath = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');
  const built = fs.existsSync(cliPath);

  // Skip cleanly in environments where the build hasn't run (e.g. fresh
  // clone before `npm run build:backend`).
  const maybe = built ? it : it.skip;

  maybe('--version prints the package version', () => {
    const result = spawnSync(process.execPath, [cliPath, '--version'], {
      encoding: 'utf8',
      timeout: 10_000
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  maybe('--help exits 0 and lists the presets subcommand', () => {
    const result = spawnSync(process.execPath, [cliPath, '--help'], {
      encoding: 'utf8',
      timeout: 10_000
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/presets/);
  });

  maybe('no-args invocation reaches main() (does not just print help)', () => {
    // Pick a high random port that's unlikely to collide. We don't care if
    // bind eventually succeeds — only that the CLI's `main()` ran (it logs
    // "Starting git-history-ui..." before touching the port). If the root
    // `.action()` is missing, commander prints help and exits 1 immediately
    // and that line never appears.
    const port = 40000 + Math.floor(Math.random() * 10000);
    const result = spawnSync(
      process.execPath,
      [cliPath, '--no-open', '--port', String(port), '--cwd', path.resolve(__dirname, '..', '..')],
      { encoding: 'utf8', timeout: 4_000, killSignal: 'SIGTERM' }
    );
    const out = `${result.stdout}\n${result.stderr}`;
    expect(out).toMatch(/Starting git-history-ui/);
    // And the help banner must NOT have been the only output.
    expect(out).not.toMatch(/Usage: git-history-ui \[options\] \[command\]\n\nBeautiful/);
  });
});
