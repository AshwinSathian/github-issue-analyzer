import Database from 'better-sqlite3';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config/schema.js';
import { createDatabase } from './lib/db.js';
import { defaultGitHubClient, type GitHubClient } from './lib/github/client.js';
import { createLLMProvider, type LLMProvider } from './lib/llm/provider.js';
import { runMigrations } from './lib/migrations.js';
import { createIssueRepository, type IssueRepository } from './lib/repositories/issueRepository.js';
import { createRepoRepository, type RepoRepository } from './lib/repositories/repoRepository.js';
import analyzeRoute from './routes/analyze.js';
import healthRoute from './routes/health.js';
import scanRoute from './routes/scan.js';

type SQLiteDatabase = InstanceType<typeof Database>;

type ServerDependencies = {
  githubClient?: GitHubClient;
  llmProviderFactory?: (config: Config) => LLMProvider;
  database?: SQLiteDatabase;
  issueRepository?: IssueRepository;
  repoRepository?: RepoRepository;
};

export const buildServer = (config: Config, dependencies: ServerDependencies = {}): FastifyInstance => {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL
    }
  });

  fastify.addHook('onRequest', (request, reply, done) => {
    const requestId = request.id ? String(request.id) : undefined;
    if (requestId) {
      reply.header('x-request-id', requestId);
      request.log = request.log.child({ requestId });
    }
    done();
  });

  const database = dependencies.database ?? createDatabase(config.STORAGE_PATH);
  const githubClient = dependencies.githubClient ?? defaultGitHubClient;
  const llmProviderFactory = dependencies.llmProviderFactory ?? createLLMProvider;

  try {
    runMigrations(database);
    fastify.log.info({ dbPath: config.STORAGE_PATH }, 'SQLite storage initialized');
  } catch (error) {
    fastify.log.error(error as Error, 'Unable to prepare SQLite storage');
    throw error;
  }

  const issueRepository = dependencies.issueRepository ?? createIssueRepository(database);
  const repoRepository = dependencies.repoRepository ?? createRepoRepository(database);

  fastify.register(healthRoute);
  fastify.register(scanRoute, {
    githubClient,
    githubToken: config.GITHUB_TOKEN,
    database,
    issueRepository,
    repoRepository
  });
  fastify.register(analyzeRoute, {
    config,
    llmProviderFactory,
    issueRepository,
    repoRepository
  });

  return fastify;
};

export default buildServer;
