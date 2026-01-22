import { describe, expect, it } from 'vitest';
import {
  buildBudgetPlan,
  truncateIssueBody,
  PromptTooLongError,
  type BudgetConfig,
  type CachedIssue
} from '../src/lib/budget/index.js';

const createIssue = (overrides: Partial<CachedIssue> = {}): CachedIssue => ({
  issueId: overrides.issueId ?? 1,
  number: overrides.number ?? 1,
  title: overrides.title ?? 'Example issue',
  body: overrides.body ?? 'Small issue body',
  htmlUrl: overrides.htmlUrl ?? 'https://example.com/1',
  createdAt: overrides.createdAt ?? new Date().toISOString()
});

describe('budget utilities', () => {
  it('throws PromptTooLongError when the prompt exceeds the configured maximum', () => {
    const config: BudgetConfig = {
      contextMaxTokens: 2000,
      maxOutputTokens: 200,
      promptMaxChars: 10,
      analyzeMaxIssues: 5,
      issueBodyMaxChars: 400
    };

    const longPrompt = 'a'.repeat(20);

    try {
      buildBudgetPlan(config, longPrompt, []);
      throw new Error('Expected prompt to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(PromptTooLongError);
      const err = error as PromptTooLongError;
      expect(err.max).toBe(config.promptMaxChars);
      expect(err.actual).toBe(longPrompt.length);
    }
  });

  it('truncates issue bodies to the configured length', () => {
    const original = '0123456789';
    expect(truncateIssueBody(original, 5)).toBe('01234');
    expect(truncateIssueBody(null, 5)).toBe('');
    expect(truncateIssueBody('short', 10)).toBe('short');
  });

  it('returns single mode when the estimated tokens fit within context', () => {
    const config: BudgetConfig = {
      contextMaxTokens: 2000,
      maxOutputTokens: 100,
      promptMaxChars: 200,
      analyzeMaxIssues: 5,
      issueBodyMaxChars: 400
    };

    const plan = buildBudgetPlan(
      config,
      'Brief prompt',
      [createIssue({ issueId: 1, number: 1, createdAt: '2024-01-01T00:00:00Z' })]
    );

    expect(plan.mode).toBe('single');
    expect(plan.chunks).toBeUndefined();
  });

  it('switches to map-reduce mode when the payload cannot fit in the context window', () => {
    const config: BudgetConfig = {
      contextMaxTokens: 550,
      maxOutputTokens: 50,
      promptMaxChars: 200,
      analyzeMaxIssues: 5,
      issueBodyMaxChars: 2048
    };

    const largeBody = 'A'.repeat(150);
    const plan = buildBudgetPlan(config, 'Prompt that fits', [
      createIssue({ issueId: 1, number: 1, body: largeBody, createdAt: '2024-02-01T00:00:00Z' }),
      createIssue({ issueId: 2, number: 2, body: largeBody, createdAt: '2024-02-02T00:00:00Z' })
    ]);

    expect(plan.mode).toBe('map-reduce');
    expect(plan.chunks).toBeDefined();
    expect(plan.chunks?.length).toBeGreaterThan(0);
  });
});
