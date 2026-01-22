import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../src/config/schema.js';
import { config as baseConfig } from '../src/config/index.js';
import { buildServer } from '../src/server.js';
import { createDatabase } from '../src/lib/db.js';
import { createIssueRepository, type Issue } from '../src/lib/repositories/issueRepository.js';
import { createRepoRepository } from '../src/lib/repositories/repoRepository.js';
import type { GitHubClient } from '../src/lib/github/client.js';
import { GitHubNotFoundError } from '../src/lib/github/errors.js';
import type { LLMProvider } from '../src/lib/llm/provider.js';

const TEST_REPO = 'open-source/example';

const makeTestConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    ...baseConfig,
    ...overrides
  } as Config);

const createTestEnvironment = async ({
  configOverrides,
  githubClient,
  llmProviderFactory
}: {
  configOverrides?: Partial<Config>;
  githubClient?: GitHubClient;
  llmProviderFactory?: (config: Config) => LLMProvider;
} = {}) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gha-test-'));
  const dbPath = path.join(tempDir, 'cache.db');
  const database = createDatabase(dbPath);
  const server = buildServer(makeTestConfig(configOverrides), {
    database,
    githubClient,
    llmProviderFactory
  });
  await server.ready();

  const issueRepository = createIssueRepository(database);
  const repoRepository = createRepoRepository(database);

  return {
    server,
    issueRepository,
    repoRepository,
    cleanup: async () => {
      await server.close();
      database.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
};

const createIssuePayload = (overrides: Partial<Issue> = {}): Issue => ({
  issueId: overrides.issueId ?? 1,
  number: overrides.number ?? 1,
  title: overrides.title ?? 'Example issue',
  body: overrides.body ?? 'Sample body',
  htmlUrl: overrides.htmlUrl ?? 'https://example.com/issue/1',
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  cachedAt: overrides.cachedAt ?? new Date().toISOString()
});

describe('API routes', () => {
  let env: Awaited<ReturnType<typeof createTestEnvironment>>;

  beforeEach(async () => {
    env = await createTestEnvironment();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('GET /health returns ok status', async () => {
    const response = await env.server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(typeof payload.uptimeSeconds).toBe('number');
  });

  it('POST /scan rejects invalid repo formats', async () => {
    const response = await env.server.inject({
      method: 'POST',
      url: '/scan',
      payload: { repo: 'badrepo' }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_REPO',
        message: 'Invalid repo format, expected owner/repository (single slash)'
      }
    });
  });

  it('POST /scan maps GitHub not found errors to 404', async () => {
    await env.cleanup();
    const githubClient: GitHubClient = {
      fetchOpenIssues: vi.fn().mockRejectedValue(new GitHubNotFoundError())
    };
    env = await createTestEnvironment({ githubClient });
    const response = await env.server.inject({
      method: 'POST',
      url: '/scan',
      payload: { repo: TEST_REPO }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('GITHUB_REPO_NOT_FOUND');
  });

  it('POST /scan succeeds and stores issues', async () => {
    await env.cleanup();
    const githubClient: GitHubClient = {
      fetchOpenIssues: vi.fn().mockResolvedValue([
        {
          id: 10,
          number: 5,
          title: 'Issue',
          body: 'Some body',
          html_url: 'https://example.com/issue/5',
          created_at: new Date().toISOString()
        }
      ])
    };
    env = await createTestEnvironment({ githubClient });
    const response = await env.server.inject({
      method: 'POST',
      url: '/scan',
      payload: { repo: TEST_REPO }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      repo: TEST_REPO,
      issues_fetched: 1,
      cached_successfully: true
    });
    const storedIssues = env.issueRepository.getIssuesByRepo(TEST_REPO);
    expect(storedIssues).toHaveLength(1);
  });

  it('POST /scan filters pull requests out of GitHub response', async () => {
    await env.cleanup();
    const githubClient: GitHubClient = {
      fetchOpenIssues: vi.fn().mockResolvedValue([
        {
          id: 11,
          number: 6,
          title: 'Real issue',
          body: 'Body',
          html_url: 'https://example.com/issue/6',
          created_at: new Date().toISOString()
        },
        {
          id: 13,
          number: 7,
          title: 'PR',
          body: 'Pull request body',
          html_url: 'https://example.com/pr/1',
          created_at: new Date().toISOString(),
          pull_request: {}
        }
      ])
    };
    env = await createTestEnvironment({ githubClient });
    await env.server.inject({ method: 'POST', url: '/scan', payload: { repo: TEST_REPO } });
    const storedIssues = env.issueRepository.getIssuesByRepo(TEST_REPO);
    expect(storedIssues).toHaveLength(1);
    expect(storedIssues[0].number).toBe(6);
  });

  it('POST /analyze returns 404 when repo not scanned', async () => {
    const response = await env.server.inject({
      method: 'POST',
      url: '/analyze',
      payload: { repo: TEST_REPO, prompt: 'Anything' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('REPO_NOT_SCANNED');
  });

  it('POST /analyze returns message when no cached issues', async () => {
    env.repoRepository.upsertRepo(TEST_REPO, new Date(), 0);
    const response = await env.server.inject({
      method: 'POST',
      url: '/analyze',
      payload: { repo: TEST_REPO, prompt: 'Anything' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ analysis: 'No open issues cached for this repo.' });
  });

  it('POST /analyze rejects overly long prompts', async () => {
    env.repoRepository.upsertRepo(TEST_REPO, new Date(), 1);
    env.issueRepository.persistIssueBatch(TEST_REPO, [createIssuePayload()]);
    const longPrompt = 'a'.repeat(baseConfig.PROMPT_MAX_CHARS + 10);
    const response = await env.server.inject({
      method: 'POST',
      url: '/analyze',
      payload: { repo: TEST_REPO, prompt: longPrompt }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('PROMPT_TOO_LONG');
  });

  it('POST /analyze returns provider output in single mode', async () => {
    env.repoRepository.upsertRepo(TEST_REPO, new Date(), 1);
    env.issueRepository.persistIssueBatch(TEST_REPO, [createIssuePayload()]);
    let singleCallCount = 0;
    const llmProviderFactory = () => {
      return {
        generate: async () => {
          singleCallCount += 1;
          return { text: 'analysis-output' };
        }
      };
    };
    await env.cleanup();
    env = await createTestEnvironment({ llmProviderFactory });
    env.repoRepository.upsertRepo(TEST_REPO, new Date(), 1);
    env.issueRepository.persistIssueBatch(TEST_REPO, [createIssuePayload()]);
    const response = await env.server.inject({
      method: 'POST',
      url: '/analyze',
      payload: { repo: TEST_REPO, prompt: 'short prompt' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ analysis: 'analysis-output' });
    expect(singleCallCount).toBeGreaterThan(0);
  });

  it('POST /analyze runs map-reduce when context window is small', async () => {
    let mapReduceCallCount = 0;
    const llmProviderFactory = () => {
      return {
        generate: async () => {
          mapReduceCallCount += 1;
          return { text: `response-${mapReduceCallCount}` };
        }
      };
    };
    await env.cleanup();
    env = await createTestEnvironment({
      configOverrides: { CONTEXT_MAX_TOKENS: 1810, ANALYZE_MAX_ISSUES: 20, ISSUE_BODY_MAX_CHARS: 512 },
      llmProviderFactory
    });
    env.repoRepository.upsertRepo(TEST_REPO, new Date(), 12);
    const heavyIssue = createIssuePayload({
      body: 'A'.repeat(400)
    });
    const now = Date.now();
    env.issueRepository.persistIssueBatch(
      TEST_REPO,
      Array.from({ length: 12 }, (_, index) => ({
        ...heavyIssue,
        issueId: index + 1,
        number: index + 1,
        createdAt: new Date(now + index).toISOString(),
        cachedAt: new Date(now + index).toISOString()
      }))
    );
    const response = await env.server.inject({
      method: 'POST',
      url: '/analyze',
      payload: { repo: TEST_REPO, prompt: 'Force map reduce' }
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.analysis).toMatch(/^response-\d+$/);
    expect(mapReduceCallCount).toBeGreaterThan(1);
  });
});
