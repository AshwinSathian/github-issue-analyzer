import type { FastifyPluginAsync } from 'fastify';
import { db } from '../lib/db.js';
import { fetchOpenIssues } from '../lib/github/client.js';
import type { GitHubIssue } from '../lib/github/types.js';
import {
  GitHubNotFoundError,
  GitHubRateLimitError,
  GitHubServiceError,
  GitHubUnexpectedError
} from '../lib/github/errors.js';
import { upsertIssuesWithoutTransaction, type Issue } from '../lib/repositories/issueRepository.js';
import { upsertRepo } from '../lib/repositories/repoRepository.js';

const repoSchema = {
  body: {
    type: 'object',
    properties: {
      repo: { type: 'string' }
    },
    required: ['repo'],
    additionalProperties: false
  }
};

const repoPattern = /^[^/\s]+\/[^/\s]+$/;

type ScanRouteOptions = {
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
      return reply
        .status(400)
        .send({ message: 'Invalid repo format, expected owner/repository (single slash)' });
    }

    const [owner, name] = trimmedRepo.split('/', 2);
    const startTime = Date.now();

    let githubIssues: GitHubIssue[];

    try {
      githubIssues = await fetchOpenIssues(owner, name, { token: options.githubToken });
    } catch (error) {
      if (error instanceof GitHubNotFoundError) {
        return reply.status(404).send({ message: 'GitHub repository not found' });
      }

      if (error instanceof GitHubRateLimitError) {
        return reply
          .status(429)
          .send({ message: 'GitHub rate limit reached; provide GITHUB_TOKEN to increase limits' });
      }

      if (error instanceof GitHubServiceError || error instanceof GitHubUnexpectedError) {
        request.log.warn({ error, repo: trimmedRepo }, 'GitHub API error during scan');
        return reply.status(502).send({ message: 'Unable to retrieve issues from GitHub' });
      }

      request.log.error({ error, repo: trimmedRepo }, 'Unexpected error when fetching GitHub issues');
      return reply.status(502).send({ message: 'Unable to retrieve issues from GitHub' });
    }

    const timestamp = new Date();
    const issueRecords: Issue[] = githubIssues.map((issue) => ({
      issueId: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      htmlUrl: issue.html_url,
      createdAt: issue.created_at,
      cachedAt: timestamp.toISOString()
    }));

    try {
      const persistScan = db.transaction((repoValue: string, records: Issue[], scannedAt: Date, openCount: number) => {
        if (records.length) {
          upsertIssuesWithoutTransaction(repoValue, records);
        }

        upsertRepo(repoValue, scannedAt, openCount);
      });

      persistScan(trimmedRepo, issueRecords, timestamp, issueRecords.length);
    } catch (error) {
      request.log.error({ error, repo: trimmedRepo }, 'Failed to store scan results');
      return reply.status(500).send({ message: 'Unable to cache GitHub issues' });
    }

    const durationMs = Date.now() - startTime;
    fastify.log.info({ repo: trimmedRepo, issues: issueRecords.length, durationMs }, 'GitHub scan complete');

    return reply.send({
      repo: trimmedRepo,
      issues_fetched: issueRecords.length,
      cached_successfully: true
    });
  });
};

export default scanRoute;
