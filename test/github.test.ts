import { describe, expect, it } from 'vitest';
import { filterPullRequests } from '../src/lib/github/client.js';
import type { GitHubIssue } from '../src/lib/github/types.js';

describe('GitHub client helpers', () => {
  it('filters pull requests from issue listings', () => {
    const items: GitHubIssue[] = [
      {
        id: 1,
        number: 1,
        title: 'Issue',
        body: 'text',
        html_url: 'https://x',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 2,
        number: 2,
        title: 'PR',
        body: 'pr body',
        html_url: 'https://x/pr',
        created_at: '2024-02-01T00:00:00Z',
        pull_request: {},
      },
    ];
    const filtered = filterPullRequests(items);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });
});
