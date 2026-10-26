import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logging/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { noStore, requestId, requestLogger } from './middleware/requestContext.js';
import { createDeidentifyRouter } from './routes/deidentify.js';
import { createHealthRouter } from './routes/health.js';

export interface AppDependencies {
  readonly config: AppConfig;
  readonly logger: Logger;
}

export function createApp({ config, logger }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('trust proxy', config.trustProxy);

  app.use(requestId());
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(noStore());

  app.use(createHealthRouter());
  app.use(createDeidentifyRouter({ config, logger }));

  app.use(notFound());
  app.use(errorHandler({ logger, bodyLimitBytes: config.bodyLimitBytes }));

  return app;
}
