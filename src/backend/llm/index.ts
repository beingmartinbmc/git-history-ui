import { AnthropicProvider } from './anthropicProvider';
import { HeuristicProvider } from './heuristicProvider';
import { OpenAiProvider } from './openaiProvider';
import type { LlmConfig, LlmProviderName, LlmService } from './types';

export type { LlmConfig, LlmProviderName, LlmService, ScoreCandidate, ScoredCandidate } from './types';
export { HeuristicProvider, expandKeywords, tokenize } from './heuristicProvider';
export { AnthropicProvider } from './anthropicProvider';
export { OpenAiProvider } from './openaiProvider';

/**
 * Resolve provider configuration from explicit config + environment.
 * Precedence:
 *   1. Explicit config.provider (must have matching key for ai providers).
 *   2. GHUI_LLM_PROVIDER env var.
 *   3. Auto-detect: anthropic key wins over openai key.
 *   4. Heuristic fallback.
 */
export function createLlmService(config: LlmConfig = {}): LlmService {
  const env = process.env;
  const anthropicKey = config.anthropicApiKey || env.ANTHROPIC_API_KEY;
  const openaiKey = config.openaiApiKey || env.OPENAI_API_KEY;
  const requested: LlmProviderName | undefined =
    config.provider || (env.GHUI_LLM_PROVIDER as LlmProviderName | undefined);

  if (requested === 'anthropic' && anthropicKey) return new AnthropicProvider(anthropicKey, config.model);
  if (requested === 'openai' && openaiKey) return new OpenAiProvider(openaiKey, config.model);
  if (requested === 'heuristic') return new HeuristicProvider();

  // Auto-detect when no explicit pick.
  if (!requested) {
    if (anthropicKey) return new AnthropicProvider(anthropicKey, config.model);
    if (openaiKey) return new OpenAiProvider(openaiKey, config.model);
  }

  return new HeuristicProvider();
}

let cached: LlmService | null = null;
let cachedKey = '';
export function getDefaultLlmService(config: LlmConfig = {}): LlmService {
  const key = JSON.stringify({
    provider: config.provider ?? process.env.GHUI_LLM_PROVIDER ?? '',
    a: !!(config.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
    o: !!(config.openaiApiKey || process.env.OPENAI_API_KEY),
    m: config.model ?? ''
  });
  if (cached && cachedKey === key) return cached;
  cached = createLlmService(config);
  cachedKey = key;
  return cached;
}

/** Force-reset for tests. */
export function _resetLlmCache(): void {
  cached = null;
  cachedKey = '';
}
