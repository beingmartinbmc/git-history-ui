import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { checkoutId } from '../backend/checkoutRegistry';
import { startServer, type BootResult } from '../backend/server';
import { request } from './helpers/http';
import { makeRepo, withTempHomeAsync } from './helpers/repo';

/** End-to-end journeys across the CLI, the HTTP API and the served SPA shell. */
const cliPath = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');
const spaIndex = path.resolve(__dirname, '..', '..', 'build', 'frontend', 'index.html');

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });

describe('journeys', () => {
  jest.setTimeout(30_000);

  // Skips cleanly before `npm run build:backend`, like the other CLI smoke tests.
  (fs.existsSync(cliPath) ? it : it.skip)(
    'CLI startup filters reach the browser URL and the clone is remembered for the switcher',
    async () => {
      await withTempHomeAsync(async (home) => {
        const repo = makeRepo('ghui-journey-cli-');
        let child: ChildProcess | undefined;
        try {
          repo.commit('a.txt', 'a', 'feat: a');
          const port = await freePort();
          child = spawn(
            process.execPath,
            [
              cliPath,
              '--no-open',
              '--port',
              String(port),
              '--cwd',
              repo.dir,
              '--file',
              'src/my file.ts',
              '--author',
              'Ada Lovelace',
              '--since',
              '2024-01-01'
            ],
            { env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] }
          );
          let out = '';
          const opened = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`no Open line in:\n${out}`)), 20_000);
            child!.stdout!.on('data', (chunk) => {
              out += chunk;
              const m = out.match(/Open (http:\/\/\S+)/);
              if (m) {
                clearTimeout(timer);
                resolve(m[1]);
              }
            });
            child!.once('exit', () => reject(new Error(`CLI exited early:\n${out}`)));
          });

          const url = new URL(opened);
          expect(url.origin).toBe(`http://localhost:${port}`);
          expect(url.searchParams.get('file')).toBe('src/my file.ts');
          expect(url.searchParams.get('author')).toBe('Ada Lovelace');
          expect(url.searchParams.get('since')).toBe('2024-01-01');

          const switcher = await request({ url: `${url.origin}/api/checkouts` });
          expect(switcher.body.current).toBe(checkoutId(repo.dir));
          expect(switcher.body.checkouts[0].lastOpened).not.toBeNull(); // remembered by the CLI
        } finally {
          // Wait for the exit: the CLI may still be writing under the temp HOME being removed.
          if (child && child.exitCode === null) {
            const exited = new Promise((resolve) => child!.once('exit', resolve));
            child.kill('SIGTERM');
            await exited;
          }
          repo.cleanup();
        }
      });
    }
  );

  it('exports exactly what the active filters select, with the real total', async () => {
    const repo = makeRepo('ghui-journey-export-');
    let boot: BootResult | undefined;
    try {
      const as = (author: string, file: string, msg: string) => {
        fs.writeFileSync(path.join(repo.dir, file), msg);
        repo.git(['add', '-A']);
        repo.git(['commit', '-q', `--author=${author} <${author}@example.com>`, '-m', msg]);
        return repo.git(['rev-parse', 'HEAD']).trim();
      };
      as('Alice', 'a.txt', 'alice a');
      const wanted = as('Alice', 'b.txt', 'alice b');
      as('Bob', 'b.txt', 'bob b');

      boot = await startServer(0, '127.0.0.1', { cwd: repo.dir, llm: { provider: 'heuristic' } });
      const origin = `http://127.0.0.1:${(boot.server.address() as net.AddressInfo).port}`;

      const res = await fetch(`${origin}/api/export/commits?format=json&author=Alice&file=b.txt`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as Array<{ hash: string }>).map((c) => c.hash)).toEqual([wanted]);
      expect(res.headers.get('x-total-commits')).toBe('1');
      expect(res.headers.get('x-export-truncated')).toBe('false');

      const all = await fetch(`${origin}/api/export/commits?format=json`);
      expect(res.headers.get('x-total-commits')).not.toBe(all.headers.get('x-total-commits'));
    } finally {
      await boot?.close();
      repo.cleanup();
    }
  });

  (fs.existsSync(spaIndex) ? it : it.skip)(
    'cold deep links get the SPA shell while unknown API routes stay JSON 404s',
    async () => {
      const repo = makeRepo('ghui-journey-spa-');
      let boot: BootResult | undefined;
      try {
        const hash = repo.commit('a.txt', 'a', 'feat: a');
        boot = await startServer(0, '127.0.0.1', { cwd: repo.dir, llm: { provider: 'heuristic' } });
        const origin = `http://127.0.0.1:${(boot.server.address() as net.AddressInfo).port}`;

        for (const route of ['/timeline', `/?commit=${hash}`, '/compare', '/file-history']) {
          const res = await fetch(`${origin}${route}`);
          expect(res.status).toBe(200);
          expect(res.headers.get('content-type')).toMatch(/text\/html/);
          expect(await res.text()).toContain('<app-root');
        }
        const api = await fetch(`${origin}/api/nope`);
        expect(api.status).toBe(404);
        expect(api.headers.get('content-type')).toMatch(/json/);
      } finally {
        await boot?.close();
        repo.cleanup();
      }
    }
  );
});
