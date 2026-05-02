export type LlmProviderName = 'heuristic' | 'anthropic' | 'openai';

export interface ScoreCandidate {
  id: string;
  text: string;
}

export interface ScoredCandidate {
  id: string;
  score: number;
}

export interface LlmService {
  readonly name: LlmProviderName;
  readonly isAi: boolean;
  /**
   * Re-rank candidates by semantic relevance to a query.
   * Returns scores in [0,1]. Implementations MAY return a subset of inputs
   * (heuristic returns a score for every input; AI providers may also do so).
   */
  score(query: string, candidates: ScoreCandidate[]): Promise<ScoredCandidate[]>;
  /**
   * Produce a short prose summary of an arbitrary block of text (typically
   * a unified diff or commit message body). Hard cap output at ~600 chars.
   */
  summarize(text: string, opts?: { hint?: string }): Promise<string>;
}

export interface LlmConfig {
  provider?: LlmProviderName;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  model?: string;
}
