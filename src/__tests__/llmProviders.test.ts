import { AnthropicProvider } from '../backend/llm/anthropicProvider';
import { OpenAiProvider } from '../backend/llm/openaiProvider';
import { createLlmService, _resetLlmCache, getDefaultLlmService } from '../backend/llm';

type FetchMock = jest.MockedFunction<typeof fetch>;

const ok = (json: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => JSON.stringify(json)
  } as unknown as Response);

const fail = (status: number, body: string): Response =>
  ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body
  } as unknown as Response);

describe('AnthropicProvider', () => {
  let originalFetch: typeof fetch;
  let mockFetch: FetchMock;
  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = jest.fn() as unknown as FetchMock;
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('declares its name and AI flag', () => {
    const p = new AnthropicProvider('k');
    expect(p.name).toBe('anthropic');
    expect(p.isAi).toBe(true);
  });

  it('returns an empty array if there are no candidates', async () => {
    const p = new AnthropicProvider('k');
    await expect(p.score('q', [])).resolves.toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('parses scored candidates from the model JSON response', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ content: [{ type: 'text', text: '[{"idx":0,"score":0.9},{"idx":1,"score":0.1}]' }] })
    );
    const p = new AnthropicProvider('key', 'claude-test');
    const out = await p.score('login bug', [
      { id: 'a', text: 'fix login redirect bug' },
      { id: 'b', text: 'add new payments method' }
    ]);
    expect(out).toEqual([
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.1 }
    ]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('api.anthropic.com');
    expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'key' });
  });

  it('clamps out-of-range and ignores garbled scores', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ content: [{ type: 'text', text: 'noise [{"idx":0,"score":5},{"idx":1,"score":"bad"}]' }] })
    );
    const p = new AnthropicProvider('k');
    const out = await p.score('q', [
      { id: 'a', text: 'a' },
      { id: 'b', text: 'b' }
    ]);
    expect(out).toEqual([
      { id: 'a', score: 1 },
      { id: 'b', score: 0 }
    ]);
  });

  it('returns 0-scored items when JSON cannot be parsed', async () => {
    mockFetch.mockResolvedValueOnce(ok({ content: [{ type: 'text', text: 'no json here' }] }));
    const p = new AnthropicProvider('k');
    const out = await p.score('q', [{ id: 'a', text: 'a' }]);
    expect(out).toEqual([{ id: 'a', score: 0 }]);
  });

  it('throws on non-200 responses', async () => {
    mockFetch.mockResolvedValueOnce(fail(401, 'bad key'));
    const p = new AnthropicProvider('k');
    await expect(p.score('q', [{ id: 'a', text: 'a' }])).rejects.toThrow(/anthropic 401/);
  });

  it('summarizes long text by truncating, returns trimmed model text', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ content: [{ type: 'text', text: '   The change adds a new endpoint.\n' }] })
    );
    const p = new AnthropicProvider('k');
    const long = 'x'.repeat(9000);
    const out = await p.summarize(long, { hint: 'short pls' });
    expect(out).toBe('The change adds a new endpoint.');
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain('[truncated]');
    expect(body.messages[0].content.startsWith('short pls')).toBe(true);
  });

  it('summarize uses a default hint when none is provided and returns "" when there is no text block', async () => {
    mockFetch.mockResolvedValueOnce(ok({ content: [{ type: 'image', text: undefined }] }));
    const p = new AnthropicProvider('k');
    const out = await p.summarize('short blob');
    expect(out).toBe('');
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].content).toMatch(/Summarize the following text/);
  });
});

describe('OpenAiProvider', () => {
  let originalFetch: typeof fetch;
  let mockFetch: FetchMock;
  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = jest.fn() as unknown as FetchMock;
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses {scores:[...]} responses', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        choices: [
          { message: { content: '{"scores":[{"idx":0,"score":0.8},{"idx":1,"score":0.2}]}' } }
        ]
      })
    );
    const p = new OpenAiProvider('k');
    const out = await p.score('q', [
      { id: 'a', text: 'a' },
      { id: 'b', text: 'b' }
    ]);
    expect(out).toEqual([
      { id: 'a', score: 0.8 },
      { id: 'b', score: 0.2 }
    ]);
  });

  it('falls back to bare-array parsing', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ choices: [{ message: { content: 'noise [{"idx":0,"score":0.5}]' } }] })
    );
    const p = new OpenAiProvider('k');
    const out = await p.score('q', [{ id: 'a', text: 'a' }]);
    expect(out).toEqual([{ id: 'a', score: 0.5 }]);
  });

  it('returns 0-score items when nothing parses', async () => {
    mockFetch.mockResolvedValueOnce(ok({ choices: [{ message: { content: 'no json' } }] }));
    const p = new OpenAiProvider('k');
    const out = await p.score('q', [{ id: 'a', text: 'a' }]);
    expect(out).toEqual([{ id: 'a', score: 0 }]);
  });

  it('throws on non-200', async () => {
    mockFetch.mockResolvedValueOnce(fail(500, 'oops'));
    const p = new OpenAiProvider('k');
    await expect(p.score('q', [{ id: 'a', text: 'a' }])).rejects.toThrow(/openai 500/);
  });

  it('summarize returns the first choice content trimmed', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ choices: [{ message: { content: '\n\nA short summary.' } }] })
    );
    const p = new OpenAiProvider('k');
    await expect(p.summarize('blob')).resolves.toBe('A short summary.');
  });

  it('returns empty array for empty candidates', async () => {
    const p = new OpenAiProvider('k');
    await expect(p.score('q', [])).resolves.toEqual([]);
  });

  it('summarize uses a default hint when none is provided', async () => {
    mockFetch.mockResolvedValueOnce(ok({ choices: [{ message: { content: 'fine' } }] }));
    const p = new OpenAiProvider('k');
    await expect(p.summarize('blob')).resolves.toBe('fine');
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].content).toMatch(/Summarize the following text/);
  });

  it('returns "" when the response has no choices', async () => {
    mockFetch.mockResolvedValueOnce(ok({ choices: [] }));
    const p = new OpenAiProvider('k');
    await expect(p.summarize('x')).resolves.toBe('');
  });
});

describe('createLlmService', () => {
  let originalEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GHUI_LLM_PROVIDER;
    _resetLlmCache();
  });
  afterEach(() => {
    process.env = originalEnv;
    _resetLlmCache();
  });

  it('returns the heuristic provider with no env config', () => {
    expect(createLlmService().name).toBe('heuristic');
  });

  it('honors the explicit provider config (anthropic)', () => {
    expect(createLlmService({ provider: 'anthropic', anthropicApiKey: 'k' }).name).toBe('anthropic');
  });

  it('honors the explicit provider config (openai)', () => {
    expect(createLlmService({ provider: 'openai', openaiApiKey: 'k' }).name).toBe('openai');
  });

  it('falls back to heuristic when explicit provider lacks a key', () => {
    expect(createLlmService({ provider: 'anthropic' }).name).toBe('heuristic');
  });

  it('respects GHUI_LLM_PROVIDER env override', () => {
    process.env.GHUI_LLM_PROVIDER = 'heuristic';
    process.env.ANTHROPIC_API_KEY = 'k';
    expect(createLlmService().name).toBe('heuristic');
  });

  it('auto-detects anthropic when only that key is present', () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    expect(createLlmService().name).toBe('anthropic');
  });

  it('auto-detects openai when only that key is present', () => {
    process.env.OPENAI_API_KEY = 'k';
    expect(createLlmService().name).toBe('openai');
  });

  it('caches the default service unless config or env changes', () => {
    const a = getDefaultLlmService();
    const b = getDefaultLlmService();
    expect(a).toBe(b);
    process.env.ANTHROPIC_API_KEY = 'k';
    const c = getDefaultLlmService();
    expect(c).not.toBe(a);
    expect(c.name).toBe('anthropic');
  });
});
