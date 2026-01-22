export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubError';
  }
}

export class GitHubNotFoundError extends GitHubError {
  constructor() {
    super('GitHub repository not found');
    this.name = 'GitHubNotFoundError';
  }
}

export class GitHubRateLimitError extends GitHubError {
  constructor() {
    super('GitHub API rate limit exceeded');
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubServiceError extends GitHubError {
  constructor() {
    super('GitHub service unavailable');
    this.name = 'GitHubServiceError';
  }
}

export class GitHubUnexpectedError extends GitHubError {
  constructor() {
    super('Unexpected response from GitHub');
    this.name = 'GitHubUnexpectedError';
  }
}
