import dotenv from 'dotenv';
import type { ZodIssue } from 'zod';
import { configSchema } from './schema.js';

dotenv.config();

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.errors
    .map((issue: ZodIssue) => {
      const label = issue.path.length ? issue.path.join('.') : 'env';
      return `- ${label}: ${issue.message}`;
    })
    .join('\n');

  throw new Error(`Configuration validation failed:\n${details}`);
}

export const config = parsed.data;
