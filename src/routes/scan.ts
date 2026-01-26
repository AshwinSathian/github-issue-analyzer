import Database from 'better-sqlite3';
import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
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
import { createScanJob, getScanJob, updateScanJob } from '../lib/scanJobManager.js';
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

const scanStatusSchema = {
  querystring: {
    type: 'object',
    properties: {
      job_id: { type: 'string' },
    },
    required: ['job_id'],
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

type ScanStatusQuery = {
  job_id: string;
};

const isoTimestamp = (): string => new Date().toISOString();

const markJobFailure = (jobId: string, message: string): void => {
  updateScanJob(jobId, {
    status: 'failed',
    errorMessage: message,
    finishedAt: isoTimestamp(),
  });
};

const runScanJob = async (
  jobId: string,
  repo: string,
  options: ScanRouteOptions,
  logger: FastifyBaseLogger,
): Promise<void> => {
  const [owner, name] = repo.split('/', 2);
  const startTime = Date.now();
  updateScanJob(jobId, { status: 'running', startedAt: isoTimestamp() });

  try {
    let githubIssues: GitHubIssue[];

    try {
      githubIssues = await options.githubClient.fetchOpenIssues(owner, name, {
        token: options.githubToken,
      });
    } catch (error) {
      if (error instanceof GitHubNotFoundError) {
        logger.warn({ error, repo }, 'GitHub repository not found during async scan');
        markJobFailure(jobId, 'GitHub repository not found');
        return;
      }

      if (error instanceof GitHubRateLimitError) {
        logger.warn({ error, repo }, 'GitHub rate limit reached during async scan');
        markJobFailure(
          jobId,
          'GitHub rate limit reached; provide GITHUB_TOKEN to increase limits',
        );
        return;
      }

      if (error instanceof GitHubServiceError || error instanceof GitHubUnexpectedError) {
        logger.warn({ error, repo }, 'GitHub API error during async scan');
        markJobFailure(jobId, 'Unable to retrieve issues from GitHub');
        return;
      }

      logger.error(
        { error, repo },
        'Unexpected error when fetching GitHub issues during async scan',
      );
      markJobFailure(jobId, 'Unable to retrieve issues from GitHub');
      return;
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

      persistScan(repo, issueRecords, timestamp, issueRecords.length);
    } catch (error) {
      logger.error({ error, repo }, 'Failed to store scan results during async job');
      markJobFailure(jobId, 'Unable to cache GitHub issues');
      return;
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      { repo, issues: issueRecords.length, durationMs },
      'GitHub scan complete (async job)',
    );

    updateScanJob(jobId, {
      status: 'completed',
      issuesFetched: issueRecords.length,
      finishedAt: isoTimestamp(),
    });
  } catch (error) {
    logger.error({ error, repo, jobId }, 'Unexpected error when processing async scan job');
    markJobFailure(jobId, 'Unexpected error while processing scan results');
  }
};

const scanRoute: FastifyPluginAsync<ScanRouteOptions> = async (fastify, options) => {
  fastify.get('/scan/status', { schema: scanStatusSchema }, async (request, reply) => {
    const { job_id: jobId } = request.query as ScanStatusQuery;
    const job = getScanJob(jobId);

    if (!job) {
      return sendError(reply, 404, 'JOB_NOT_FOUND', 'Scan job not found');
    }

    return reply.send(job);
  });

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

    const job = createScanJob(trimmedRepo);
    fastify.log.info({ repo: trimmedRepo, jobId: job.jobId }, 'Registered GitHub scan job');
    void runScanJob(job.jobId, trimmedRepo, options, fastify.log);

    return reply.send({
      job_id: job.jobId,
      status: job.status,
    });
  });
};

export default scanRoute;
