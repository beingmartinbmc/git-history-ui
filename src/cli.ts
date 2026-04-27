#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { readFileSync } from 'fs';
import { join } from 'path';
import { startServer } from './backend/server';

const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
) as { version: string };

const program = new Command();

program
  .name('git-history-ui')
  .description('Beautiful git history visualization in your browser')
  .version(pkg.version, '-v, --version', 'output the version number')
  .option('-p, --port <number>', 'port to run server on', '3000')
  .option('-H, --host <host>', 'host to bind to', 'localhost')
  .option('-f, --file <path>', 'filter commits by a specific file')
  .option('-s, --since <date>', 'filter commits since a date (YYYY-MM-DD)')
  .option('-a, --author <name>', 'filter commits by author')
  .option('--no-open', 'do not automatically open browser')
  .option('--cwd <path>', 'path to the git repository (defaults to cwd)')
  .parse();

const options = program.opts<{
  port: string;
  host: string;
  file?: string;
  since?: string;
  author?: string;
  open: boolean;
  cwd?: string;
}>();

async function main(): Promise<void> {
  const port = parseInt(options.port, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(chalk.red(`Invalid port: ${options.port}`));
    process.exit(1);
  }

  console.log(chalk.blue('Starting git-history-ui...'));

  let close: () => Promise<void> = () => Promise.resolve();
  try {
    const result = await startServer(port, options.host, {
      file: options.file,
      since: options.since,
      author: options.author,
      cwd: options.cwd
    });
    close = result.close;
    console.log(chalk.green(`Listening on ${result.url}`));

    if (options.open) {
      try {
        await open(result.url);
      } catch {
        console.log(chalk.yellow(`(Could not open browser automatically — visit ${result.url})`));
      }
    }

    console.log(
      chalk.gray(
        '\nTips:\n' +
          '  • Press Cmd/Ctrl+K in the UI to open the command palette\n' +
          '  • Press ? to view keyboard shortcuts\n' +
          '  • Press Ctrl+C to stop the server\n'
      )
    );
  } catch (err) {
    console.error(chalk.red('Failed to start server:'), err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const shutdown = (signal: string) => {
    console.log(chalk.gray(`\n${signal} received, shutting down...`));
    close().finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
