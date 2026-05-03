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
  }) as unknown as Response;

const fail = (status: number, body: string): Response =>
  ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body
  }) as unknown as Response;

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
      ok({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-test',
        content: [
          {
            type: 'text',
            text: '[{"idx":0,"score":0.9},{"idx":1,"score":0.1}]',
            citations: [
              {
                type: 'char_location',
                document_index: 0,
                start_char_index: 0,
                end_char_index: 10
              }
            ]
          }
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 8 }
      })
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
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': 'key'
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'claude-test',
      max_tokens: 1024,
      messages: [{ role: 'user' }]
    });
    expect(typeof body.messages[0].content).toBe('string');
  });

  it('clamps out-of-range and ignores garbled scores', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        content: [{ type: 'text', text: 'noise [{"idx":0,"score":5},{"idx":1,"score":"bad"}]' }]
      })
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
    expect(body.max_tokens).toBe(700);
    expect(body.messages[0].content).toContain('[truncated]');
    expect(body.messages[0].content.startsWith('short pls')).toBe(true);
  });

  it('honors custom Anthropic summary token budgets', async () => {
    mockFetch.mockResolvedValueOnce(ok({ content: [{ type: 'text', text: 'custom budget' }] }));
    const p = new AnthropicProvider('k');
    await p.summarize('blob', { maxTokens: 900 });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(900);
  });

  it('joins multiple Anthropic text blocks and ignores non-text blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        content: [
          { type: 'text', text: 'First sentence.' },
          { type: 'thinking', thinking: 'internal metadata' },
          { type: 'text', text: 'Second sentence.' }
        ]
      })
    );
    const p = new AnthropicProvider('k');
    await expect(p.summarize('blob')).resolves.toBe('First sentence.\nSecond sentence.');
  });

  it('summarize uses a default hint when none is provided and returns "" when there is no text block', async () => {
    mockFetch.mockResolvedValueOnce(ok({ content: [{ type: 'image', text: undefined }] }));
    const p = new AnthropicProvider('k');
    const out = await p.summarize('short blob');
    expect(out).toBe('');
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
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
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1777791434,
        model: 'gpt-test',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '{"scores":[{"idx":0,"score":0.8},{"idx":1,"score":0.2}]}',
              refusal: null,
              annotations: []
            },
            logprobs: null,
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 6,
          total_tokens: 16
        },
        service_tier: 'default',
        system_fingerprint: 'fp_test'
      })
    );
    const p = new OpenAiProvider('key', 'gpt-test');
    const out = await p.score('q', [
      { id: 'a', text: 'a' },
      { id: 'b', text: 'b' }
    ]);
    expect(out).toEqual([
      { id: 'a', score: 0.8 },
      { id: 'b', score: 0.2 }
    ]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer key'
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'gpt-test',
      max_tokens: 1024,
      messages: [{ role: 'user' }],
      response_format: { type: 'json_object' }
    });
    expect(typeof body.messages[0].content).toBe('string');
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
      ok({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '\n\nA short summary.',
              refusal: null,
              annotations: []
            },
            finish_reason: 'stop'
          }
        ]
      })
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
    expect(body.model).toBe('gpt-4.1-nano');
    expect(body.max_tokens).toBe(700);
    expect(body.messages[0].content).toMatch(/Summarize the following text/);
  });

  it('honors custom OpenAI summary token budgets', async () => {
    mockFetch.mockResolvedValueOnce(ok({ choices: [{ message: { content: 'custom budget' } }] }));
    const p = new OpenAiProvider('k');
    await p.summarize('blob', { maxTokens: 900 });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(900);
  });

  it('returns "" when the response has no choices', async () => {
    mockFetch.mockResolvedValueOnce(ok({ choices: [] }));
    const p = new OpenAiProvider('k');
    await expect(p.summarize('x')).resolves.toBe('');
  });

  it('returns "" when the OpenAI assistant content is null', async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        choices: [
          { message: { role: 'assistant', content: null, refusal: 'refused', annotations: [] } }
        ]
      })
    );
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
    delete process.env.GHUI_LLM_MODEL;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.OPENAI_MODEL;
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
    expect(createLlmService({ provider: 'anthropic', anthropicApiKey: 'k' }).name).toBe(
      'anthropic'
    );
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

  it('uses GHUI_LLM_MODEL as a generic exported model override', async () => {
    const originalFetch = global.fetch;
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(ok({ content: [{ type: 'text', text: 'ok' }] }));
    global.fetch = mockFetch as unknown as typeof fetch;
    try {
      process.env.ANTHROPIC_API_KEY = 'k';
      process.env.GHUI_LLM_MODEL = 'claude-custom-generic';
      await createLlmService().summarize('blob');
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.model).toBe('claude-custom-generic');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses provider-specific exported model overrides before GHUI_LLM_MODEL', async () => {
    const originalFetch = global.fetch;
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(ok({ choices: [{ message: { content: 'ok' } }] }));
    global.fetch = mockFetch as unknown as typeof fetch;
    try {
      process.env.GHUI_LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'k';
      process.env.GHUI_LLM_MODEL = 'gpt-generic';
      process.env.OPENAI_MODEL = 'gpt-openai-specific';
      await createLlmService().summarize('blob');
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.model).toBe('gpt-openai-specific');
    } finally {
      global.fetch = originalFetch;
    }
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

  it('refreshes the cached service when exported model changes', () => {
    process.env.OPENAI_API_KEY = 'k';
    process.env.GHUI_LLM_PROVIDER = 'openai';
    process.env.OPENAI_MODEL = 'gpt-one';
    const a = getDefaultLlmService();
    const b = getDefaultLlmService();
    expect(a).toBe(b);
    process.env.OPENAI_MODEL = 'gpt-two';
    const c = getDefaultLlmService();
    expect(c).not.toBe(a);
    expect(c.name).toBe('openai');
  });
});
