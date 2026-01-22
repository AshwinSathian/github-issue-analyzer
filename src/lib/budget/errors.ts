const PROMPT_TOO_LONG_CODE = 'PROMPT_TOO_LONG';
const CONTEXT_BUDGET_CODE = 'CONTEXT_BUDGET_EXCEEDED';

export class PromptTooLongError extends Error {
  public readonly code = PROMPT_TOO_LONG_CODE;
  public readonly max: number;
  public readonly actual: number;

  constructor(max: number, actual: number) {
    super(`Prompt length ${actual} exceeds the allowed ${max} characters`);
    this.name = 'PromptTooLongError';
    this.max = max;
    this.actual = actual;
    Object.setPrototypeOf(this, PromptTooLongError.prototype);
  }
}

export class ContextBudgetError extends Error {
  public readonly code = CONTEXT_BUDGET_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'ContextBudgetError';
    Object.setPrototypeOf(this, ContextBudgetError.prototype);
  }
}
