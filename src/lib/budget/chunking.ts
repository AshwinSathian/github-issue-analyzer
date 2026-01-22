import type { BudgetConfig, BudgetChunk, CachedIssue } from './types.js';
import { ContextBudgetError } from './errors.js';
import { estimateTokens } from './tokenEstimate.js';
import { formatIssueForLLM, normalizePrompt } from './issueFormat.js';

const SYSTEM_TOKEN_RESERVE = 400;

type IssueEntry = {
  issue: CachedIssue;
  tokens: number;
};

export const buildMapReduceChunks = (
  config: BudgetConfig,
  prompt: string,
  issues: CachedIssue[]
): { chunks: BudgetChunk[]; notes: string[] } => {
  const normalizedPrompt = normalizePrompt(prompt);
  const promptTokens = estimateTokens(normalizedPrompt);
  const overhead = SYSTEM_TOKEN_RESERVE + promptTokens + config.maxOutputTokens;
  const perChunkBudget = config.contextMaxTokens - overhead;

  if (perChunkBudget <= 0) {
    throw new ContextBudgetError(
      'Configured prompt/output tokens exceed the context window; lower prompt/output or increase CONTEXT_MAX_TOKENS.'
    );
  }

  const issueEntries: IssueEntry[] = issues.map((issue) => {
    const formatted = formatIssueForLLM(issue);
    return {
      issue,
      tokens: estimateTokens(formatted)
    };
  });

  const chunks: BudgetChunk[] = [];
  const notes: string[] = [
    `Map-reduce required; per-chunk issue budget is approx ${perChunkBudget} tokens (system+prompt+output reserved ${overhead} tokens).`
  ];

  let currentTokens = 0;
  let currentIssues: CachedIssue[] = [];

  const pushChunk = () => {
    if (!currentIssues.length) {
      return;
    }

    const chunkIndex = chunks.length + 1;
    const tokensForChunk = currentTokens;
    const issueCount = currentIssues.length;
    chunks.push({
      chunkIndex,
      issues: currentIssues
    });
    notes.push(`Chunk ${chunkIndex}: ${issueCount} issue(s), ~${tokensForChunk} tokens`);
    currentIssues = [];
    currentTokens = 0;
  };

  for (const entry of issueEntries) {
    if (entry.tokens > perChunkBudget) {
      throw new ContextBudgetError(
        'A single issue exceeds the allowed context after reserves; lower ISSUE_BODY_MAX_CHARS or reduce input volume.'
      );
    }

    if (currentTokens + entry.tokens > perChunkBudget && currentIssues.length > 0) {
      pushChunk();
    }

    currentIssues.push(entry.issue);
    currentTokens += entry.tokens;
  }

  pushChunk();

  if (!chunks.length) {
    notes.push('No issues were chunked because none were provided.');
  }

  return { chunks, notes };
};
