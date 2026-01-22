import { db } from '../db.js';

export type Repo = {
  repo: string;
  lastScannedAt: string;
  issuesOpenCount: number;
};

type RepoRow = {
  repo: string;
  last_scanned_at: string;
  issues_open_count: number;
};

const upsertRepoStmt = db.prepare(`
  INSERT INTO repos (repo, last_scanned_at, issues_open_count)
  VALUES (@repo, @last_scanned_at, @issues_open_count)
  ON CONFLICT(repo) DO UPDATE SET
    last_scanned_at = excluded.last_scanned_at,
    issues_open_count = excluded.issues_open_count
`);

const selectRepoStmt = db.prepare(`
  SELECT repo, last_scanned_at, issues_open_count
  FROM repos
  WHERE repo = ?
`);

export const upsertRepo = (repo: string, scannedAt: Date, openCount: number): void => {
  upsertRepoStmt.run({
    repo,
    last_scanned_at: scannedAt.toISOString(),
    issues_open_count: openCount
  });
};

export const getRepo = (repo: string): Repo | null => {
  const row = selectRepoStmt.get(repo) as RepoRow | undefined;

  if (!row) {
    return null;
  }

  return {
    repo: row.repo,
    lastScannedAt: row.last_scanned_at,
    issuesOpenCount: row.issues_open_count
  };
};
