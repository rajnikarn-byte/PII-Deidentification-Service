import { randomUUID } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import type { Logger } from '../../logging/logger.js';

const REQUEST_ID_HEADER = 'X-Request-Id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Reuses a well-formed incoming X-Request-Id (for tracing) or generates a new one. */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get(REQUEST_ID_HEADER);
    const id = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.locals['requestId'] = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}

export function getRequestId(res: Response): string {
  const id: unknown = res.locals['requestId'];
  return typeof id === 'string' ? id : 'unknown';
}

/**
 * Access log containing request metadata only. The body, query string and raw URL are never
 * logged; the matched route pattern is logged instead of the path so that PII placed in a
 * URL (e.g. /deidentify/john@example.com) cannot reach the logs.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const route = (req as { route?: { path?: unknown } }).route?.path;
      logger.info('http.request', {
        requestId: getRequestId(res),
        method: req.method,
        route: typeof route === 'string' ? `${req.baseUrl}${route}` : 'unmatched',
        status: res.statusCode,
        durationMs: Math.round(elapsedMs * 100) / 100,
        requestBytes: Number(req.get('content-length')) || 0,
      });
    });
    next();
  };
}

/** Responses carry de-identified (but still sensitive) text: forbid caching anywhere. */
export function noStore(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  };
}
