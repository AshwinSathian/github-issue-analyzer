import { db } from '../db.js';

export type Issue = {
  issueId: number;
  number: number;
  title: string;
  body: string;
  htmlUrl: string;
  createdAt: string;
  cachedAt: string;
};

type IssueRow = {
  issue_id: number;
  number: number;
  title: string;
  body: string;
  html_url: string;
  created_at: string;
  cached_at: string;
};

const upsertIssueStmt = db.prepare(`
  INSERT INTO issues (
    repo,
    issue_id,
    number,
    title,
    body,
    html_url,
    created_at,
    cached_at
  )
  VALUES (
    @repo,
    @issue_id,
    @number,
    @title,
    @body,
    @html_url,
    @created_at,
    @cached_at
  )
  ON CONFLICT(repo, issue_id) DO UPDATE SET
    number = excluded.number,
    title = excluded.title,
    body = excluded.body,
    html_url = excluded.html_url,
    created_at = excluded.created_at,
    cached_at = excluded.cached_at
`);

const getIssuesStmt = db.prepare(`
  SELECT issue_id, number, title, body, html_url, created_at, cached_at
  FROM issues
  WHERE repo = ?
  ORDER BY issue_id DESC
`);

const countIssuesStmt = db.prepare(`
  SELECT COUNT(*) AS count
  FROM issues
  WHERE repo = ?
`);

const upsertIssuesTransaction = db.transaction((repo: string, issues: Issue[]) => {
  for (const issue of issues) {
    upsertIssueStmt.run({
      repo,
      issue_id: issue.issueId,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      html_url: issue.htmlUrl,
      created_at: issue.createdAt,
      cached_at: issue.cachedAt
    });
  }
});

export const upsertIssues = (repo: string, issues: Issue[]): void => {
  if (!issues.length) {
    return;
  }

  upsertIssuesTransaction(repo, issues);
};

export const getIssuesByRepo = (repo: string): Issue[] => {
  const rows = getIssuesStmt.all(repo) as IssueRow[];

  return rows.map((row) => ({
    issueId: row.issue_id,
    number: row.number,
    title: row.title,
    body: row.body,
    htmlUrl: row.html_url,
    createdAt: row.created_at,
    cachedAt: row.cached_at
  }));
};

export const countIssuesByRepo = (repo: string): number => {
  const row = countIssuesStmt.get(repo) as { count: number } | undefined;

  return typeof row?.count === 'number' ? row.count : 0;
};
