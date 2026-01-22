import { LLMConnectionError, LLMModelError, LLMResponseError } from '../errors.js';
import type { LLMProvider } from '../provider.js';
import type { LLMGenerateInput, LLMGenerateOutput } from '../types.js';

const DEFAULT_TIMEOUT_MS = 60_000;

type OllamaProviderOptions = {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
};

export class OllamaProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaProviderOptions) {
    this.baseUrl = options.baseUrl;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async generate(input: LLMGenerateInput): Promise<LLMGenerateOutput> {
    const endpoint = new URL('/api/chat', this.baseUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: input.messages,
          temperature: input.temperature,
          max_tokens: input.maxOutputTokens // Ollama uses max_tokens to control response length
        }),
        signal: controller.signal
      });

      const rawResponse = await response.text();
      const snippet = this.createSnippet(rawResponse);

      if (!response.ok) {
        if (response.status === 404) {
          throw new LLMModelError(response.status, this.model, snippet);
        }

        throw new LLMResponseError(response.status, snippet);
      }

      let parsedResponse: unknown;

      try {
        parsedResponse = rawResponse ? JSON.parse(rawResponse) : undefined;
      } catch (error) {
        throw new LLMResponseError(response.status, snippet, error instanceof Error ? error : undefined);
      }

      const text = this.extractText(parsedResponse);

      if (!text) {
        throw new LLMResponseError(response.status, snippet);
      }

      return { text: text.trim() };
    } catch (error) {
      if (error instanceof LLMModelError || error instanceof LLMResponseError) {
        throw error;
      }

      throw new LLMConnectionError(error instanceof Error ? error : undefined);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private extractText(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;

    if (typeof record.response === 'string') {
      return record.response;
    }

    if (typeof record.text === 'string') {
      return record.text;
    }

    if (Array.isArray(record.output)) {
      const joined = record.output
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (typeof item === 'object' && item !== null) {
            const content = (item as Record<string, unknown>).content;
            if (typeof content === 'string') {
              return content;
            }
          }

          return '';
        })
        .join('');

      if (joined) {
        return joined;
      }
    }

    if (Array.isArray(record.choices)) {
      const joinedChoices = record.choices
        .map((choice) => {
          if (typeof choice !== 'object' || choice === null) {
            return '';
          }

          const choiceRecord = choice as Record<string, unknown>;

          if (typeof choiceRecord.content === 'string') {
            return choiceRecord.content;
          }

          const message = choiceRecord.message;
          if (typeof message === 'object' && message !== null) {
            const messageContent = (message as Record<string, unknown>).content;
            if (typeof messageContent === 'string') {
              return messageContent;
            }
          }

          return '';
        })
        .join('');

      if (joinedChoices) {
        return joinedChoices;
      }
    }

    return undefined;
  }

  private createSnippet(value: string): string {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return '<empty response>';
    }

    return cleaned.length <= 200 ? cleaned : `${cleaned.slice(0, 197)}...`;
  }
}
