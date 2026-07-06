#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { startServer } from './backend/server';
import { PresetsStore, type PresetFilters } from './backend/presets';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  version: string;
};

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
  .option('--token <token>', 'protect API routes with a bearer/header token for non-local clients')
  .option('--preset <name>', 'load filters from a saved preset')
  .option('--save-preset <name>', 'save the current flags as a preset for next time')
  .option('--repo-from-url <url>', 'open a repo from a git-history-ui:// protocol URL')
  .option('--at <ref>', 'select a commit or ref on startup')
  .option('--pr <number>', 'focus a pull request number on startup')
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

program
  .command('wrapped')
  .description('print a "Git Wrapped" year-in-review for the current repo')
  .option('-y, --year <year>', 'calendar year to summarize (defaults to current year)')
  .option('--cwd <path>', 'path to the git repository (defaults to cwd)')
  .option('--author <name>', 'limit the recap to a single author')
  .option('--json', 'output raw JSON instead of the formatted card')
  .action(async (cmdOpts: { year?: string; cwd?: string; author?: string; json?: boolean }) => {
    try {
      const { GitService } = await import('./backend/gitService');
      const { computeWrapped } = await import('./backend/wrapped');
      const git = new GitService(cmdOpts.cwd ?? process.cwd());
      const year = cmdOpts.year ? parseInt(cmdOpts.year, 10) : undefined;
      const stats = await computeWrapped(git, {
        year: Number.isFinite(year as number) ? year : undefined,
        author: cmdOpts.author
      });
      if (cmdOpts.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }
      printWrapped(stats);
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

// `main()` runs from the root `.action()` when no subcommand is given,
// or the `presets` handler runs for that subcommand. Either way, parseAsync
// drives the right path.
if (require.main === module) {
  void program.parseAsync();
}

interface MainOptions {
  port: string;
  host: string;
  file?: string;
  since?: string;
  author?: string;
  open: boolean;
  cwd?: string;
  llm?: string;
  token?: string;
  preset?: string;
  savePreset?: string;
  repoFromUrl?: string;
  at?: string;
  pr?: string;
}

export function parseProtocolUrl(raw: string): { repo?: string; at?: string; pr?: string } {
  try {
    const url = new URL(raw);
    return {
      repo: url.searchParams.get('repo') ?? undefined,
      at: url.searchParams.get('at') ?? undefined,
      pr: url.searchParams.get('pr') ?? undefined
    };
  } catch {
    return {};
  }
}

/**
 * Best-effort: given a GitHub/GitLab HTTPS URL, guess the local checkout path.
 * Checks ~/repo-name, ~/Development/repo-name, and common parent dirs.
 * Verifies the candidate's git remote actually matches the requested URL.
 */
export function resolveRepoToLocal(repoUrl: string): string | undefined {
  let repoName: string;
  let urlPath: string; // e.g. "owner/repo" from https://github.com/owner/repo
  try {
    const u = new URL(repoUrl);
    urlPath = u.pathname.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '');
    repoName =
      u.pathname
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/\.git$/, '') ?? '';
  } catch {
    urlPath = repoUrl.replace(/\.git$/, '');
    repoName =
      repoUrl
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/\.git$/, '') ?? '';
  }
  if (!repoName) return undefined;
  const home = homedir();
  const candidates = [
    join(home, repoName),
    join(home, 'Development', repoName),
    join(home, 'dev', repoName),
    join(home, 'repos', repoName),
    join(home, 'projects', repoName),
    join(home, 'src', repoName),
    join(home, 'repositories', repoName),
    join(home, 'repositories', 'personal', repoName),
    join(home, 'repositories', 'work', repoName),
    join(home, 'code', repoName)
  ];
  for (const dir of candidates) {
    try {
      if (!existsSync(join(dir, '.git'))) continue;
      if (urlPath && !repoRemoteMatches(dir, urlPath)) continue;
      return dir;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

/** Check that at least one git remote contains the owner/repo path. */
function repoRemoteMatches(dir: string, urlPath: string): boolean {
  try {
    const remotes = execFileSync('git', ['remote', '-v'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 3000
    });
    const normalized = normalizeRepoPath(urlPath);
    return remotes.split('\n').some((line: string) => normalizeRepoPath(line).endsWith(normalized));
  } catch {
    return false;
  }
}

function normalizeRepoPath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+\((fetch|push)\)$/i, '')
    .replace(/^git@[^:]+:/, '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^ssh:\/\/git@[^/]+\//, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function main(): Promise<void> {
  const options = program.opts<MainOptions>();
  const presetsStore = new PresetsStore();

  // Handle git-history-ui://open?repo=...&at=...&pr=... protocol URLs
  if (options.repoFromUrl) {
    const parsed = parseProtocolUrl(options.repoFromUrl);
    if (parsed.at && !options.at) options.at = parsed.at;
    if (parsed.pr && !options.pr) options.pr = parsed.pr;
    if (parsed.repo && !options.cwd) {
      const localPath = resolveRepoToLocal(parsed.repo);
      if (localPath) {
        options.cwd = localPath;
        console.log(chalk.gray(`Protocol URL: resolved repo to ${localPath}`));
      } else {
        console.warn(
          chalk.yellow(
            `Could not find local clone for ${parsed.repo}.\n` +
              `Clone it and re-run, or use --cwd to point at the checkout.`
          )
        );
      }
    }
  }

  // Hydrate from saved preset (CLI flags still override).
  if (options.preset) {
    const loaded = await presetsStore.get(options.preset);
    if (!loaded) {
      console.error(
        chalk.red(
          `No such preset: ${options.preset}. Run 'git-history-ui presets list' to see saved ones.`
        )
      );
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
      llm: options.llm
        ? { provider: options.llm as 'heuristic' | 'anthropic' | 'openai' }
        : undefined,
      authToken: options.token
    });
    close = result.close;
    console.log(chalk.green(`Listening on ${result.url}`));

    if (options.open) {
      const deepLinkParams = new URLSearchParams();
      if (options.at) deepLinkParams.set('commit', options.at);
      if (options.pr) deepLinkParams.set('pr', options.pr);
      const suffix = deepLinkParams.toString();
      const openUrl = suffix ? `${result.url}/?${suffix}` : result.url;
      try {
        await open(openUrl);
      } catch {
        console.log(chalk.yellow(`(Could not open browser automatically — visit ${openUrl})`));
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

/** Render a Git Wrapped recap as a shareable terminal card. */
function printWrapped(s: import('./backend/wrapped').WrappedStats): void {
  const line = chalk.gray('─'.repeat(46));
  const fmt = (n: number) => n.toLocaleString('en-US');
  console.log('');
  console.log(chalk.bold.magenta(`  🎁  Git Wrapped — ${s.label}`));
  console.log(line);
  console.log(`  ${chalk.cyan('Commits')}        ${chalk.bold(fmt(s.totalCommits))}`);
  console.log(`  ${chalk.cyan('Authors')}        ${chalk.bold(fmt(s.totalAuthors))}`);
  console.log(`  ${chalk.cyan('Files touched')}  ${chalk.bold(fmt(s.totalFilesTouched))}`);
  console.log(
    `  ${chalk.cyan('Lines')}          ${chalk.green('+' + fmt(s.totalAdditions))} ${chalk.red('-' + fmt(s.totalDeletions))}`
  );
  console.log(line);
  console.log(`  🌙 Night owl       ${chalk.bold(s.nightOwlPercent + '%')} of commits after 22:00`);
  console.log(`  🛋️  Weekend warrior ${chalk.bold(s.weekendWarriorPercent + '%')} on weekends`);
  if (s.superlatives.longestStreakDays > 1) {
    console.log(`  🔥 Longest streak  ${chalk.bold(s.superlatives.longestStreakDays + ' days')}`);
  }
  if (s.superlatives.busiestDay) {
    console.log(
      `  📅 Busiest day     ${chalk.bold(s.superlatives.busiestDay.date)} (${s.superlatives.busiestDay.commits} commits)`
    );
  }
  if (s.superlatives.busiestHour) {
    const h = String(s.superlatives.busiestHour.hour).padStart(2, '0');
    console.log(`  ⏰ Peak hour       ${chalk.bold(h + ':00 UTC')}`);
  }
  if (s.topContributors.length > 0) {
    console.log(line);
    console.log(chalk.bold('  Top contributors'));
    s.topContributors.slice(0, 5).forEach((c, i) => {
      console.log(`   ${i + 1}. ${chalk.bold(c.author)} — ${fmt(c.commits)} commits`);
    });
  }
  if (s.topWords.length > 0) {
    console.log(line);
    console.log(
      `  ${chalk.bold('Top words')}  ${s.topWords
        .slice(0, 8)
        .map((w) => w.word)
        .join(', ')}`
    );
  }
  console.log(line);
  console.log(chalk.gray('  Share it: npx git-history-ui  →  Insights → Wrapped → Export card'));
  console.log('');
}
