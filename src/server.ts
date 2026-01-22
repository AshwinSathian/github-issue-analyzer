import Fastify, { FastifyInstance } from 'fastify';
import type { Config } from './config/schema.js';
import healthRoute from './routes/health.js';

export const buildServer = (config: Config): FastifyInstance => {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL
    }
  });

  fastify.register(healthRoute);

  return fastify;
};

export default buildServer;
