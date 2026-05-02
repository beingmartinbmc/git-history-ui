#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { readFileSync } from 'fs';
import { join } from 'path';
import { startServer } from './backend/server';
import { PresetsStore, type PresetFilters } from './backend/presets';

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
  .option('--llm <provider>', 'LLM provider: heuristic, anthropic, openai (default: auto)')
  .option('--preset <name>', 'load filters from a saved preset')
  .option('--save-preset <name>', 'save the current flags as a preset for next time')
  // Default action: when the user runs `git-history-ui` with no subcommand,
  // start the server. Without this, commander v12 prints help and exits as
  // soon as any subcommand (e.g. `presets`) is registered.
  .action(() => {
    void main();
  });

program
  .command('presets')
  .description('manage saved CLI presets')
  .argument('<action>', 'list | delete')
  .argument('[name]', 'preset name (required for delete)')
  .action(async (action: string, name?: string) => {
    const store = new PresetsStore();
    if (action === 'list') {
      const all = await store.list();
      const entries = Object.entries(all);
      if (entries.length === 0) {
        console.log(chalk.gray('No presets saved yet. Use --save-preset <name> to create one.'));
        return;
      }
      console.log(chalk.cyan(`Saved presets (${await store.path()}):`));
      for (const [n, f] of entries) {
        const summary = Object.entries(f)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');
        console.log(`  ${chalk.bold(n)}  ${chalk.gray(summary || '(no filters)')}`);
      }
      return;
    }
    if (action === 'delete') {
      if (!name) {
        console.error(chalk.red('Usage: git-history-ui presets delete <name>'));
        process.exit(1);
      }
      const ok = await store.delete(name);
      if (ok) console.log(chalk.green(`Deleted preset: ${name}`));
      else {
        console.error(chalk.yellow(`No such preset: ${name}`));
        process.exit(1);
      }
      return;
    }
    console.error(chalk.red(`Unknown presets action: ${action}. Use list or delete.`));
    process.exit(1);
  });

// `main()` runs from the root `.action()` when no subcommand is given,
// or the `presets` handler runs for that subcommand. Either way, parseAsync
// drives the right path.
void program.parseAsync();

interface MainOptions {
  port: string;
  host: string;
  file?: string;
  since?: string;
  author?: string;
  open: boolean;
  cwd?: string;
  llm?: string;
  preset?: string;
  savePreset?: string;
}

async function main(): Promise<void> {
  const options = program.opts<MainOptions>();
  const presetsStore = new PresetsStore();

  // Hydrate from saved preset (CLI flags still override).
  if (options.preset) {
    const loaded = await presetsStore.get(options.preset);
    if (!loaded) {
      console.error(chalk.red(`No such preset: ${options.preset}. Run 'git-history-ui presets list' to see saved ones.`));
      process.exit(1);
    }
    if (!options.file && loaded.file) options.file = loaded.file;
    if (!options.since && loaded.since) options.since = loaded.since;
    if (!options.author && loaded.author) options.author = loaded.author;
    if (options.port === '3000' && loaded.port) options.port = String(loaded.port);
    console.log(chalk.gray(`Loaded preset '${options.preset}'.`));
  }

  const port = parseInt(options.port, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(chalk.red(`Invalid port: ${options.port}`));
    process.exit(1);
  }

  // Persist before starting if requested.
  if (options.savePreset) {
    const filters: PresetFilters = {
      file: options.file,
      since: options.since,
      author: options.author,
      port: port !== 3000 ? port : undefined
    };
    try {
      await presetsStore.save(options.savePreset, filters);
      console.log(chalk.green(`Saved preset '${options.savePreset}'.`));
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  }

  console.log(chalk.blue('Starting git-history-ui...'));

  let close: () => Promise<void> = () => Promise.resolve();
  try {
    const result = await startServer(port, options.host, {
      file: options.file,
      since: options.since,
      author: options.author,
      cwd: options.cwd,
      llm: options.llm ? { provider: options.llm as 'heuristic' | 'anthropic' | 'openai' } : undefined
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
          '  • Press Ctrl+C to stop the server\n' +
          (options.savePreset
            ? `  • Resume this view next time with: git-history-ui --preset ${options.savePreset}\n`
            : '')
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
