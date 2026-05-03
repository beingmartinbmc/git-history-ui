import type { LlmService, ScoreCandidate, ScoredCandidate } from './types';

const DEFAULT_MODEL = 'gpt-4.1-nano';
const DEFAULT_SUMMARY_TOKENS = 700;
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

interface OpenAiChatCompletionResponse {
  id?: string;
  object?: 'chat.completion';
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: 'assistant';
      content?: string | null;
      refusal?: string | null;
      annotations?: unknown[];
    };
    logprobs?: unknown;
    finish_reason?: string | null;
  }>;
  usage?: unknown;
  service_tier?: string;
  system_fingerprint?: string;
}

export class OpenAiProvider implements LlmService {
  readonly name = 'openai' as const;
  readonly isAi = true;
  constructor(
    private apiKey: string,
    private model: string = DEFAULT_MODEL
  ) {}

  async score(query: string, candidates: ScoreCandidate[]): Promise<ScoredCandidate[]> {
    if (candidates.length === 0) return [];
    const items = candidates.map((c, i) => ({
      idx: i,
      id: c.id,
      text: c.text.replace(/\s+/g, ' ').slice(0, 240)
    }));
    const prompt = [
      'You score commit relevance to a developer query.',
      'Return ONLY a JSON object {"scores":[{"idx":number,"score":number}]} with score in [0,1].',
      `Query: ${query}`,
      'Candidates:',
      ...items.map((it) => `[${it.idx}] ${it.text}`)
    ].join('\n');

    const text = await this.call(prompt, 1024, true);
    const parsed = parseScores(text, items.length);
    return items.map((it) => ({ id: it.id, score: parsed[it.idx] ?? 0 }));
  }

  async summarize(text: string, opts?: { hint?: string; maxTokens?: number }): Promise<string> {
    const prompt = [
      opts?.hint ?? 'Summarize the following text in one short paragraph (max 3 sentences).',
      '---',
      text.length > 8000 ? text.slice(0, 8000) + '\n[truncated]' : text
    ].join('\n');
    const out = await this.call(prompt, opts?.maxTokens ?? DEFAULT_SUMMARY_TOKENS, false);
    return out.trim();
  }

  private async call(prompt: string, maxTokens: number, json: boolean): Promise<string> {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
        ...(json ? { response_format: { type: 'json_object' } } : {})
      })
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`openai ${resp.status}: ${err.slice(0, 200)}`);
    }
    const data = (await resp.json()) as OpenAiChatCompletionResponse;
    return extractContent(data);
  }
}

function extractContent(data: OpenAiChatCompletionResponse): string {
  const content = data.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

function parseScores(raw: string, length: number): Record<number, number> {
  const result: Record<number, number> = {};
  // Try {scores:[...]} first, then bare array.
  let parsedArr: Array<{ idx: number; score: number }> | null = null;
  try {
    const obj = JSON.parse(raw) as { scores?: Array<{ idx: number; score: number }> };
    if (Array.isArray(obj?.scores)) parsedArr = obj.scores;
  } catch {
    /* fall through */
  }
  if (!parsedArr) {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsedArr = JSON.parse(match[0]) as Array<{ idx: number; score: number }>;
      } catch {
        /* ignore */
      }
    }
  }
  if (!parsedArr) return result;
  for (const item of parsedArr) {
    if (typeof item?.idx === 'number' && item.idx >= 0 && item.idx < length) {
      const s = Number(item.score);
      if (Number.isFinite(s)) result[item.idx] = Math.max(0, Math.min(1, s));
    }
  }
  return result;
}
