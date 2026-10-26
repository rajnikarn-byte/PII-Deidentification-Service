import express, { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../../config.js';
import type { Logger } from '../../logging/logger.js';
import { deidentify } from '../../service/deidentify.js';
import { ApiError } from '../errors.js';
import { methodNotAllowed } from '../middleware/errorHandler.js';
import { getRequestId } from '../middleware/requestContext.js';
import { validateDeidentifyRequest } from '../validation/deidentifyRequest.js';

interface RouteDependencies {
  readonly config: AppConfig;
  readonly logger: Logger;
}

/** Rejects non-JSON bodies up front (null means "no body", which validation reports). */
const requireJsonBody: RequestHandler = (req, _res, next) => {
  if (req.is('application/json') === false) {
    next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
    return;
  }
  next();
};

export function createDeidentifyRouter({ config, logger }: RouteDependencies): Router {
  const router = Router();
  const guards: RequestHandler[] = [];

  if (config.rateLimit.max > 0) {
    guards.push(
      rateLimit({
        windowMs: config.rateLimit.windowMs,
        limit: config.rateLimit.max,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (_req, _res, next) => {
          next(new ApiError(429, 'RATE_LIMITED', 'Too many requests; retry later'));
        },
      }),
    );
  }

  const handler: RequestHandler = (req, res) => {
    const body: unknown = req.body;
    const result = validateDeidentifyRequest(body, { maxTextLength: config.maxTextLength });
    if (!result.ok) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', result.issues);
    }

    const { text, entities } = result.value;
    const output = deidentify(text, entities ? { entities } : {});

    logger.debug('deidentify.completed', {
      requestId: getRequestId(res),
      textLength: text.length,
      totalEntities: output.totalEntities,
    });
    res.status(200).json(output);
  };

  router
    .route('/deidentify')
    .post(
      ...guards,
      requireJsonBody,
      express.json({ limit: config.bodyLimitBytes, strict: true, type: 'application/json' }),
      handler,
    )
    .all(methodNotAllowed(['POST']));

  return router;
}
