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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: input.messages,
          stream: false,
          // Ollama /api/chat supports runtime options under "options"
          options: {
            temperature: input.temperature,
            // Limit generation length (Ollama option)
            num_predict: input.maxOutputTokens,
          },
        }),
        signal: controller.signal,
      });

      const rawResponse = await response.text();
      const snippet = this.createSnippet(rawResponse);

      if (!response.ok) {
        // 404 could be "model not found" or incorrect endpoint/baseUrl
        if (response.status === 404) {
          throw new LLMModelError(response.status, this.model, snippet);
        }
        throw new LLMResponseError(response.status, snippet);
      }

      const parsedResponse = this.safeParseJson(rawResponse, response.status, snippet);
      const text = this.extractText(parsedResponse);

      if (!text) {
        throw new LLMResponseError(response.status, snippet);
      }

      return { text: text.trim() };
    } catch (error) {
      if (error instanceof LLMModelError || error instanceof LLMResponseError) {
        throw error;
      }

      // If AbortController aborted, fetch typically throws; treat as connection error with cause.
      throw new LLMConnectionError(error instanceof Error ? error : undefined);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Ollama should return a single JSON object when stream=false.
   * As a safety net, if we accidentally get NDJSON/multi-line JSON, parse the last non-empty line.
   */
  private safeParseJson(raw: string, status: number, snippet: string): unknown {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      // Fallback: NDJSON / multiple JSON objects separated by newlines
      const lines = trimmed
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length > 1) {
        const lastLine = lines[lines.length - 1];
        try {
          return JSON.parse(lastLine);
        } catch {
          // fallthrough to error below
        }
      }

      throw new LLMResponseError(status, snippet, error instanceof Error ? error : undefined);
    }
  }

  private extractText(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const record = payload as Record<string, unknown>;

    // ✅ Ollama /api/chat response:
    // { message: { role: "assistant", content: "..." }, ... }
    const message = record.message;
    if (typeof message === 'object' && message !== null) {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === 'string') {
        return content;
      }
    }

    // Some providers/variants
    if (typeof record.response === 'string') {
      return record.response;
    }

    if (typeof record.text === 'string') {
      return record.text;
    }

    // Array outputs (generic fallback)
    if (Array.isArray(record.output)) {
      const joined = record.output
        .map((item) => {
          if (typeof item === 'string') return item;

          if (typeof item === 'object' && item !== null) {
            const content = (item as Record<string, unknown>).content;
            if (typeof content === 'string') return content;
          }

          return '';
        })
        .join('');

      if (joined) return joined;
    }

    // OpenAI-style choices fallback (if you later add an OpenAI-compat provider)
    if (Array.isArray(record.choices)) {
      const joinedChoices = record.choices
        .map((choice) => {
          if (typeof choice !== 'object' || choice === null) return '';

          const choiceRecord = choice as Record<string, unknown>;

          if (typeof choiceRecord.content === 'string') {
            return choiceRecord.content;
          }

          const msg = choiceRecord.message;
          if (typeof msg === 'object' && msg !== null) {
            const msgContent = (msg as Record<string, unknown>).content;
            if (typeof msgContent === 'string') return msgContent;
          }

          return '';
        })
        .join('');

      if (joinedChoices) return joinedChoices;
    }

    return undefined;
  }

  private createSnippet(value: string): string {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) return '<empty response>';
    return cleaned.length <= 200 ? cleaned : `${cleaned.slice(0, 197)}...`;
  }
}
