import { PromptTooLongError, ContextBudgetError } from '../budget/errors.js';
import { LLMConnectionError, LLMModelError, LLMResponseError } from '../llm/errors.js';

export type AnalysisErrorResponse = {
  status: number;
  code: string;
  message: string;
};

export const mapAnalysisErrorToResponse = (error: unknown): AnalysisErrorResponse => {
  if (error instanceof PromptTooLongError) {
    return {
      status: 400,
      code: error.code,
      message: `Prompt exceeds ${error.max} characters (${error.actual} provided)`,
    };
  }

  if (error instanceof ContextBudgetError) {
    return {
      status: 400,
      code: error.code,
      message: `${error.message} Consider lowering ANALYZE_MAX_ISSUES or ISSUE_BODY_MAX_CHARS or increasing CONTEXT_MAX_TOKENS.`,
    };
  }

  if (error instanceof LLMConnectionError || error instanceof LLMModelError) {
    return {
      status: 503,
      code: error.code,
      message: 'LLM provider unavailable; ensure the provider service is running and configured.',
    };
  }

  if (error instanceof LLMResponseError) {
    return {
      status: 502,
      code: error.code,
      message: 'LLM provider returned an unexpected response; try again shortly.',
    };
  }

  return {
    status: 500,
    code: 'UNEXPECTED_ERROR',
    message: 'Unable to analyze issues right now',
  };
};
