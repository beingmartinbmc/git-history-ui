import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, type Server as HttpServer } from 'http';
import path from 'path';
import fs from 'fs';
import { GitService, NotARepositoryError } from './gitService';
import { runNlSearch } from './search/nlSearch';
import { buildCommitGroups } from './grouping/prGrouping';
import { getSnapshot } from './snapshot';
import { getDefaultLlmService, type LlmConfig } from './llm';
import { getCommitImpact } from './impact';
import { computeInsights } from './insights';
import { AnnotationsStore } from './annotations';
import { SqliteIndex } from './cache/sqliteIndex';

export interface ServerOptions {
  port?: number;
  host?: string;
  file?: string;
  since?: string;
  author?: string;
  cwd?: string;
  llm?: LlmConfig;
  githubToken?: string;
}

export interface BootResult {
  server: HttpServer;
  url: string;
  close: () => Promise<void>;
}

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = 'localhost';

export async function startServer(
  port: number = DEFAULT_PORT,
  host: string = DEFAULT_HOST,
  options: Partial<ServerOptions> = {}
): Promise<BootResult> {
  const cwd = options.cwd ?? process.cwd();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' }
    })
  );

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return cb(null, true);
        }
        return cb(new Error('CORS not allowed'), false);
      },
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-Requested-With']
    })
  );

  app.use(compression());
  app.use(express.json({ limit: '128kb' }));

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api', apiLimiter);

  const gitService = new GitService(cwd);
  const llmService = getDefaultLlmService(options.llm ?? {});
  const githubToken = options.githubToken ?? process.env.GITHUB_TOKEN;
  const annotations = new AnnotationsStore(cwd);
  const sqliteIndex = new SqliteIndex(cwd, (args) => gitService.runRaw(args, { maxBuffer: 256 * 1024 * 1024 }));

  const angularBuildPath = path.join(__dirname, '../../build/frontend');
  const publicPath = path.join(__dirname, '../../public');
  const staticDir = fs.existsSync(angularBuildPath) ? angularBuildPath : publicPath;
  const indexFile = path.join(staticDir, 'index.html');

  app.use(express.static(staticDir, { etag: true, maxAge: '1h' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), pid: process.pid });
  });

  app.get('/api/version', (_req, res) => {
    res.json({
      name: 'git-history-ui',
      version: pkgVersion(),
      llm: { provider: llmService.name, isAi: llmService.isAi },
      githubEnrichment: !!githubToken,
      sqliteAvailable: SqliteIndex.isAvailable()
    });
  });

  app.get(
    '/api/index/stats',
    wrap(async (_req, res) => {
      const stats = await sqliteIndex.stats();
      res.json(stats);
    })
  );

  app.post(
    '/api/index/build',
    wrap(async (_req, res) => {
      const stats = await sqliteIndex.build();
      res.json(stats);
    })
  );

  app.get('/api/commits/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let cancelled = false;
    req.on('close', () => {
      cancelled = true;
    });

    (async () => {
      try {
        let count = 0;
        const author = stringParam(req.query.author);
        const since = stringParam(req.query.since);
        const until = stringParam(req.query.until);
        const file = stringParam(req.query.file);
        for await (const commit of gitService.streamCommits({ author, since, until, file })) {
          if (cancelled) break;
          send('commit', commit);
          count++;
          // Yield to the event loop occasionally so we don't block heartbeats.
          if (count % 50 === 0) await new Promise((r) => setImmediate(r));
        }
        if (!cancelled) {
          send('done', { total: count });
          res.end();
        }
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'stream error' });
        res.end();
      }
    })();
  });

  app.get(
    '/api/commits',
    wrap(async (req, res) => {
      const result = await gitService.getCommits({
        file: stringParam(req.query.file),
        since: stringParam(req.query.since),
        until: stringParam(req.query.until),
        author: stringParam(req.query.author),
        search: stringParam(req.query.search ?? req.query.q),
        page: numberParam(req.query.page, 1),
        pageSize: numberParam(req.query.pageSize, 25)
      });
      res.json(result);
    })
  );

  app.get(
    '/api/commit/:hash',
    wrap(async (req, res) => {
      const commit = await gitService.getCommit(req.params.hash);
      res.json(commit);
    })
  );

  app.get(
    '/api/diff/:hash',
    wrap(async (req, res) => {
      const diff = await gitService.getDiff(req.params.hash);
      res.json(diff);
    })
  );

  app.get(
    '/api/diff',
    wrap(async (req, res) => {
      const from = stringParam(req.query.from);
      const to = stringParam(req.query.to);
      if (!from || !to) {
        res.status(400).json({ error: 'from and to query params are required' });
        return;
      }
      const diff = await gitService.getRangeDiff(from, to);
      res.json(diff);
    })
  );

  app.get(
    '/api/search',
    wrap(async (req, res) => {
      const q = stringParam(req.query.q ?? req.query.query);
      if (!q) {
        res.status(400).json({ error: 'q query param is required' });
        return;
      }
      const result = await runNlSearch(gitService, llmService, {
        query: q,
        page: numberParam(req.query.page, 1),
        pageSize: numberParam(req.query.pageSize, 25)
      });
      res.json(result);
    })
  );

  app.get(
    '/api/groups',
    wrap(async (req, res) => {
      const groups = await buildCommitGroups(gitService, {
        since: stringParam(req.query.since),
        until: stringParam(req.query.until),
        author: stringParam(req.query.author),
        githubToken,
        maxCommits: numberParam(req.query.maxCommits, 1000)
      });
      res.json(groups);
    })
  );

  app.get(
    '/api/snapshot',
    wrap(async (req, res) => {
      const at = stringParam(req.query.at);
      if (!at) {
        res.status(400).json({ error: 'at query param is required' });
        return;
      }
      const snap = await getSnapshot(gitService, at);
      res.json(snap);
    })
  );

  app.get(
    '/api/file-stats',
    wrap(async (req, res) => {
      const file = stringParam(req.query.file);
      if (!file) {
        res.status(400).json({ error: 'file query param is required' });
        return;
      }
      const stats = await gitService.getFileStats(file);
      res.json(stats);
    })
  );

  app.get(
    '/api/impact/:hash',
    wrap(async (req, res) => {
      const impact = await getCommitImpact(gitService, req.params.hash);
      res.json(impact);
    })
  );

  app.get(
    '/api/insights',
    wrap(async (req, res) => {
      const bundle = await computeInsights(gitService, {
        since: stringParam(req.query.since),
        until: stringParam(req.query.until),
        maxCommits: numberParam(req.query.maxCommits, 500)
      });
      res.json(bundle);
    })
  );

  app.post(
    '/api/summarize-diff',
    wrap(async (req, res) => {
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      if (!text) {
        res.status(400).json({ error: 'text body field is required' });
        return;
      }
      if (!llmService.isAi) {
        res.status(503).json({ error: 'No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.' });
        return;
      }
      const summary = await llmService.summarize(text, {
        hint: 'Summarize this code diff in 2-3 sentences for a developer skimming the change.'
      });
      res.json({ summary, provider: llmService.name });
    })
  );

  app.post(
    '/api/explain-commit/:hash',
    wrap(async (req, res) => {
      if (!llmService.isAi) {
        res.status(503).json({ error: 'No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.' });
        return;
      }
      const commit = await gitService.getCommit(req.params.hash);
      const diff = await gitService.getDiff(req.params.hash);
      const text = [
        `Subject: ${commit.subject}`,
        commit.body ? `Body:\n${commit.body}` : '',
        'Changed files:',
        ...diff.slice(0, 25).map((f) => `- ${f.file} (+${f.additions} -${f.deletions})`)
      ]
        .filter(Boolean)
        .join('\n');
      const summary = await llmService.summarize(text, {
        hint: 'Explain in plain English what this commit changes and why a reviewer should care.'
      });
      res.json({ summary, provider: llmService.name });
    })
  );

  app.get(
    '/api/annotations/:hash',
    wrap(async (req, res) => {
      const list = await annotations.list(req.params.hash);
      res.json(list);
    })
  );

  app.post(
    '/api/annotations/:hash',
    wrap(async (req, res) => {
      const author = typeof req.body?.author === 'string' ? req.body.author : 'anonymous';
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
      if (!body) {
        res.status(400).json({ error: 'body is required' });
        return;
      }
      if (body.length > 5000) {
        res.status(413).json({ error: 'comment too long' });
        return;
      }
      const created = await annotations.add(req.params.hash, { author, body });
      res.status(201).json(created);
    })
  );

  app.delete(
    '/api/annotations/:hash/:id',
    wrap(async (req, res) => {
      const ok = await annotations.remove(req.params.hash, req.params.id);
      res.status(ok ? 204 : 404).end();
    })
  );

  /**
   * POST /api/share — generate a shareable view-state URL.
   *
   * The current implementation is purely local: it echoes the supplied
   * `viewState` back as a URL with the state encoded in the query string,
   * so the common case ("send my colleague the link") needs no relay
   * server. Future versions may forward to an opt-in `--share-server`
   * (see CHANGELOG for v3.2 plans).
   */
  app.post(
    '/api/share',
    wrap(async (req, res) => {
      const state = req.body?.viewState;
      if (!state || typeof state !== 'object') {
        res.status(400).json({ error: 'viewState body field is required' });
        return;
      }
      // Build a query string from a flat key/value object.
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(state as Record<string, unknown>)) {
        if (v === null || v === undefined || v === '') continue;
        params.set(k, String(v));
      }
      const proto = (req.headers['x-forwarded-proto'] as string) || (req.protocol || 'http');
      const host = req.headers.host || 'localhost';
      const url = `${proto}://${host}/?${params.toString()}`;
      res.status(201).json({ url, expiresAt: null, mode: 'local' });
    })
  );

  app.get(
    '/api/blame',
    wrap(async (req, res) => {
      const file = stringParam(req.query.file);
      if (!file) {
        res.status(400).json({ error: 'file query param is required' });
        return;
      }
      const blame = await gitService.getBlame(file);
      res.json(blame);
    })
  );

  app.get('/api/tags', wrap(async (_req, res) => res.json(await gitService.getTags())));
  app.get('/api/branches', wrap(async (_req, res) => res.json(await gitService.getBranches())));
  app.get('/api/authors', wrap(async (_req, res) => res.json(await gitService.getAuthors())));

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.get('*', (_req, res) => {
    res.sendFile(indexFile, (err) => {
      if (err) res.status(404).end();
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof NotARepositoryError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    // eslint-disable-next-line no-console
    console.error('API error:', message);
    res.status(500).json({ error: message });
  });

  const httpServer = createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  const url = `http://${host}:${port}`;

  const close = (): Promise<void> =>
    new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      setTimeout(() => resolve(), 5_000).unref();
    });

  return { server: httpServer, url, close };
}

function wrap(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function stringParam(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

function numberParam(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function pkgVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '', 10) || DEFAULT_PORT;
  const host = process.env.HOST || DEFAULT_HOST;
  startServer(port, host)
    .then(({ url, close }) => {
      // eslint-disable-next-line no-console
      console.log(`git-history-ui listening on ${url}`);
      const shutdown = (sig: string) => {
        // eslint-disable-next-line no-console
        console.log(`\nReceived ${sig}, shutting down...`);
        close().then(() => process.exit(0));
        setTimeout(() => process.exit(1), 10_000).unref();
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
