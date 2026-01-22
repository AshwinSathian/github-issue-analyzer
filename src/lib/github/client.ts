import { GitHubNotFoundError, GitHubRateLimitError, GitHubServiceError, GitHubUnexpectedError } from './errors.js';
import type { GitHubIssue } from './types.js';

const GITHUB_API_BASE = 'https://api.github.com';
const ISSUES_PER_PAGE = 100;

export type FetchOpenIssuesOptions = {
  token?: string;
};

export const fetchOpenIssues = async (
  owner: string,
  repo: string,
  options: FetchOpenIssuesOptions = {}
): Promise<GitHubIssue[]> => {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'github-issue-analyzer'
  });

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const issues: GitHubIssue[] = [];
  let page = 1;

  while (true) {
    const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`);
    url.searchParams.set('state', 'open');
    url.searchParams.set('per_page', ISSUES_PER_PAGE.toString());
    url.searchParams.set('page', page.toString());

    let response: Response;

    try {
      response = await fetch(url.toString(), { headers });
    } catch (error) {
      throw new GitHubUnexpectedError();
    }

    if (!response.ok) {
      await handleErrorResponse(response);
    }

    const data = (await response.json()) as GitHubIssue[];
    const batch = data.filter((item) => !('pull_request' in item));

    if (batch.length) {
      issues.push(...batch);
    }

    if (data.length < ISSUES_PER_PAGE) {
      break;
    }

    page += 1;
  }

  return issues;
};

const handleErrorResponse = async (response: Response): Promise<never> => {
  const status = response.status;
  const remaining = response.headers.get('x-ratelimit-remaining');

  if (status === 404) {
    throw new GitHubNotFoundError();
  }

  if (status === 429 || (status === 403 && remaining === '0')) {
    throw new GitHubRateLimitError();
  }

  if (status >= 500) {
    throw new GitHubServiceError();
  }

  throw new GitHubUnexpectedError();
};
