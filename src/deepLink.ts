import { canonicalizeRemoteUrl } from './backend/repositoryIdentity';

export const DEEP_LINK_VERSION = 1 as const;
export const DEEP_LINK_VIEWS = [
  'history',
  'grouped',
  'timeline',
  'insights',
  'impact',
  'compare',
  'wrapped',
  'file',
  'stash'
] as const;

export type DeepLinkView = (typeof DEEP_LINK_VIEWS)[number];

export interface DeepLink {
  v: 1;
  repo?: string;
  view: DeepLinkView;
  commit?: string;
  at?: string;
  pr?: string;
  branch?: string;
  author?: string;
  search?: string;
  file?: string;
  since?: string;
  until?: string;
  searchMode?: 'classic' | 'nl';
  mode?: 'flat' | 'grouped';
  activeFile?: string;
  from?: string;
  to?: string;
  year?: string;
  template?: string;
  palette?: string;
}

const VIEWS = new Set<string>(DEEP_LINK_VIEWS);
const TEXT_KEYS = [
  'commit',
  'at',
  'pr',
  'branch',
  'author',
  'search',
  'file',
  'since',
  'until',
  'activeFile',
  'from',
  'to',
  'year',
  'template',
  'palette'
] as const;
const HASH = /^[0-9a-f]{4,40}$/i;

export function parseDeepLink(raw: string): DeepLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'git-history-ui:' || (url.hostname && url.hostname !== 'open')) return null;
  const version = url.searchParams.get('v');
  if (version && version !== String(DEEP_LINK_VERSION)) return null;

  const viewValue = url.searchParams.get('view') || 'history';
  if (!VIEWS.has(viewValue)) return null;
  const result: DeepLink = { v: DEEP_LINK_VERSION, view: viewValue as DeepLinkView };
  const repo = url.searchParams.get('repo');
  if (repo) {
    const canonical = canonicalizeRemoteUrl(repo);
    if (!canonical) return null;
    result.repo = canonical;
  }
  for (const key of TEXT_KEYS) {
    const value = clean(url.searchParams.get(key));
    if (value) result[key] = value;
  }
  if (result.commit && !HASH.test(result.commit)) delete result.commit;
  if (result.at && !HASH.test(result.at)) delete result.at;
  if (result.pr && !/^\d{1,10}$/.test(result.pr)) delete result.pr;
  if (result.year && !/^\d{4}$/.test(result.year)) delete result.year;

  const searchMode = url.searchParams.get('searchMode');
  if (searchMode === 'classic' || searchMode === 'nl') result.searchMode = searchMode;
  const mode = url.searchParams.get('mode');
  if (mode === 'flat' || mode === 'grouped') result.mode = mode;
  if (result.view === 'grouped') result.mode = 'grouped';
  return result;
}

export function serializeDeepLink(input: Omit<DeepLink, 'v'> & { v?: 1 }): string {
  if (!VIEWS.has(input.view)) throw new Error('Invalid deep-link view');
  const repo = canonicalizeRemoteUrl(input.repo);
  if (!repo) throw new Error('A canonical GitHub or GitLab repository URL is required');

  const params = new URLSearchParams({
    v: String(DEEP_LINK_VERSION),
    repo,
    view: input.view
  });
  for (const key of TEXT_KEYS) {
    const value = clean(input[key]);
    if (value) params.set(key, value);
  }
  if (input.searchMode === 'classic' || input.searchMode === 'nl') {
    params.set('searchMode', input.searchMode);
  }
  if (input.mode === 'flat' || input.mode === 'grouped') params.set('mode', input.mode);
  return `git-history-ui://open?${params.toString()}`;
}

export function deepLinkBrowserTarget(link: DeepLink): { path: string; query: URLSearchParams } {
  const paths: Partial<Record<DeepLinkView, string>> = {
    timeline: '/timeline',
    insights: '/insights',
    compare: '/compare',
    wrapped: '/wrapped',
    stash: '/stash'
  };
  const query = new URLSearchParams();
  for (const key of TEXT_KEYS) {
    const value = link[key];
    if (value) query.set(key, value);
  }
  if (link.searchMode) query.set('searchMode', link.searchMode);
  if (link.mode) query.set('mode', link.mode);
  if (link.view === 'grouped') query.set('mode', 'grouped');
  return { path: paths[link.view] ?? '/', query };
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 500 && !/[\0\r\n]/.test(trimmed) ? trimmed : undefined;
}
