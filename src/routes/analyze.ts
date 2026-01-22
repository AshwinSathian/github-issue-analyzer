import type { FastifyPluginAsync } from 'fastify';
import { createLLMProvider } from '../lib/llm/provider.js';
import { runAnalysis } from '../lib/analyze/runner.js';
import { PromptTooLongError, ContextBudgetError } from '../lib/budget/errors.js';
import { LLMConnectionError, LLMModelError, LLMResponseError } from '../lib/llm/errors.js';
import { getRepo } from '../lib/repositories/repoRepository.js';
import { getIssuesByRepo } from '../lib/repositories/issueRepository.js';
import type { Config } from '../config/schema.js';

const analyzeSchema = {
  body: {
    type: 'object',
    properties: {
      repo: { type: 'string' },
      prompt: { type: 'string' }
    },
    required: ['repo', 'prompt'],
    additionalProperties: false
  }
};

const repoPattern = /^[^/\s]+\/[^/\s]+$/;

type AnalyzeRouteOptions = {
  config: Config;
};

type AnalyzeRequestBody = {
  repo: string;
  prompt: string;
};

const analyzeRoute: FastifyPluginAsync<AnalyzeRouteOptions> = async (fastify, options) => {
  fastify.post('/analyze', { schema: analyzeSchema }, async (request, reply) => {
    const { repo, prompt } = request.body as AnalyzeRequestBody;
    const trimmedRepo = repo.trim();
    const trimmedPrompt = prompt.trim();

    if (!repoPattern.test(trimmedRepo)) {
      return reply
        .status(400)
        .send({ message: 'Invalid repo format, expected owner/repository (single slash)' });
    }

    if (!trimmedPrompt) {
      return reply.status(400).send({ message: 'Prompt must not be empty' });
    }

    const repoRecord = getRepo(trimmedRepo);

    if (!repoRecord) {
      return reply.status(404).send({
        message: 'Repo not scanned yet. Run POST /scan first.'
      });
    }

    const cachedIssues = getIssuesByRepo(trimmedRepo);

    if (!cachedIssues.length) {
      return reply.send({ analysis: 'No open issues cached for this repo.' });
    }

    const budgetIssues = cachedIssues.map((issue) => ({
      issueId: issue.issueId,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      htmlUrl: issue.htmlUrl,
      createdAt: issue.createdAt
    }));
    const llmProvider = createLLMProvider(options.config);

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
        return reply
          .status(400)
          .send({ message: `Prompt exceeds ${error.max} characters (${error.actual} provided)` });
      }

      if (error instanceof ContextBudgetError) {
        request.log.warn({ error, repo: trimmedRepo }, 'Context budget exceeded');
        return reply.status(400).send({
          message: `${error.message} Consider lowering ANALYZE_MAX_ISSUES or ISSUE_BODY_MAX_CHARS or increasing CONTEXT_MAX_TOKENS.`
        });
      }

      if (error instanceof LLMConnectionError || error instanceof LLMModelError) {
        request.log.error({ error, repo: trimmedRepo }, 'LLM provider unavailable');
        return reply.status(503).send({
          message: 'LLM provider unavailable; ensure the provider service is running and configured.'
        });
      }

      if (error instanceof LLMResponseError) {
        request.log.warn({ error, repo: trimmedRepo }, 'LLM provider returned an invalid response');
        return reply
          .status(502)
          .send({ message: 'LLM provider returned an unexpected response; try again shortly.' });
      }

      request.log.error({ error, repo: trimmedRepo }, 'Unexpected error during analysis');
      return reply.status(500).send({ message: 'Unable to analyze issues right now' });
    }

    const durationMs = Date.now() - startTime;
    const logMeta: Record<string, unknown> = {
      repo: trimmedRepo,
      issues: budgetIssues.length,
      mode: analysisMode,
      durationMs
    };

    if (chunkCount !== undefined) {
      logMeta.chunkCount = chunkCount;
    }

    request.log.info(logMeta, 'Repository analysis complete');

    return reply.send({ analysis: analysisText });
  });
};

export default analyzeRoute;
