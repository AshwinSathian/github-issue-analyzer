type LLMErrorOptions = {
  status?: number;
  snippet?: string;
  cause?: Error;
};

abstract class LLMError extends Error {
  public readonly code: string;
  public readonly status?: number;
  public readonly snippet?: string;

  protected constructor(code: string, message: string, options?: LLMErrorOptions) {
    const errorOptions = options?.cause ? { cause: options.cause } : undefined;
    super(message, errorOptions);
    this.name = new.target.name;
    this.code = code;
    this.status = options?.status;
    this.snippet = options?.snippet;
  }
}

export class LLMConnectionError extends LLMError {
  constructor(cause?: Error) {
    super('llm.connection_error', 'Start Ollama and ensure OLLAMA_BASE_URL is correct', { cause });
  }
}

export class LLMResponseError extends LLMError {
  constructor(status: number, snippet: string, cause?: Error) {
    super('llm.response_error', `LLM responded with ${status}. Response snippet: ${snippet}`, {
      status,
      snippet,
      cause,
    });
  }
}

export class LLMModelError extends LLMError {
  constructor(status: number, model: string, snippet?: string, cause?: Error) {
    super(
      'llm.model_error',
      `Model "${model}" unavailable. Pull the model locally (e.g., ollama run ${model})`,
      { status, snippet, cause },
    );
  }
}
