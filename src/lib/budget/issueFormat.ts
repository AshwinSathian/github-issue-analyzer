import type { CachedIssue } from './types.js';

export const normalizePrompt = (prompt: string): string => {
  return prompt.replace(/\s+/g, ' ').trim();
};

export const truncateIssueBody = (body: string | null, maxChars: number): string => {
  if (!body) {
    return '';
  }

  if (body.length <= maxChars) {
    return body;
  }

  return body.slice(0, maxChars);
};

export const formatIssueForLLM = (issue: CachedIssue): string => {
  const body = issue.body && issue.body.length > 0 ? issue.body : '(empty)';

  return [
    `ISSUE #${issue.number}`,
    `Title: ${issue.title}`,
    `Created: ${issue.createdAt}`,
    `URL: ${issue.htmlUrl}`,
    `Body: ${body}`,
    '---',
  ].join('\n');
};
