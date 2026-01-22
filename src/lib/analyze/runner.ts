import type { Config } from '../../config/schema.js';
import type { LLMProvider } from '../llm/provider.js';
import { buildBudgetPlan } from '../budget/budgeter.js';
import { formatIssueForLLM } from '../budget/issueFormat.js';
import type { BudgetConfig, BudgetPlan, CachedIssue } from '../budget/types.js';
import {
  buildReduceUserMessage,
  buildMapUserMessage,
  buildSystemMessage
} from './prompts.js';

export type RunAnalysisParams = {
  config: Config;
  llmProvider: LLMProvider;
  prompt: string;
  issues: CachedIssue[];
  onPlan?: (plan: BudgetPlan) => void;
};

export const runAnalysis = async (params: RunAnalysisParams): Promise<string> => {
  const { config, llmProvider, prompt, issues } = params;
  const budgetConfig: BudgetConfig = {
    contextMaxTokens: config.CONTEXT_MAX_TOKENS,
    maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS,
    promptMaxChars: config.PROMPT_MAX_CHARS,
    analyzeMaxIssues: config.ANALYZE_MAX_ISSUES,
    issueBodyMaxChars: config.ISSUE_BODY_MAX_CHARS
  };

  const plan = buildBudgetPlan(budgetConfig, prompt, issues);
  params.onPlan?.(plan);

  const systemMessage = buildSystemMessage();
  const temperature = config.LLM_TEMPERATURE;
  const maxOutputTokens = config.LLM_MAX_OUTPUT_TOKENS;
  const normalizedPrompt = plan.prompt;

  if (plan.mode === 'single') {
    const formattedIssuesBlock = plan.issuesUsed.map(formatIssueForLLM).join('\n');

    const response = await llmProvider.generate({
      messages: [systemMessage, buildMapUserMessage(normalizedPrompt, formattedIssuesBlock)],
      temperature,
      maxOutputTokens
    });

    return response.text;
  }

  const chunkSummaries: string[] = [];

  for (const chunk of plan.chunks ?? []) {
    const chunkBlock = chunk.issues.map(formatIssueForLLM).join('\n');
    const response = await llmProvider.generate({
      messages: [systemMessage, buildMapUserMessage(normalizedPrompt, chunkBlock)],
      temperature,
      maxOutputTokens
    });

    chunkSummaries.push(response.text);
  }

  const chunkSummariesBlock = chunkSummaries
    .map((summary, index) => `CHUNK ${index + 1} SUMMARY:\n${summary}`)
    .join('\n---\n');

  const finalResponse = await llmProvider.generate({
    messages: [systemMessage, buildReduceUserMessage(normalizedPrompt, chunkSummariesBlock)],
    temperature,
    maxOutputTokens
  });

  return finalResponse.text;
};
