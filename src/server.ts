import { createApp } from './api/app.js';
import { loadConfig } from './config.js';
import { createLogger, describeErrorSafely } from './logging/logger.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const app = createApp({ config, logger });

const server = app.listen(config.port, config.host, (error?: Error) => {
  if (error) {
    logger.error('server.start_failed', describeErrorSafely(error));
    process.exit(1);
  }
  logger.info('server.started', { host: config.host, port: config.port });
});

// Bound slow or idle clients (slowloris-style resource exhaustion).
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('server.stopping', { signal });
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close((error) => {
    if (error) {
      logger.error('server.stop_failed', describeErrorSafely(error));
      process.exit(1);
    }
    logger.info('server.stopped');
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled_rejection', describeErrorSafely(reason));
});
process.on('uncaughtException', (error) => {
  logger.error('process.uncaught_exception', describeErrorSafely(error));
  process.exit(1);
});
