import path from 'path';
import type { GitService } from './gitService';

export interface RepositoryIdentity {
  name: string;
  remoteUrl: string | null;
  webUrl: string | null;
  currentBranch: string | null;
  defaultBranch: string | null;
  currentAuthor: {
    name: string | null;
    email: string | null;
  };
}

export type GitRunner = (args: string[]) => Promise<string>;

export function canonicalizeRemoteUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || /[\0\r\n]/.test(raw)) return null;

  let host: string;
  let pathname: string;
  const scp = raw.match(/^(?:[^@\s/:]+@)?([^:\s/]+):(.+)$/);
  if (scp && !raw.includes('://')) {
    host = scp[1];
    pathname = scp[2];
  } else {
    try {
      const url = new URL(raw.replace(/^git\+/, ''));
      if (!['http:', 'https:', 'ssh:'].includes(url.protocol)) return null;
      host = url.hostname;
      pathname = url.pathname;
    } catch {
      return null;
    }
  }

  host = host.toLowerCase();
  if (host !== 'github.com' && host !== 'gitlab.com') return null;
  const parts = pathname
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean);
  if (parts.length < 2 || parts.some((part) => part === '.' || part === '..')) return null;
  return `https://${host}/${parts.map(encodeURIComponent).join('/')}`;
}

export async function getRepositoryIdentity(
  git: Pick<GitService, 'cwd' | 'runRaw'>,
  runner: GitRunner = (args) => git.runRaw(args)
): Promise<RepositoryIdentity> {
  const read = async (args: string[]): Promise<string | null> => {
    try {
      return (await runner(args)).trim() || null;
    } catch {
      return null;
    }
  };

  const remoteUrl = canonicalizeRemoteUrl(await read(['remote', 'get-url', 'origin']));
  const currentBranch = await read(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const remoteHead = await read(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const branchNames = (await read(['for-each-ref', '--format=%(refname:short)', 'refs/heads']))
    ?.split('\n')
    .filter(Boolean);
  const defaultBranch =
    remoteHead?.replace(/^origin\//, '') ??
    (branchNames?.includes('main')
      ? 'main'
      : branchNames?.includes('master')
        ? 'master'
        : currentBranch);
  const name =
    remoteUrl?.split('/').pop() ||
    (await read(['rev-parse', '--show-toplevel']))?.split(/[\\/]/).filter(Boolean).pop() ||
    path.basename(git.cwd);

  return {
    name,
    remoteUrl,
    webUrl: remoteUrl,
    currentBranch,
    defaultBranch,
    currentAuthor: {
      name: await read(['config', '--get', 'user.name']),
      email: await read(['config', '--get', 'user.email'])
    }
  };
}
