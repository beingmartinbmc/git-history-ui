import { serializeDeepLink } from '../deepLink';
import { isSafeRef, type Commit, type DiffFileMeta, type GitService } from './gitService';
import { getRepositoryIdentity, type RepositoryIdentity } from './repositoryIdentity';

export interface InvestigationReport {
  schemaVersion: 1;
  repository: RepositoryIdentity;
  target:
    | { type: 'commit'; hash: string; subject: string; author: string; date: string }
    | { type: 'range'; from: string; to: string };
  summary: {
    commits: number;
    files: number;
    additions: number;
    deletions: number;
    modules: string[];
  };
  files: DiffFileMeta[];
  relatedCommits: Array<Pick<Commit, 'hash' | 'shortHash' | 'subject' | 'author' | 'date'>>;
  portableUrl: string | null;
}

export interface PrImpactReport extends InvestigationReport {
  comparison: { base: string; head: string; mergeBase: string };
}

export async function buildCommitReport(
  git: GitService,
  hash: string,
  signal?: AbortSignal
): Promise<InvestigationReport> {
  const [repository, commit, metadata] = await Promise.all([
    getRepositoryIdentity(git),
    git.getCommit(hash, { signal }),
    git.getDiffMeta(hash, { signal })
  ]);
  const related = await git.getCommitsForFiles(
    metadata.files.map((file) => file.file),
    12,
    { signal }
  );
  return {
    schemaVersion: 1,
    repository,
    target: {
      type: 'commit',
      hash: commit.hash,
      subject: commit.subject,
      author: commit.author,
      date: commit.date
    },
    summary: summarize(metadata.files, 1),
    files: metadata.files,
    relatedCommits: compactCommits(
      related.filter((item) => item.hash !== commit.hash).slice(0, 10)
    ),
    portableUrl: portable(repository, { view: 'history', commit: commit.hash })
  };
}

export async function buildRangeReport(
  git: GitService,
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<InvestigationReport> {
  const [repository, metadata] = await Promise.all([
    getRepositoryIdentity(git),
    git.getRangeMetadata(from, to, { signal })
  ]);
  return {
    schemaVersion: 1,
    repository,
    target: { type: 'range', from, to },
    summary: summarize(metadata.files, metadata.commitCount),
    files: metadata.files,
    relatedCommits: compactCommits(metadata.commits.slice(0, 100)),
    portableUrl: portable(repository, { view: 'compare', from, to })
  };
}

export async function buildPrImpactReport(
  git: GitService,
  base: string,
  head: string,
  signal?: AbortSignal
): Promise<PrImpactReport> {
  if (!isSafeRef(base) || !isSafeRef(head)) throw new Error('Invalid base or head ref');
  let mergeBase: string;
  try {
    mergeBase = (await git.runRaw(['merge-base', base, head], { signal })).trim();
    if (!mergeBase) throw new Error('empty merge base');
  } catch {
    const shallow = (
      await git.runRaw(['rev-parse', '--is-shallow-repository']).catch(() => 'false')
    )
      .trim()
      .toLowerCase();
    if (shallow === 'true') {
      throw new Error(
        'Cannot compute PR impact from a shallow clone. Fetch full history (actions/checkout fetch-depth: 0).'
      );
    }
    throw new Error(`Cannot find a merge base for ${base} and ${head}. Fetch both refs and retry.`);
  }
  const report = await buildRangeReport(git, mergeBase, head, signal);
  return { ...report, comparison: { base, head, mergeBase } };
}

export function formatPrImpactMarkdown(report: PrImpactReport): string {
  return [
    `<!-- git-history-ui pr-impact: ${escapeMarkdown(report.comparison.base)}...${escapeMarkdown(report.comparison.head)} -->`,
    `**PR range:** \`${escapeMarkdown(report.comparison.base)}\` → \`${escapeMarkdown(report.comparison.head)}\` (merge base \`${escapeMarkdown(report.comparison.mergeBase)}\`)`,
    '',
    formatReportMarkdown(report)
  ].join('\n');
}

export function formatReportMarkdown(report: InvestigationReport): string {
  const target =
    report.target.type === 'commit'
      ? `${escapeMarkdown(report.target.subject)} (\`${escapeMarkdown(report.target.hash)}\`)`
      : `\`${escapeMarkdown(report.target.from)}\` → \`${escapeMarkdown(report.target.to)}\``;
  const lines = [
    `# Investigation report: ${escapeMarkdown(report.repository.name)}`,
    '',
    `**Target:** ${target}`,
    `**Summary:** ${report.summary.commits} commits, ${report.summary.files} files, +${report.summary.additions} / -${report.summary.deletions}`,
    report.summary.modules.length
      ? `**Modules:** ${report.summary.modules.map(escapeMarkdown).join(', ')}`
      : '**Modules:** none',
    report.portableUrl
      ? `**Portable link:** ${report.portableUrl}`
      : '**Portable link:** unavailable',
    '',
    '## Files',
    ''
  ];
  if (report.files.length === 0) lines.push('_No file changes._');
  for (const file of report.files) {
    const rename = file.oldFile
      ? `${escapeMarkdown(file.oldFile)} → ${escapeMarkdown(file.file)}`
      : escapeMarkdown(file.file);
    lines.push(
      `- \`${rename}\` (${escapeMarkdown(file.status)}, +${file.additions} / -${file.deletions})`
    );
  }
  lines.push('', '## Related commits', '');
  if (report.relatedCommits.length === 0) lines.push('_No related commits._');
  for (const commit of report.relatedCommits) {
    lines.push(
      `- \`${escapeMarkdown(commit.shortHash)}\` ${escapeMarkdown(commit.subject)} — ${escapeMarkdown(commit.author)}`
    );
  }
  return `${lines.join('\n')}\n`;
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[\0\r\n]+/g, ' ').replace(/([\\`*_[\]{}()<>#+\-.!|])/g, '\\$1');
}

function summarize(files: DiffFileMeta[], commits: number): InvestigationReport['summary'] {
  return {
    commits,
    files: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    modules: Array.from(
      new Set(files.map((file) => file.file.split('/')[0]).filter(Boolean))
    ).sort()
  };
}

function compactCommits(commits: Commit[]): InvestigationReport['relatedCommits'] {
  return commits.map(({ hash, shortHash, subject, author, date }) => ({
    hash,
    shortHash,
    subject,
    author,
    date
  }));
}

function portable(
  repository: RepositoryIdentity,
  state: { view: 'history'; commit: string } | { view: 'compare'; from: string; to: string }
): string | null {
  if (!repository.remoteUrl) return null;
  return serializeDeepLink({ ...state, repo: repository.remoteUrl });
}
