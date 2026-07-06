import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'crypto';
import { createServer, type Server as HttpServer } from 'http';
import path from 'path';
import fs from 'fs';
import { GitService, NotARepositoryError } from './gitService';
import { parseNlQuery, runNlSearch } from './search/nlSearch';
import { buildCommitGroups } from './grouping/prGrouping';
import { getSnapshot } from './snapshot';
import { getDefaultLlmService, type LlmConfig, type LlmService } from './llm';
import { getCommitImpact } from './impact';
import { getFileBreakageAnalysis } from './breakage';
import { computeInsights } from './insights';
import { computeWrapped } from './wrapped';
import { AnnotationsStore } from './annotations';
import { SqliteIndex, type IndexProgress, type IndexStats } from './cache/sqliteIndex';
import { ResultCache } from './cache/resultCache';
import { RefWatcher } from './refWatcher';
import type { InsightsBundle } from './aggregations';
import type { CommitGroup } from './grouping/prGrouping';
import type { WrappedStats } from './wrapped';

export interface ServerOptions {
  port?: number;
  host?: string;
  file?: string;
  since?: string;
  author?: string;
  cwd?: string;
  llm?: LlmConfig;
  /** Inject a pre-built LLM service (escape hatch for tests). Overrides `llm`. */
  llmService?: LlmService;
  githubToken?: string;
  /** Optional bearer/header/query token for protecting API routes on shared networks. */
  authToken?: string;
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
  const authToken = options.authToken ?? process.env.GIT_HISTORY_UI_TOKEN;

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"]
        }
      }
    })
  );

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      res.status(403).json({ error: 'CORS not allowed' });
      return;
    }
    next();
  });

  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization', 'X-Git-History-Token']
    })
  );

  app.use(
    compression({
      filter: (req, res) => {
        if (req.path === '/api/commits/stream') return false;
        return compression.filter(req, res);
      }
    })
  );
  app.use(express.json({ limit: '128kb' }));

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api', apiLimiter);
  app.use('/api', requireAuth(authToken));

  const gitService = new GitService(cwd);
  const llmConfig = options.llm ?? {};
  const fixedLlmService = options.llmService ?? null;
  const getLlm = (): LlmService => fixedLlmService ?? getDefaultLlmService(llmConfig);
  const githubToken = options.githubToken ?? process.env.GITHUB_TOKEN;
  const annotations = new AnnotationsStore(cwd);
  const sqliteIndex = new SqliteIndex(
    cwd,
    (args) => gitService.runRaw(args, { maxBuffer: 256 * 1024 * 1024 }),
    (args, onChunk, streamOpts) => gitService.streamRaw(args, onChunk, streamOpts)
  );
  const indexBuild = createIndexBuildController(sqliteIndex);
  const insightsCache = new ResultCache<InsightsBundle>(15_000);
  const groupsCache = new ResultCache<CommitGroup[]>(15_000);
  const wrappedCache = new ResultCache<WrappedStats>(30_000);

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
      llm: { provider: getLlm().name, isAi: getLlm().isAi },
      githubEnrichment: !!githubToken,
      sqliteAvailable: SqliteIndex.isAvailable()
    });
  });

  app.get(
    '/api/index/stats',
    wrap(async (_req, res) => {
      res.json(await indexBuild.status());
    })
  );

  app.get(
    '/api/index/status',
    wrap(async (_req, res) => {
      res.json(await indexBuild.status());
    })
  );

  app.post(
    '/api/index/build',
    wrap(async (req, res) => {
      const wait = booleanParam(req.query.wait, false);
      const status = wait ? await indexBuild.buildAndWait() : await indexBuild.start();
      res.status(status.running && !wait ? 202 : 200).json(status);
    })
  );

  app.post(
    '/api/index/rebuild',
    wrap(async (_req, res) => {
      const status = await indexBuild.start(true);
      res.status(202).json(status);
    })
  );

  app.post(
    '/api/index/cancel',
    wrap(async (_req, res) => {
      res.json(await indexBuild.cancel());
    })
  );

  app.get('/api/commits/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      if (cancelled) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const controller = new AbortController();
    let cancelled = false;
    req.on('close', () => {
      cancelled = true;
      controller.abort();
    });

    (async () => {
      try {
        const options = commitOptionsFromQuery(req.query, 100);
        const page = Math.max(1, options.page || 1);
        const pageSize = clampNumber(options.pageSize || 100, 1, 500);
        const skip = (page - 1) * pageSize;
        const streamOptions = { ...options, page: undefined, pageSize: undefined };

        let seen = 0;
        let emitted = 0;
        let hasNext = false;
        for await (const commit of gitService.streamCommits(streamOptions, 200, {
          signal: controller.signal
        })) {
          if (cancelled) break;
          if (seen++ < skip) continue;
          if (emitted >= pageSize) {
            hasNext = true;
            break;
          }
          send('commit', commit);
          emitted++;
          // Yield to the event loop occasionally so large pages don't block heartbeats.
          if (emitted % 50 === 0) await new Promise((r) => setImmediate(r));
        }

        if (!cancelled) {
          const total = hasNext
            ? await gitService.countCommits(streamOptions, { signal: controller.signal })
            : skip + emitted;
          send('done', {
            total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            hasNext,
            hasPrevious: page > 1
          });
          res.end();
        }
      } catch (err) {
        if (cancelled) return;
        send('error', { message: err instanceof Error ? err.message : 'stream error' });
        res.end();
      }
    })();
  });

  // Live ref watcher: pushes SSE events when .git/refs change
  const refWatcher = new RefWatcher(cwd);
  const sseClients = new Set<import('http').ServerResponse>();
  refWatcher.on('change', () => {
    const payload = `event: new-commits\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
    }
  });
  refWatcher.start();

  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    sseClients.add(res);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30_000);
    req.on('close', () => {
      sseClients.delete(res);
      clearInterval(heartbeat);
    });
  });

  app.get(
    '/api/commits',
    wrap(async (req, res) => {
      const signal = requestAbortSignal(req);
      const result = await gitService.getCommits(commitOptionsFromQuery(req.query, 25), { signal });
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
      const diff = await gitService.getDiff(req.params.hash, { signal: requestAbortSignal(req) });
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
      const diff = await gitService.getRangeDiff(from, to, { signal: requestAbortSignal(req) });
      res.json(diff);
    })
  );

  // Lazy diff: returns only file metadata (no change bodies) for large commits
  app.get(
    '/api/diff/:hash/files',
    wrap(async (req, res) => {
      const diff = await gitService.getDiff(req.params.hash, { signal: requestAbortSignal(req) });
      const files = diff.map((f) => ({
        file: f.file,
        oldFile: f.oldFile,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions
      }));
      const totalLines = diff.reduce((s, f) => s + f.additions + f.deletions, 0);
      res.json({ files, totalLines, isLarge: totalLines > 5000 || files.length > 50 });
    })
  );

  // Lazy diff: returns diff body for a single file within a commit
  app.get(
    '/api/diff/:hash/file',
    wrap(async (req, res) => {
      const filePath = stringParam(req.query.path);
      if (!filePath) {
        res.status(400).json({ error: 'path query param is required' });
        return;
      }
      const diff = await gitService.getDiff(req.params.hash, { signal: requestAbortSignal(req) });
      const match = diff.find((f) => f.file === filePath);
      if (!match) {
        res.status(404).json({ error: 'file not found in diff' });
        return;
      }
      res.json(match);
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
      const page = numberParam(req.query.page, 1);
      const pageSize = clampNumber(numberParam(req.query.pageSize, 25), 1, 500);
      const author = stringParam(req.query.author);
      const since = stringParam(req.query.since);
      const until = stringParam(req.query.until);
      const branch = stringParam(req.query.branch);
      const file = stringParam(req.query.file);
      // SQLite can handle author + date filters; only branch and file need git log
      const needsGitFallback = !!(branch || file);
      const stats = await sqliteIndex.stats().catch(() => ({ available: false, total: 0 }));
      if (!needsGitFallback && stats.available && stats.total > 0) {
        const filters = { author, since, until };
        const total = await sqliteIndex.searchCount(q, filters);
        const start = (page - 1) * pageSize;
        const commits = await sqliteIndex.search(q, pageSize, filters);
        // ponytail: offset via SQL LIMIT; fetch only what we need
        const offsetRows =
          start > 0
            ? await sqliteIndex.search(q, start + pageSize, filters).then((r) => r.slice(start))
            : commits;
        res.json({
          commits: start > 0 ? offsetRows : commits,
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          hasNext: start + pageSize < total,
          hasPrevious: page > 1,
          parsedQuery: parseNlQuery(q),
          usedLlm: false,
          llmProvider: 'heuristic'
        });
        return;
      }
      const result = await runNlSearch(gitService, getLlm(), {
        query: q,
        branch,
        file,
        author,
        since,
        until,
        page,
        pageSize
      });
      res.json(result);
    })
  );

  app.get(
    '/api/groups',
    wrap(async (req, res) => {
      const since = stringParam(req.query.since);
      const until = stringParam(req.query.until);
      const author = stringParam(req.query.author);
      const branch = stringParam(req.query.branch);
      const maxCommits = clampNumber(numberParam(req.query.maxCommits, 1000), 1, 5000);
      const cacheKey = ResultCache.key({ since, until, author, branch, maxCommits });
      const cached = groupsCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
      const groups = await buildCommitGroups(gitService, {
        since,
        until,
        author,
        branch,
        githubToken,
        maxCommits
      });
      groupsCache.set(cacheKey, groups);
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
      const snap = await getSnapshot(gitService, at, { signal: requestAbortSignal(req) });
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
      const impact = await getCommitImpact(gitService, req.params.hash, {
        signal: requestAbortSignal(req)
      });
      res.json(impact);
    })
  );

  app.get(
    '/api/breakage',
    wrap(async (req, res) => {
      const file = stringParam(req.query.file);
      if (!file) {
        res.status(400).json({ error: 'file query param is required' });
        return;
      }
      const limit = clampNumber(numberParam(req.query.limit, 200), 1, 1000);
      const analysis = await getFileBreakageAnalysis(gitService, file, {
        limit,
        signal: requestAbortSignal(req)
      });
      res.json(analysis);
    })
  );

  app.get(
    '/api/insights',
    wrap(async (req, res) => {
      const since = stringParam(req.query.since);
      const until = stringParam(req.query.until);
      const branch = stringParam(req.query.branch);
      const maxCommits = clampNumber(numberParam(req.query.maxCommits, 500), 1, 5000);
      const cacheKey = ResultCache.key({ since, until, branch, maxCommits });
      const cached = insightsCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
      const signal = requestAbortSignal(req);
      const bundle = await computeInsights(gitService, {
        since,
        until,
        branch,
        maxCommits,
        signal
      });
      insightsCache.set(cacheKey, bundle);
      res.json(bundle);
    })
  );

  app.get(
    '/api/wrapped',
    wrap(async (req, res) => {
      const signal = requestAbortSignal(req);
      const yearParam = numberParam(req.query.year, 0);
      const year = yearParam > 0 ? yearParam : undefined;
      const since = stringParam(req.query.since);
      const until = stringParam(req.query.until);
      const branch = stringParam(req.query.branch);
      const author = stringParam(req.query.author);
      const maxCommits = clampNumber(numberParam(req.query.maxCommits, 5000), 1, 20_000);
      const cacheKey = ResultCache.key({ year, since, until, branch, author, maxCommits });
      const cached = wrappedCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
      const wrapped = await computeWrapped(gitService, {
        year,
        since,
        until,
        branch,
        author,
        maxCommits,
        signal
      });
      wrappedCache.set(cacheKey, wrapped);
      res.json(wrapped);
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
      const llm = getLlm();
      if (!llm.isAi) {
        res
          .status(503)
          .json({ error: 'No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.' });
        return;
      }
      const summary = await llm.summarize(text, {
        hint: 'Summarize this code diff in 2-3 concise markdown bullets for a developer skimming the change.',
        maxTokens: 500
      });
      res.json({ summary, provider: llm.name });
    })
  );

  app.post(
    '/api/explain-commit/:hash',
    wrap(async (req, res) => {
      const llm = getLlm();
      if (!llm.isAi) {
        res
          .status(503)
          .json({ error: 'No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.' });
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
      const summary = await llm.summarize(text, {
        hint: 'Explain this commit in concise markdown. Use exactly these sections: "What changed" and "Why reviewers should care". Keep the answer under 220 words and finish with a complete sentence.',
        maxTokens: 900
      });
      res.json({ summary, provider: llm.name });
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
      const author = sanitizeAnnotationAuthor(req.body?.author);
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
      if (!state || typeof state !== 'object' || Array.isArray(state)) {
        res.status(400).json({ error: 'viewState body field is required' });
        return;
      }
      // Build a query string from a flat key/value object. Nested containers are
      // rejected instead of being coerced to "[object Object]" or array indices.
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(state as Record<string, unknown>)) {
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'object') {
          res.status(400).json({ error: 'viewState values must be scalar' });
          return;
        }
        params.set(k, String(v));
      }
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
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

  // Pickaxe: search for code content changes (git log -S/-G)
  app.get(
    '/api/pickaxe',
    wrap(async (req, res) => {
      const pattern = stringParam(req.query.pattern);
      if (!pattern) {
        res.status(400).json({ error: 'pattern query param is required' });
        return;
      }
      const mode = stringParam(req.query.mode) === 'G' ? 'G' : 'S';
      const commits = await gitService.pickaxeSearch(pattern, {
        mode: mode as 'S' | 'G',
        author: stringParam(req.query.author),
        since: stringParam(req.query.since),
        until: stringParam(req.query.until),
        file: stringParam(req.query.file),
        branch: stringParam(req.query.branch),
        signal: requestAbortSignal(req)
      });
      res.json({ commits, total: commits.length });
    })
  );

  // Stash explorer
  app.get(
    '/api/stashes',
    wrap(async (req, res) => {
      const stashes = await gitService.getStashes({ signal: requestAbortSignal(req) });
      res.json(stashes);
    })
  );

  // Reflog explorer
  app.get(
    '/api/reflog',
    wrap(async (req, res) => {
      const limit = clampNumber(numberParam(req.query.limit, 50), 1, 200);
      const entries = await gitService.getReflog(limit, { signal: requestAbortSignal(req) });
      res.json(entries);
    })
  );

  // Export endpoints
  app.get(
    '/api/export/commits',
    wrap(async (req, res) => {
      const format = stringParam(req.query.format) === 'csv' ? 'csv' : 'json';
      const result = await gitService.getCommits(commitOptionsFromQuery(req.query, 500), {
        signal: requestAbortSignal(req)
      });
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=commits.csv');
        const header = 'hash,shortHash,author,authorEmail,date,subject\n';
        const rows = result.commits.map(
          (c) =>
            `${c.hash},${c.shortHash},${csvEscape(c.author)},${csvEscape(c.authorEmail)},${c.date},${csvEscape(c.subject)}`
        );
        res.send(header + rows.join('\n'));
      } else {
        res.setHeader('Content-Disposition', 'attachment; filename=commits.json');
        res.json(result.commits);
      }
    })
  );

  app.get(
    '/api/export/insights',
    wrap(async (req, res) => {
      const signal = requestAbortSignal(req);
      const bundle = await computeInsights(gitService, {
        since: stringParam(req.query.since),
        until: stringParam(req.query.until),
        branch: stringParam(req.query.branch),
        signal
      });
      res.setHeader('Content-Disposition', 'attachment; filename=insights.json');
      res.json(bundle);
    })
  );

  app.get(
    '/api/export/wrapped',
    wrap(async (req, res) => {
      const signal = requestAbortSignal(req);
      const yearParam = numberParam(req.query.year, 0);
      const wrapped = await computeWrapped(gitService, {
        year: yearParam > 0 ? yearParam : undefined,
        signal
      });
      res.setHeader('Content-Disposition', 'attachment; filename=wrapped.json');
      res.json(wrapped);
    })
  );

  // Presets API (expose CLI presets to the UI)
  app.get(
    '/api/presets',
    wrap(async (_req, res) => {
      const { PresetsStore } = await import('./presets');
      const store = new PresetsStore();
      res.json(await store.list());
    })
  );

  app.post(
    '/api/presets/:name',
    wrap(async (req, res) => {
      const name = req.params.name;
      if (!name || name.length > 50) {
        res.status(400).json({ error: 'invalid preset name' });
        return;
      }
      const { PresetsStore } = await import('./presets');
      const store = new PresetsStore();
      await store.save(name, req.body ?? {});
      res.status(201).json({ name });
    })
  );

  app.delete(
    '/api/presets/:name',
    wrap(async (req, res) => {
      const { PresetsStore } = await import('./presets');
      const store = new PresetsStore();
      const ok = await store.delete(req.params.name);
      res.status(ok ? 204 : 404).end();
    })
  );

  app.get(
    '/api/tags',
    wrap(async (_req, res) => res.json(await gitService.getTags()))
  );
  app.get(
    '/api/branches',
    wrap(async (_req, res) => res.json(await gitService.getBranches()))
  );
  app.get(
    '/api/authors',
    wrap(async (req, res) =>
      res.json(await gitService.getAuthors({ signal: requestAbortSignal(req) }))
    )
  );

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
    const safeMessage = sanitizeErrorMessage(message);
    console.error('API error:', safeMessage);
    res.status(500).json({ error: safeMessage });
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
      refWatcher.stop();
      httpServer.close(() => resolve());
      setTimeout(() => resolve(), 5_000).unref();
    });

  return { server: httpServer, url, close };
}

interface IndexStatus extends IndexStats {
  running: boolean;
  progress: IndexProgress;
}

function createIndexBuildController(index: SqliteIndex) {
  let controller: AbortController | null = null;
  let running: Promise<IndexStats> | null = null;

  const status = async (): Promise<IndexStatus> => ({
    ...(await index.stats()),
    running: !!running,
    progress: index.getProgress()
  });

  const start = async (force = false): Promise<IndexStatus> => {
    if (running) return status();
    if (force) index.invalidate();
    controller = new AbortController();
    running = index
      .build({ signal: controller.signal })
      .catch((err) => {
        if (controller?.signal.aborted) return index.stats();
        throw err;
      })
      .finally(() => {
        running = null;
        controller = null;
      });
    return status();
  };

  const buildAndWait = async (): Promise<IndexStatus> => {
    if (!running) await start();
    await running;
    return status();
  };

  const cancel = async (): Promise<IndexStatus> => {
    controller?.abort();
    if (running) await running.catch(() => undefined);
    return status();
  };

  return { status, start, buildAndWait, cancel };
}

function wrap(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function isAllowedOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function requireAuth(token: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!token || isLoopbackRequest(req)) {
      next();
      return;
    }
    const supplied = authTokenFromRequest(req);
    if (supplied && safeTokenEqual(supplied, token)) {
      next();
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  };
}

function safeTokenEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function authTokenFromRequest(req: Request): string | undefined {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer;
  const header = req.headers['x-git-history-token'];
  if (typeof header === 'string') return header;
  if (Array.isArray(header)) return header[0];
  return stringParam(req.query.token);
}

function isLoopbackRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

function commitOptionsFromQuery(
  query: Request['query'],
  defaultPageSize: number
): import('./gitService').GitOptions {
  return {
    author: stringParam(query.author),
    since: stringParam(query.since),
    until: stringParam(query.until),
    file: stringParam(query.file),
    search: stringParam(query.search ?? query.q),
    branch: stringParam(query.branch),
    page: numberParam(query.page, 1),
    pageSize: clampNumber(numberParam(query.pageSize, defaultPageSize), 1, 500)
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function booleanParam(v: unknown, fallback: boolean): boolean {
  if (typeof v !== 'string') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

function sanitizeAnnotationAuthor(value: unknown): string {
  if (typeof value !== 'string') return 'anonymous';
  const cleaned = Array.from(value)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  return cleaned.slice(0, 80) || 'anonymous';
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(
    /'([^']+)' is outside repository at '[^']+'/g,
    "'$1' is outside repository"
  );
}

function requestAbortSignal(req: Request): AbortSignal {
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  return controller.signal;
}

function csvEscape(value: string): string {
  if (/[,"\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

function pkgVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    /* istanbul ignore next -- only triggers when package.json is unreadable; verified manually */
    return '0.0.0';
  }
}

/* istanbul ignore next -- bootstrap path; covered by the spawned-process cli.test.ts */
if (require.main === module) {
  const port = parseInt(process.env.PORT || '', 10) || DEFAULT_PORT;
  const host = process.env.HOST || DEFAULT_HOST;
  startServer(port, host)
    .then(({ url, close }) => {
      console.log(`git-history-ui listening on ${url}`);
      const shutdown = (sig: string) => {
        console.log(`\nReceived ${sig}, shutting down...`);
        close().then(() => process.exit(0));
        setTimeout(() => process.exit(1), 10_000).unref();
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
