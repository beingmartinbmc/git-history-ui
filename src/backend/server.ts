import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { GitService } from './gitService';

export interface ServerOptions {
  port?: number;
  host?: string;
  file?: string;
  since?: string;
  author?: string;
}

export async function startServer(
  port: number = 3000,
  host: string = 'localhost',
  options: Partial<ServerOptions> = {}
) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const gitService = new GitService();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));

  // API Routes
  app.get('/api/commits', async (req, res) => {
    try {
      const { file, since, author, limit = '100' } = req.query;
      const commits = await gitService.getCommits({
        file: file as string,
        since: since as string,
        author: author as string,
        limit: parseInt(limit as string)
      });
      res.json(commits);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/commit/:hash', async (req, res) => {
    try {
      const { hash } = req.params;
      const commit = await gitService.getCommit(hash);
      res.json(commit);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/diff/:hash', async (req, res) => {
    try {
      const { hash } = req.params;
      const diff = await gitService.getDiff(hash);
      res.json(diff);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/blame/:file', async (req, res) => {
    try {
      const { file } = req.params;
      const blame = await gitService.getBlame(file);
      res.json(blame);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/tags', async (req, res) => {
    try {
      const tags = await gitService.getTags();
      res.json(tags);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get('/api/branches', async (req, res) => {
    try {
      const branches = await gitService.getBranches();
      res.json(branches);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Serve the main HTML file
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  });

  // Socket.IO for real-time updates
  io.on('connection', (socket) => {
    console.log('Client connected');
    
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      console.log(`Server running on http://${host}:${port}`);
      resolve();
    });
  });
}
