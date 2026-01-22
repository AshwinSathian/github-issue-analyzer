import type { FastifyPluginAsync } from 'fastify';

const healthRoute: FastifyPluginAsync = async (server) => {
  server.get('/health', async () => ({
    ok: true,
    uptimeSeconds: Math.floor(process.uptime())
  }));
};

export default healthRoute;
