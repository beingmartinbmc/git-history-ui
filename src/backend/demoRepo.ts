import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

const DEMO_VERSION = '1';
const MARKER = path.join('.git', 'git-history-ui-demo');

export interface DemoRepositoryOptions {
  reset?: boolean;
  directory?: string;
}

interface DemoAuthor {
  name: string;
  email: string;
}

export function createDemoRepository(options: DemoRepositoryOptions = {}): string {
  const directory = options.directory ?? path.join(os.tmpdir(), 'git-history-ui-demo-v1');
  if (options.reset) rmSync(directory, { recursive: true, force: true });
  if (isCurrentDemo(directory)) return directory;

  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const git = (args: string[], identity: DemoAuthor = AUTHORS.ada, date?: string): string =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: identity.name,
        GIT_AUTHOR_EMAIL: identity.email,
        GIT_COMMITTER_NAME: identity.name,
        GIT_COMMITTER_EMAIL: identity.email,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C'
      }
    }).toString();
  const commit = (message: string, date: string, identity: DemoAuthor = AUTHORS.ada) => {
    git(['add', '-A'], identity, date);
    git(['commit', '-q', '-m', message], identity, date);
  };
  const write = (file: string, content: string | Buffer) => {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };

  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', AUTHORS.ada.name]);
  git(['config', 'user.email', AUTHORS.ada.email]);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'tag.gpgSign', 'false']);
  git(['config', 'core.hooksPath', '.git/no-hooks']);
  git(['config', 'core.autocrlf', 'false']);
  git(['remote', 'add', 'origin', 'https://github.com/git-history-ui/demo.git']);

  write('README.md', '# Orbit Notes\n\nA deterministic repository for exploring Git history.\n');
  write('src/core.ts', 'export const orbit = (name: string) => `Hello, ${name}`;\n');
  commit('feat(core): launch orbit notes', '2026-01-05T09:00:00Z');

  write('src/api/client.ts', 'export const endpoint = "/api/notes";\n');
  write('tests/core.test.ts', 'import { orbit } from "../src/core";\nvoid orbit("Ada");\n');
  commit('feat(api): add notes client', '2026-01-12T23:15:00Z', AUTHORS.grace);

  git(['checkout', '-q', '-b', 'feature/timeline']);
  write(
    'src/ui/timeline.ts',
    'export const timeline = ["created", "reviewed", "shipped"] as const;\n'
  );
  write('src/ui/theme.css', ':root { color-scheme: light dark; }\n');
  commit('feat(ui): add activity timeline', '2026-02-03T18:30:00Z', AUTHORS.grace);

  write(
    'src/ui/timeline.ts',
    'export const timeline = ["created", "edited", "shipped"] as const;\n'
  );
  commit('fix(ui): keep edited events in order', '2026-02-04T08:10:00Z', AUTHORS.linus);

  git(['checkout', '-q', 'main']);
  write(
    'README.md',
    '# Orbit Notes\n\nA deterministic repository for exploring Git history.\n\n## Quick start\n\nOpen the timeline.\n'
  );
  commit('docs(readme): add quick start', '2026-02-06T12:00:00Z', AUTHORS.ada);
  git(
    ['merge', '--no-ff', '-q', 'feature/timeline', '-m', 'merge(ui): ship timeline (#42)'],
    AUTHORS.ada,
    '2026-02-10T15:45:00Z'
  );

  mkdirSync(path.join(directory, 'src/domain'), { recursive: true });
  renameSync(path.join(directory, 'src/core.ts'), path.join(directory, 'src/domain/orbit.ts'));
  write('tests/core.test.ts', 'import { orbit } from "../src/domain/orbit";\nvoid orbit("Ada");\n');
  commit('refactor(core): move orbit into domain', '2026-03-01T10:20:00Z', AUTHORS.linus);

  write('assets/orbit.bin', Buffer.from([0, 255, 1, 254, 2, 253]));
  commit('perf(assets): add compact orbit preview', '2026-03-08T07:40:00Z', AUTHORS.grace);

  write(
    'src/api/client.ts',
    'export const endpoint = "/api/notes";\nexport const timeoutMs = 5_000;\n'
  );
  write('src/api/retry.ts', 'export const retryCount = 2;\n');
  commit('fix(api): bound retry latency', '2026-03-15T21:05:00Z', AUTHORS.ada);

  write('CHANGELOG.md', '## 1.0.0\n\n- Timeline, notes API, and compact previews.\n');
  commit('chore(release): prepare 1.0.0', '2026-04-01T11:00:00Z', AUTHORS.grace);
  git(['tag', 'v1.0.0']);
  git(['branch', 'release/1.x', 'HEAD~1']);
  writeFileSync(path.join(directory, MARKER), `${DEMO_VERSION}\n`);
  return directory;
}

function isCurrentDemo(directory: string): boolean {
  try {
    return (
      existsSync(path.join(directory, '.git')) &&
      readFileSync(path.join(directory, MARKER), 'utf8').trim() === DEMO_VERSION
    );
  } catch {
    return false;
  }
}

const AUTHORS = {
  ada: { name: 'Ada Lovelace', email: 'ada@example.com' },
  grace: { name: 'Grace Hopper', email: 'grace@example.com' },
  linus: { name: 'Linus Torvalds', email: 'linus@example.com' }
} as const;
