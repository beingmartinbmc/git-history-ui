import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, type Server as HttpServer } from 'http';
import path from 'path';
import fs from 'fs';
import { GitService, NotARepositoryError } from './gitService';

export interface ServerOptions {
  port?: number;
  host?: string;
  file?: string;
  since?: string;
  author?: string;
  cwd?: string;
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
      methods: ['GET'],
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

  const angularBuildPath = path.join(__dirname, '../../build/frontend');
  const publicPath = path.join(__dirname, '../../public');
  const staticDir = fs.existsSync(angularBuildPath) ? angularBuildPath : publicPath;
  const indexFile = path.join(staticDir, 'index.html');

  app.use(express.static(staticDir, { etag: true, maxAge: '1h' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), pid: process.pid });
  });

  app.get('/api/version', (_req, res) => {
    res.json({ name: 'git-history-ui', version: pkgVersion() });
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
