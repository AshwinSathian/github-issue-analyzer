import Database from 'better-sqlite3';
import type { FastifyPluginAsync } from 'fastify';
import { filterPullRequests, type GitHubClient } from '../lib/github/client.js';
import {
  GitHubNotFoundError,
  GitHubRateLimitError,
  GitHubServiceError,
  GitHubUnexpectedError,
} from '../lib/github/errors.js';
import type { GitHubIssue } from '../lib/github/types.js';
import { type Issue, type IssueRepository } from '../lib/repositories/issueRepository.js';
import { type RepoRepository } from '../lib/repositories/repoRepository.js';
import { sendError } from '../lib/routes/errorHelpers.js';

type SQLiteDatabase = InstanceType<typeof Database>;

const repoSchema = {
  body: {
    type: 'object',
    properties: {
      repo: { type: 'string' },
    },
    required: ['repo'],
    additionalProperties: false,
  },
};

const repoPattern = /^[^/\s]+\/[^/\s]+$/;

type ScanRouteOptions = {
  githubClient: GitHubClient;
  database: SQLiteDatabase;
  issueRepository: IssueRepository;
  repoRepository: RepoRepository;
  githubToken?: string;
};

type ScanRequestBody = {
  repo: string;
};

const scanRoute: FastifyPluginAsync<ScanRouteOptions> = async (fastify, options) => {
  fastify.post('/scan', { schema: repoSchema }, async (request, reply) => {
    const { repo } = request.body as ScanRequestBody;
    const trimmedRepo = repo.trim();

    if (!repoPattern.test(trimmedRepo)) {
      return sendError(
        reply,
        400,
        'INVALID_REPO',
        'Invalid repo format, expected owner/repository (single slash)',
      );
    }

    const [owner, name] = trimmedRepo.split('/', 2);
    const startTime = Date.now();

    let githubIssues: GitHubIssue[];

    try {
      githubIssues = await options.githubClient.fetchOpenIssues(owner, name, {
        token: options.githubToken,
      });
    } catch (error) {
      if (error instanceof GitHubNotFoundError) {
        return sendError(reply, 404, 'GITHUB_REPO_NOT_FOUND', 'GitHub repository not found');
      }

      if (error instanceof GitHubRateLimitError) {
        return sendError(
          reply,
          429,
          'GITHUB_RATE_LIMIT',
          'GitHub rate limit reached; provide GITHUB_TOKEN to increase limits',
        );
      }

      if (error instanceof GitHubServiceError || error instanceof GitHubUnexpectedError) {
        request.log.warn({ error, repo: trimmedRepo }, 'GitHub API error during scan');
        return sendError(
          reply,
          502,
          'GITHUB_SERVICE_ERROR',
          'Unable to retrieve issues from GitHub',
        );
      }

      request.log.error(
        { error, repo: trimmedRepo },
        'Unexpected error when fetching GitHub issues',
      );
      return sendError(reply, 502, 'UNEXPECTED_ERROR', 'Unable to retrieve issues from GitHub');
    }

    const timestamp = new Date();
    const filteredIssues = filterPullRequests(githubIssues);
    const issueRecords: Issue[] = filteredIssues.map((issue) => ({
      issueId: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      htmlUrl: issue.html_url,
      createdAt: issue.created_at,
      cachedAt: timestamp.toISOString(),
    }));

    try {
      const persistScan = options.database.transaction(
        (repoValue: string, records: Issue[], scannedAt: Date, openCount: number) => {
          if (records.length) {
            options.issueRepository.persistIssueBatch(repoValue, records);
          }

          options.repoRepository.upsertRepo(repoValue, scannedAt, openCount);
        },
      );

      persistScan(trimmedRepo, issueRecords, timestamp, issueRecords.length);
    } catch (error) {
      request.log.error({ error, repo: trimmedRepo }, 'Failed to store scan results');
      return sendError(reply, 500, 'DB_ERROR', 'Unable to cache GitHub issues');
    }

    const durationMs = Date.now() - startTime;
    fastify.log.info(
      { repo: trimmedRepo, issues: issueRecords.length, durationMs },
      'GitHub scan complete',
    );

    return reply.send({
      repo: trimmedRepo,
      issues_fetched: issueRecords.length,
      cached_successfully: true,
    });
  });
};

export default scanRoute;
