import { describe, expect, it } from 'vitest';
import { PromptTooLongError, ContextBudgetError } from '../src/lib/budget/errors.js';
import { LLMConnectionError, LLMModelError, LLMResponseError } from '../src/lib/llm/errors.js';
import { mapAnalysisErrorToResponse } from '../src/lib/routes/analysisErrorMap.js';

describe('mapAnalysisErrorToResponse', () => {
  it('maps PromptTooLongError to a 400 response code', () => {
    const error = new PromptTooLongError(10, 20);
    const response = mapAnalysisErrorToResponse(error);
    expect(response).toMatchObject({
      status: 400,
      code: error.code,
      message: 'Prompt exceeds 10 characters (20 provided)',
    });
  });

  it('maps ContextBudgetError to a 400 response with guidance', () => {
    const error = new ContextBudgetError('Budget flag triggered');
    const response = mapAnalysisErrorToResponse(error);
    expect(response.status).toBe(400);
    expect(response.code).toBe(error.code);
    expect(response.message).toContain('Budget flag triggered');
    expect(response.message).toContain('Consider lowering ANALYZE_MAX_ISSUES');
  });

  it('maps LLMConnectionError and LLMModelError to 503', () => {
    const connectionError = new LLMConnectionError();
    const modelError = new LLMModelError(503, 'llama');
    expect(mapAnalysisErrorToResponse(connectionError)).toEqual({
      status: 503,
      code: connectionError.code,
      message: 'LLM provider unavailable; ensure the provider service is running and configured.',
    });
    expect(mapAnalysisErrorToResponse(modelError)).toEqual({
      status: 503,
      code: modelError.code,
      message: 'LLM provider unavailable; ensure the provider service is running and configured.',
    });
  });

  it('maps LLMResponseError to 502', () => {
    const error = new LLMResponseError(500, 'error snippet');
    const response = mapAnalysisErrorToResponse(error);
    expect(response).toEqual({
      status: 502,
      code: error.code,
      message: 'LLM provider returned an unexpected response; try again shortly.',
    });
  });

  it('maps unknown errors to 500', () => {
    const response = mapAnalysisErrorToResponse(new Error('unknown'));
    expect(response).toEqual({
      status: 500,
      code: 'UNEXPECTED_ERROR',
      message: 'Unable to analyze issues right now',
    });
  });
});
