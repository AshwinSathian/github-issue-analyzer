import type { FastifyReply } from 'fastify';

export const sendError = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({
    error: {
      code,
      message,
    },
  });
