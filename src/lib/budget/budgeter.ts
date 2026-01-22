import { buildMapReduceChunks } from './chunking.js';
import { PromptTooLongError } from './errors.js';
import { normalizePrompt, truncateIssueBody, formatIssueForLLM } from './issueFormat.js';
import { estimateTokens } from './tokenEstimate.js';
import type { BudgetConfig, BudgetPlan, CachedIssue } from './types.js';

const SYSTEM_TOKEN_RESERVE = 400;

export const buildBudgetPlan = (
  config: BudgetConfig,
  prompt: string,
  issues: CachedIssue[]
): BudgetPlan => {
  if (prompt.length > config.promptMaxChars) {
    throw new PromptTooLongError(config.promptMaxChars, prompt.length);
  }

  const normalizedPrompt = normalizePrompt(prompt);
  const notes: string[] = [];

  const sortedIssues = [...issues].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const issuesDroppedCount = Math.max(sortedIssues.length - config.analyzeMaxIssues, 0);
  const limitedIssues = sortedIssues.slice(0, config.analyzeMaxIssues);

  const preparedIssues: CachedIssue[] = limitedIssues.map((issue) => {
    const originalBody = issue.body ?? '';
    const truncatedBody = truncateIssueBody(issue.body, config.issueBodyMaxChars);
    const wasTruncated = originalBody.length > config.issueBodyMaxChars;

    if (wasTruncated) {
      notes.push(`Truncated body for issue #${issue.number} to ${config.issueBodyMaxChars} characters.`);
    }

    return {
      ...issue,
      body: truncatedBody
    };
  });

  if (issuesDroppedCount > 0) {
    notes.push(`Dropped ${issuesDroppedCount} oldest issue(s) to respect ANALYZE_MAX_ISSUES.`);
  }

  const formattedIssueStrings = preparedIssues.map((issue) => formatIssueForLLM(issue));
  const issuePayloadTokens = formattedIssueStrings.reduce((sum, text) => sum + estimateTokens(text), 0);

  const promptTokens = estimateTokens(normalizedPrompt);
  const totalTokens =
    SYSTEM_TOKEN_RESERVE + promptTokens + issuePayloadTokens + config.maxOutputTokens;

  notes.push(`Estimated total tokens: ${totalTokens} (context limit ${config.contextMaxTokens}).`);

  const basePlan: Omit<BudgetPlan, 'mode' | 'chunks'> = {
    prompt: normalizedPrompt,
    issuesUsed: preparedIssues,
    issuesDroppedCount,
    perIssueBodyMaxCharsApplied: config.issueBodyMaxChars,
    notes
  };

  if (totalTokens <= config.contextMaxTokens) {
    return {
      ...basePlan,
      mode: 'single'
    };
  }

  const { chunks, notes: chunkNotes } = buildMapReduceChunks(config, normalizedPrompt, preparedIssues);

  return {
    ...basePlan,
    mode: 'map-reduce',
    chunks,
    notes: [...notes, ...chunkNotes]
  };
};
