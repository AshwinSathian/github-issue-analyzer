import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../config/schema.js';
import { runAnalysis } from '../lib/analyze/runner.js';
import { PromptTooLongError, ContextBudgetError } from '../lib/budget/errors.js';
import {
  LLMConnectionError,
  LLMModelError,
  LLMResponseError
} from '../lib/llm/errors.js';
import type { LLMProvider } from '../lib/llm/provider.js';
import type { IssueRepository } from '../lib/repositories/issueRepository.js';
import type { RepoRepository } from '../lib/repositories/repoRepository.js';
import { mapAnalysisErrorToResponse } from '../lib/routes/analysisErrorMap.js';
import { sendError } from '../lib/routes/errorHelpers.js';

const analyzeSchema = {
  body: {
    type: 'object',
    properties: {
      repo: { type: 'string' },
      prompt: { type: 'string' }
    },
    required: ['repo', 'prompt'],
    additionalProperties: false
  },
  querystring: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['json', 'text'] }
    },
    additionalProperties: false
  }
};

const repoPattern = /^[^/\s]+\/[^/\s]+$/;

type AnalyzeRouteOptions = {
  config: Config;
  llmProviderFactory: (config: Config) => LLMProvider;
  issueRepository: IssueRepository;
  repoRepository: RepoRepository;
};

type AnalyzeRequestBody = {
  repo: string;
  prompt: string;
};

type AnalyzeQuery = {
  format?: 'json' | 'text';
};

const analyzeRoute: FastifyPluginAsync<AnalyzeRouteOptions> = async (fastify, options) => {
  fastify.post('/analyze', { schema: analyzeSchema }, async (request, reply) => {
    const { repo, prompt } = request.body as AnalyzeRequestBody;
    const { format } = (request.query as AnalyzeQuery) ?? {};
    const trimmedRepo = repo.trim();
    const trimmedPrompt = prompt.trim();
    const rawAccept = request.headers.accept;
    const normalizedAccept =
      typeof rawAccept === 'string'
        ? rawAccept
        : Array.isArray(rawAccept)
        ? rawAccept.join(', ')
        : '';
    const wantsText =
      format === 'text' || normalizedAccept.toLowerCase().includes('text/plain');

    if (!repoPattern.test(trimmedRepo)) {
      return sendError(reply, 400, 'INVALID_REPO', 'Invalid repo format, expected owner/repository (single slash)');
    }

    if (!trimmedPrompt) {
      return sendError(reply, 400, 'INVALID_PROMPT', 'Prompt must not be empty');
    }

    const repoRecord = options.repoRepository.getRepo(trimmedRepo);

    if (!repoRecord) {
      return sendError(reply, 404, 'REPO_NOT_SCANNED', 'Repo not scanned yet. Run POST /scan first.');
    }

    const cachedIssues = options.issueRepository.getIssuesByRepo(trimmedRepo);

    if (!cachedIssues.length) {
      const noIssuesResponse = { analysis: 'No open issues cached for this repo.' };
      if (wantsText) {
        reply.type('text/plain; charset=utf-8').send(`${noIssuesResponse.analysis}\n`);
        return reply;
      }
      return reply.send(noIssuesResponse);
    }

    const budgetIssues = cachedIssues.map((issue) => ({
      issueId: issue.issueId,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      htmlUrl: issue.htmlUrl,
      createdAt: issue.createdAt
    }));
    const llmProvider = options.llmProviderFactory(options.config);

    let analysisMode: string | undefined;
    let chunkCount: number | undefined;
    let analysisText: string;
    const startTime = Date.now();

    try {
      analysisText = await runAnalysis({
        config: options.config,
        llmProvider,
        prompt: trimmedPrompt,
        issues: budgetIssues,
        onPlan: (plan) => {
          analysisMode = plan.mode;

          if (plan.mode === 'map-reduce') {
            chunkCount = plan.chunks?.length ?? 0;
          }
        }
      });
    } catch (error) {
      if (error instanceof PromptTooLongError) {
        request.log.warn({ error, repo: trimmedRepo }, 'Prompt rejected for length');
      } else if (error instanceof ContextBudgetError) {
        request.log.warn({ error, repo: trimmedRepo }, 'Context budget exceeded');
      } else if (error instanceof LLMConnectionError || error instanceof LLMModelError) {
        request.log.error({ error, repo: trimmedRepo }, 'LLM provider unavailable');
      } else if (error instanceof LLMResponseError) {
        request.log.warn({ error, repo: trimmedRepo }, 'LLM provider returned an invalid response');
      } else {
        request.log.error({ error, repo: trimmedRepo }, 'Unexpected error during analysis');
      }

      const mappedResponse = mapAnalysisErrorToResponse(error);
      return sendError(reply, mappedResponse.status, mappedResponse.code, mappedResponse.message);
    }

    const durationMs = Date.now() - startTime;
    const logMeta: Record<string, unknown> = {
      repo: trimmedRepo,
      issueCount: budgetIssues.length,
      mode: analysisMode,
      durationMs
    };

    if (chunkCount !== undefined) {
      logMeta.chunkCount = chunkCount;
    }

    request.log.info(logMeta, 'Repository analysis complete');

    if (wantsText) {
      reply.type('text/plain; charset=utf-8').send(`${analysisText}\n`);
      return reply;
    }

    return reply.send({ analysis: analysisText });
  });
};

export default analyzeRoute;
