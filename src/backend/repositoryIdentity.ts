import { execFile } from 'child_process';
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

/** Split a remote into host/path; `ssh` marks scp-style and ssh:// forms (the only ones an ssh_config alias can apply to). */
function parseRemote(raw: string): { host: string; pathname: string; ssh: boolean } | null {
  const scp = raw.match(/^(?:[^@\s/:]+@)?([^:\s/]+):(.+)$/);
  if (scp && !raw.includes('://')) return { host: scp[1], pathname: scp[2], ssh: true };
  try {
    const url = new URL(raw.replace(/^git\+/, ''));
    if (!['http:', 'https:', 'ssh:'].includes(url.protocol)) return null;
    return { host: url.hostname, pathname: url.pathname, ssh: url.protocol === 'ssh:' };
  } catch {
    return null;
  }
}

/** `hostOverride` replaces the remote's host (used after resolving an ssh_config alias). */
export function canonicalizeRemoteUrl(
  value: string | null | undefined,
  hostOverride?: string
): string | null {
  const raw = value?.trim();
  if (!raw || /[\0\r\n]/.test(raw)) return null;

  const parsed = parseRemote(raw);
  if (!parsed) return null;
  const host = (hostOverride ?? parsed.host).toLowerCase();
  if (host !== 'github.com' && host !== 'gitlab.com') return null;
  const parts = parsed.pathname
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean);
  if (parts.length < 2 || parts.some((part) => part === '.' || part === '..')) return null;
  return `https://${host}/${parts.map(encodeURIComponent).join('/')}`;
}

/** The host of an ssh-style remote — the part that may be an ssh_config alias. */
function sshAlias(value: string | null): string | null {
  const parsed = value && !/[\0\r\n]/.test(value) ? parseRemote(value.trim()) : null;
  return parsed?.ssh && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parsed.host) ? parsed.host : null;
}

export type SshHostResolver = (alias: string) => Promise<string | null>;

/** Resolve an ssh_config `Host` alias to its real hostname via `ssh -G` (no connection is made). */
export const resolveSshHost: SshHostResolver = (alias) =>
  new Promise((resolve) => {
    execFile('ssh', ['-G', alias], { timeout: 3_000 }, (err, stdout) =>
      resolve(err ? null : (stdout.match(/^hostname (\S+)/im)?.[1] ?? null))
    );
  });

const IDENTITY_TTL_MS = 5_000;
const identityCache = new Map<string, { at: number; value: Promise<RepositoryIdentity> }>();

/** Spawns ~7 git processes, so share the result across the frequent callers (report, /api/repository). */
export function getRepositoryIdentity(
  git: Pick<GitService, 'cwd' | 'runRaw'>,
  runner?: GitRunner,
  resolveHost: SshHostResolver = resolveSshHost
): Promise<RepositoryIdentity> {
  if (runner) return readRepositoryIdentity(git, runner, resolveHost);
  const hit = identityCache.get(git.cwd);
  if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) return hit.value;
  const value = readRepositoryIdentity(git, (args) => git.runRaw(args), resolveHost);
  identityCache.set(git.cwd, { at: Date.now(), value });
  value.catch(() => identityCache.delete(git.cwd));
  return value;
}

async function readRepositoryIdentity(
  git: Pick<GitService, 'cwd'>,
  runner: GitRunner,
  resolveHost: SshHostResolver
): Promise<RepositoryIdentity> {
  const read = async (args: string[]): Promise<string | null> => {
    try {
      return (await runner(args)).trim() || null;
    } catch {
      return null;
    }
  };

  // Explicit `git config git-history-ui.remoteUrl <url>` wins; otherwise origin, and if
  // that uses an ssh_config alias (e.g. github-personal) resolve it to the real host.
  const configured = canonicalizeRemoteUrl(
    await read(['config', '--get', 'git-history-ui.remoteUrl'])
  );
  const origin = await read(['remote', 'get-url', 'origin']);
  let remoteUrl = configured ?? canonicalizeRemoteUrl(origin);
  if (!remoteUrl) {
    const alias = sshAlias(origin);
    const real = alias ? await resolveHost(alias) : null;
    if (real) remoteUrl = canonicalizeRemoteUrl(origin, real);
  }
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
