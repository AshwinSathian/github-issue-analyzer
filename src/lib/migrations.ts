type MigrationDatabase = {
  exec(source: string): void;
};

export const runMigrations = (db: MigrationDatabase): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      repo TEXT PRIMARY KEY,
      last_scanned_at TEXT,
      issues_open_count INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      repo TEXT,
      issue_id INTEGER,
      number INTEGER,
      title TEXT,
      body TEXT,
      html_url TEXT,
      created_at TEXT,
      cached_at TEXT,
      PRIMARY KEY (repo, issue_id)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_issues_repo ON issues(repo);
  `);
};
