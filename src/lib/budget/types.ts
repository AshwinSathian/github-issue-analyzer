export type BudgetConfig = {
  contextMaxTokens: number;
  maxOutputTokens: number;
  promptMaxChars: number;
  analyzeMaxIssues: number;
  issueBodyMaxChars: number;
};

export type CachedIssue = {
  issueId: number;
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  createdAt: string;
};

export type BudgetChunk = {
  chunkIndex: number;
  issues: CachedIssue[];
};

export type BudgetPlan = {
  mode: 'single' | 'map-reduce';
  prompt: string;
  issuesUsed: CachedIssue[];
  issuesDroppedCount: number;
  perIssueBodyMaxCharsApplied: number;
  chunks?: BudgetChunk[];
  notes: string[];
};
