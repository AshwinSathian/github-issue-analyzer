import { z } from 'zod';

export const configKeys = {
  PORT: 'PORT',
  LOG_LEVEL: 'LOG_LEVEL',
  GITHUB_TOKEN: 'GITHUB_TOKEN',
  STORAGE_PATH: 'STORAGE_PATH',
  LLM_PROVIDER: 'LLM_PROVIDER',
  OLLAMA_BASE_URL: 'OLLAMA_BASE_URL',
  OLLAMA_MODEL: 'OLLAMA_MODEL',
  LLM_TEMPERATURE: 'LLM_TEMPERATURE',
  LLM_MAX_OUTPUT_TOKENS: 'LLM_MAX_OUTPUT_TOKENS',
  CONTEXT_MAX_TOKENS: 'CONTEXT_MAX_TOKENS',
  PROMPT_MAX_CHARS: 'PROMPT_MAX_CHARS',
  ANALYZE_MAX_ISSUES: 'ANALYZE_MAX_ISSUES',
  ISSUE_BODY_MAX_CHARS: 'ISSUE_BODY_MAX_CHARS'
} as const;

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

const trimToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

export const configSchema = z.object({
  [configKeys.PORT]: z
    .coerce.number()
    .int()
    .min(1, 'must be between 1 and 65535')
    .max(65535, 'must be between 1 and 65535')
    .default(3000),
  [configKeys.LOG_LEVEL]: z.enum(logLevels).default('info'),
  [configKeys.GITHUB_TOKEN]: z
    .preprocess(trimToUndefined, z.string().trim().min(1))
    .optional(),
  [configKeys.STORAGE_PATH]: z.string().trim().min(1).default('./data/cache.db'),
  [configKeys.LLM_PROVIDER]: z.string().trim().min(1).default('ollama'),
  [configKeys.OLLAMA_BASE_URL]: z.string().trim().url().default('http://localhost:11434'),
  [configKeys.OLLAMA_MODEL]: z.string().trim().min(1).default('llama3.1:8b'),
  [configKeys.LLM_TEMPERATURE]: z
    .coerce.number()
    .min(0, 'must be between 0 and 2')
    .max(2, 'must be between 0 and 2')
    .default(0.2),
  [configKeys.LLM_MAX_OUTPUT_TOKENS]: z
    .coerce.number()
    .int()
    .positive('must be a positive integer')
    .default(900),
  [configKeys.CONTEXT_MAX_TOKENS]: z
    .coerce.number()
    .int()
    .positive('must be a positive integer')
    .default(8192),
  [configKeys.PROMPT_MAX_CHARS]: z
    .coerce.number()
    .int()
    .positive('must be a positive integer')
    .default(8000),
  [configKeys.ANALYZE_MAX_ISSUES]: z
    .coerce.number()
    .int()
    .positive('must be a positive integer')
    .default(200),
  [configKeys.ISSUE_BODY_MAX_CHARS]: z
    .coerce.number()
    .int()
    .positive('must be a positive integer')
    .default(4000)
});

export type Config = z.infer<typeof configSchema>;
