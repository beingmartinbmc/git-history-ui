/**
 * Wall-clock benchmarks for the hot paths that surface lag on huge
 * repos. Budgets are deliberately loose enough to pass on a slow CI
 * runner while still failing loudly if someone re-introduces an O(n^2)
 * loop or a per-commit subprocess fan-out.
 *
 * If a budget below trips, do not just bump the number — find the
 * regression. These exist because users with 100k+ commit repos
 * already hit visible lag in earlier versions.
 */

import { GitService } from '../backend/gitService';
import { computeInsights } from '../backend/insights';
import { runNlSearch } from '../backend/search/nlSearch';
import { buildCommitGroups } from '../backend/grouping/prGrouping';
import { getDefaultLlmService } from '../backend/llm';
import { makeBigRepo } from './helpers/repo';

const COMMIT_COUNT = 1500;
// Budgets in ms. CI machines vary; we set ceilings ~3-5x typical local
// numbers so they pass on slow boxes but still catch real regressions
// (which usually balloon by 10-100x).
const BUDGET_FIRST_PAGE_MS = 1500;
const BUDGET_FULL_PAGE_MS = 2500;
const BUDGET_NUMSTAT_MS = 4000;
const BUDGET_INSIGHTS_MS = 6000;
const BUDGET_NL_SEARCH_MS = 3000;
const BUDGET_GROUPING_MS = 1500;
const BUDGET_STREAM_MS = 5000;

describe('performance: large repo (synthetic 1.5k commits)', () => {
  let repo: ReturnType<typeof makeBigRepo>;
  let gs: GitService;

  beforeAll(() => {
    repo = makeBigRepo(COMMIT_COUNT);
    gs = new GitService(repo.dir);
  }, 60_000);

  afterAll(() => {
    repo?.cleanup();
  });

  it(`first-page commits returns within ${BUDGET_FIRST_PAGE_MS}ms`, async () => {
    const t0 = Date.now();
    const page = await gs.getCommits({ page: 1, pageSize: 50 });
    const elapsed = Date.now() - t0;
    expect(page.commits).toHaveLength(50);
    expect(page.total).toBeGreaterThanOrEqual(COMMIT_COUNT);
    expect(elapsed).toBeLessThan(BUDGET_FIRST_PAGE_MS);
  });

  it(`full-page (500) returns within ${BUDGET_FULL_PAGE_MS}ms`, async () => {
    // Use a fresh service so we don't benefit from rev-list count cache.
    const fresh = new GitService(repo.dir);
    const t0 = Date.now();
    const page = await fresh.getCommits({ page: 1, pageSize: 500 });
    const elapsed = Date.now() - t0;
    expect(page.commits).toHaveLength(500);
    expect(elapsed).toBeLessThan(BUDGET_FULL_PAGE_MS);
  });

  it(`numstat for ${COMMIT_COUNT} commits returns within ${BUDGET_NUMSTAT_MS}ms`, async () => {
    const t0 = Date.now();
    const m = await gs.getNumstat({}, COMMIT_COUNT);
    const elapsed = Date.now() - t0;
    expect(m.size).toBeGreaterThan(COMMIT_COUNT * 0.95);
    expect(elapsed).toBeLessThan(BUDGET_NUMSTAT_MS);
  });

  it(`computeInsights uses numstat fast path and stays under ${BUDGET_INSIGHTS_MS}ms`, async () => {
    // Spy on getDiff to make sure we are NOT fanning out per-commit
    // diffs (the old, slow code path).
    const diffSpy = jest.spyOn(gs, 'getDiff');
    const t0 = Date.now();
    const insights = await computeInsights(gs, { maxCommits: COMMIT_COUNT });
    const elapsed = Date.now() - t0;
    expect(insights.totalCommits).toBeGreaterThan(0);
    expect(insights.hotspots.length).toBeGreaterThan(0);
    expect(insights.topContributors.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(BUDGET_INSIGHTS_MS);
    // The numstat fast path must succeed; per-commit getDiff should
    // never be called when numstat returns data.
    expect(diffSpy).not.toHaveBeenCalled();
    diffSpy.mockRestore();
  });

  it(`heuristic NL search across ${COMMIT_COUNT} commits returns within ${BUDGET_NL_SEARCH_MS}ms`, async () => {
    const llm = getDefaultLlmService({});
    const t0 = Date.now();
    const result = await runNlSearch(gs, llm, {
      query: 'fixes in the api last month',
      pageSize: 25
    });
    const elapsed = Date.now() - t0;
    expect(Array.isArray(result.commits)).toBe(true);
    expect(elapsed).toBeLessThan(BUDGET_NL_SEARCH_MS);
  });

  it(`PR grouping across ${COMMIT_COUNT} commits stays under ${BUDGET_GROUPING_MS}ms`, async () => {
    const t0 = Date.now();
    const groups = await buildCommitGroups(gs, { maxCommits: COMMIT_COUNT });
    const elapsed = Date.now() - t0;
    expect(Array.isArray(groups)).toBe(true);
    expect(elapsed).toBeLessThan(BUDGET_GROUPING_MS);
  });

  it(`streaming all ${COMMIT_COUNT} commits via async iterator stays under ${BUDGET_STREAM_MS}ms`, async () => {
    const t0 = Date.now();
    let n = 0;
    for await (const _c of gs.streamCommits({}, 250)) {
      n++;
      // Sanity: ensure we don't allocate enormous arrays.
      if (n > COMMIT_COUNT + 10) throw new Error('stream over-counted');
    }
    const elapsed = Date.now() - t0;
    expect(n).toBeGreaterThanOrEqual(COMMIT_COUNT);
    expect(elapsed).toBeLessThan(BUDGET_STREAM_MS);
  });

  it('streamRaw delivers stdout incrementally without buffering full output', async () => {
    let firstChunkAt = 0;
    let totalBytes = 0;
    const t0 = Date.now();
    await gs.streamRaw(['log', '--all', '--pretty=oneline'], (chunk) => {
      if (!firstChunkAt) firstChunkAt = Date.now() - t0;
      totalBytes += chunk.length;
    });
    expect(totalBytes).toBeGreaterThan(0);
    // Should yield first chunk well before the whole log is read.
    expect(firstChunkAt).toBeLessThan(2000);
  });
});
