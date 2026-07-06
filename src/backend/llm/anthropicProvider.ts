import type { LlmService, ScoreCandidate, ScoredCandidate } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_SUMMARY_TOKENS = 700;
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

interface AnthropicTextBlock {
  type: 'text';
  text: string;
  citations?: unknown[];
}

interface AnthropicMessageResponse {
  type?: 'message';
  role?: 'assistant';
  content?: Array<AnthropicTextBlock | { type: string; [key: string]: unknown }>;
  stop_reason?: string | null;
  usage?: unknown;
}

export class AnthropicProvider implements LlmService {
  readonly name = 'anthropic' as const;
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

    // Batch to avoid response truncation: each item ~20 output tokens,
    // plus JSON overhead. 40 items ≈ 800 output tokens fits in 1024 safely.
    const BATCH = 40;
    const allScores: Record<number, number> = {};
    for (let start = 0; start < items.length; start += BATCH) {
      const batch = items.slice(start, start + BATCH);
      const prompt = [
        'You score commit relevance to a developer query.',
        'Return ONLY a JSON array of {idx:number,score:number} where score is in [0,1].',
        'No prose, no markdown.',
        `Query: ${query}`,
        'Candidates:',
        ...batch.map((it) => `[${it.idx}] ${it.text}`)
      ].join('\n');
      const text = await this.call(prompt, 1024);
      const parsed = parseScores(text, items.length);
      for (const [k, v] of Object.entries(parsed)) allScores[Number(k)] = v;
    }
    return items.map((it) => ({ id: it.id, score: allScores[it.idx] ?? 0 }));
  }

  async summarize(text: string, opts?: { hint?: string; maxTokens?: number }): Promise<string> {
    const prompt = [
      opts?.hint ?? 'Summarize the following text in one short paragraph (max 3 sentences).',
      '---',
      text.length > 8000 ? text.slice(0, 8000) + '\n[truncated]' : text
    ].join('\n');
    const out = await this.call(prompt, opts?.maxTokens ?? DEFAULT_SUMMARY_TOKENS);
    return out.trim();
  }

  private async call(prompt: string, maxTokens: number): Promise<string> {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': VERSION
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(60_000)
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`anthropic ${resp.status}: ${err.slice(0, 200)}`);
    }
    const data = (await resp.json()) as AnthropicMessageResponse;
    return extractText(data);
  }
}

function extractText(data: AnthropicMessageResponse): string {
  return (data.content ?? [])
    .filter(
      (block): block is AnthropicTextBlock =>
        block.type === 'text' && typeof (block as AnthropicTextBlock).text === 'string'
    )
    .map((block) => block.text)
    .join('\n');
}

function parseScores(raw: string, length: number): Record<number, number> {
  const result: Record<number, number> = {};
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return result;
  try {
    const arr = JSON.parse(match[0]) as Array<{ idx: number; score: number }>;
    for (const item of arr) {
      if (typeof item?.idx === 'number' && item.idx >= 0 && item.idx < length) {
        const s = Number(item.score);
        if (Number.isFinite(s)) result[item.idx] = Math.max(0, Math.min(1, s));
      }
    }
  } catch {
    /* ignore — return what we have */
  }
  return result;
}
