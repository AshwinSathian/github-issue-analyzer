import { OllamaProvider } from './providers/ollama.js';
import type { LLMGenerateInput, LLMGenerateOutput } from './types.js';
import type { Config } from '../../config/schema.js';

export interface LLMProvider {
  generate(input: LLMGenerateInput): Promise<LLMGenerateOutput>;
}

export const createLLMProvider = (config: Config): LLMProvider => {
  const provider = config.LLM_PROVIDER.toLowerCase();

  if (provider === 'ollama') {
    return new OllamaProvider({
      baseUrl: config.OLLAMA_BASE_URL,
      model: config.OLLAMA_MODEL,
    });
  }

  throw new Error(`Unsupported LLM provider: ${config.LLM_PROVIDER}`);
};
