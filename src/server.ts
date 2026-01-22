import Fastify, { FastifyInstance } from 'fastify';
import type { Config } from './config/schema.js';
import healthRoute from './routes/health.js';
import scanRoute from './routes/scan.js';
import analyzeRoute from './routes/analyze.js';
import { db } from './lib/db.js';
import { runMigrations } from './lib/migrations.js';

export const buildServer = (config: Config): FastifyInstance => {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL
    }
  });

  try {
    runMigrations(db);
    fastify.log.info({ dbPath: config.STORAGE_PATH }, 'SQLite storage initialized');
  } catch (error) {
    fastify.log.error(error as Error, 'Unable to prepare SQLite storage');
    throw error;
  }

  fastify.register(healthRoute);
  fastify.register(scanRoute, { githubToken: config.GITHUB_TOKEN });
  fastify.register(analyzeRoute, { config });

  return fastify;
};

export default buildServer;
