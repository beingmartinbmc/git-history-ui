import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { createDemoRepository } from '../backend/demoRepo';
import type { BootResult } from '../backend/server';
import { startServer } from '../backend/server';

describe('Phase 5 API contracts', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'ghui-phase5-api-'));
  const repo = createDemoRepository({ directory: path.join(parent, 'demo'), reset: true });
  let boot: BootResult;
  let origin: string;
  let head: string;

  beforeAll(async () => {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    boot = await startServer(0, '127.0.0.1', { cwd: repo });
    const address = boot.server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await boot.close();
    rmSync(parent, { recursive: true, force: true });
  });

  it('serves repository identity without paths or credentials', async () => {
    const response = await fetch(`${origin}/api/repository`);
    const body = await response.json();
    expect(body).toMatchObject({
      name: 'demo',
      remoteUrl: 'https://github.com/git-history-ui/demo',
      webUrl: 'https://github.com/git-history-ui/demo',
      currentBranch: 'main',
      defaultBranch: 'main'
    });
    expect(JSON.stringify(body)).not.toContain(repo);
  });

  it('serves commit and range reports as JSON or escaped Markdown', async () => {
    const json = await fetch(`${origin}/api/report/${head}?format=json`);
    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({
      schemaVersion: 1,
      target: { type: 'commit', hash: head }
    });

    const markdown = await fetch(`${origin}/api/report/${head}?format=markdown`);
    expect(markdown.headers.get('content-type')).toContain('text/markdown');
    expect(await markdown.text()).toContain('# Investigation report: demo');

    const range = await fetch(`${origin}/api/report?from=main&to=main&format=json`);
    expect(await range.json()).toMatchObject({ summary: { commits: 0, files: 0 } });
  });

  it('generates a portable share URL with only allowlisted state', async () => {
    const response = await fetch(`${origin}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        viewState: {
          view: 'compare',
          from: 'release/1.x',
          to: 'main',
          token: 'must-not-leak'
        }
      })
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { url: string; mode: string };
    expect(body.mode).toBe('portable');
    expect(body.url).toContain('repo=https%3A%2F%2Fgithub.com%2Fgit-history-ui%2Fdemo');
    expect(body.url).not.toMatch(/localhost|must-not-leak|phase5-api|token/);
  });
});
