import {
  HeuristicProvider,
  createLlmService,
  expandKeywords,
  tokenize,
  _resetLlmCache
} from '../backend/llm';

describe('heuristic LLM provider', () => {
  beforeEach(() => _resetLlmCache());

  describe('tokenize / expandKeywords', () => {
    it('lower-cases and strips punctuation/stopwords', () => {
      expect(tokenize('Fix the LOGIN bug, please')).toEqual(['fix', 'login', 'bug', 'please']);
    });

    it('expands synonyms', () => {
      const exp = expandKeywords('login bug');
      expect(exp).toEqual(expect.arrayContaining(['login', 'auth', 'authentication', 'bug', 'fix']));
    });
  });

  describe('score()', () => {
    it('ranks matching candidates higher than non-matching ones', async () => {
      const p = new HeuristicProvider();
      const result = await p.score('login bug', [
        { id: 'a', text: 'fix login regression in auth flow' },
        { id: 'b', text: 'update README with installation instructions' },
        { id: 'c', text: 'refactor billing service' }
      ]);
      const map = new Map(result.map((r) => [r.id, r.score]));
      expect(map.get('a')!).toBeGreaterThan(map.get('b')!);
      expect(map.get('a')!).toBeGreaterThan(map.get('c')!);
    });

    it('returns zero scores for empty query', async () => {
      const p = new HeuristicProvider();
      const result = await p.score('', [{ id: 'a', text: 'anything' }]);
      expect(result[0].score).toBe(0);
    });
  });

  describe('summarize()', () => {
    it('returns the first paragraph trimmed', async () => {
      const p = new HeuristicProvider();
      const out = await p.summarize('First paragraph here.\n\nSecond para.');
      expect(out).toBe('First paragraph here.');
    });
  });

  describe('createLlmService()', () => {
    const oldEnv = { ...process.env };
    afterEach(() => {
      process.env = { ...oldEnv };
    });

    it('falls back to heuristic when no key provided', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GHUI_LLM_PROVIDER;
      const svc = createLlmService({});
      expect(svc.name).toBe('heuristic');
      expect(svc.isAi).toBe(false);
    });

    it('picks anthropic when key auto-detected', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GHUI_LLM_PROVIDER;
      process.env.ANTHROPIC_API_KEY = 'sk-test';
      const svc = createLlmService({});
      expect(svc.name).toBe('anthropic');
    });

    it('honours explicit GHUI_LLM_PROVIDER=heuristic even with key set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test';
      process.env.GHUI_LLM_PROVIDER = 'heuristic';
      const svc = createLlmService({});
      expect(svc.name).toBe('heuristic');
    });
  });
});
