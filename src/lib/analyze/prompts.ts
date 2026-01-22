import type { ChatMessage } from '../llm/types.js';

const SYSTEM_INSTRUCTIONS = [
  'You are a senior engineering/product maintainer assistant.',
  'Respond in clear markdown-style text.',
  'Ground recommendations in the provided issues and include issue URLs when referencing evidence.',
  'If information is missing, explain what additional context is required.'
];

export const buildSystemMessage = (): ChatMessage => ({
  role: 'system',
  content: SYSTEM_INSTRUCTIONS.join(' ')
});

export const buildMapUserMessage = (userPrompt: string, formattedIssuesBlock: string): ChatMessage => ({
  role: 'user',
  content: [
    `USER PROMPT:\n${userPrompt}`,
    `ISSUES:\n${formattedIssuesBlock}`,
    'TASK: Summarize the findings that are most relevant to the USER PROMPT. Cover themes, top actionable items, evidence URLs, and identify duplicates or related issues when seen.'
  ].join('\n\n')
});

export const buildReduceUserMessage = (userPrompt: string, chunkSummaries: string): ChatMessage => ({
  role: 'user',
  content: [
    `USER PROMPT:\n${userPrompt}`,
    `CHUNK SUMMARIES:\n${chunkSummaries}`,
    'TASK: Produce a final consolidated answer that includes prioritized recommendations (P0/P1/P2), quick wins, risks/unknowns, and an evidence list (URLs).'
  ].join('\n\n')
});
