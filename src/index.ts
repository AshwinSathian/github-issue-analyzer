import { config } from './config/index.js';
import buildServer from './server.js';

const server = buildServer(config);

const start = async () => {
  const preferredHost = '0.0.0.0';

  const logAndExit = (error: Error) => {
    server.log.error(error, 'Failed to start server');
    process.exit(1);
  };

  try {
    await server.listen({ port: config.PORT, host: preferredHost });
    server.log.info({ host: preferredHost, port: config.PORT }, 'Server listening');
    return;
  } catch (error) {
    const err = error as NodeJS.ErrnoException | undefined;

    if (err?.code === 'EPERM') {
      server.log.warn({ err }, 'Unable to bind to 0.0.0.0, falling back to localhost');
    } else {
      logAndExit(err ?? new Error('Unknown error'));
    }
  }

  try {
    await server.listen({ port: config.PORT, host: '127.0.0.1' });
    server.log.info({ host: '127.0.0.1', port: config.PORT }, 'Server listening');
  } catch (error) {
    logAndExit(error as Error);
  }
};

void start();
