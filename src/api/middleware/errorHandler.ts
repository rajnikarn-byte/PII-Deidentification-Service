import type { ErrorRequestHandler, RequestHandler } from 'express';
import { describeErrorSafely, type Logger } from '../../logging/logger.js';
import { ApiError, toErrorBody } from '../errors.js';
import { getRequestId } from './requestContext.js';

interface ErrorHandlerOptions {
  readonly logger: Logger;
  readonly bodyLimitBytes: number;
}

interface HttpLikeError {
  readonly type?: unknown;
  readonly status?: unknown;
}

/**
 * Maps body-parser failures to fixed, client-safe errors. The original messages are
 * discarded because they may quote the request body.
 */
function fromBodyParserError(error: HttpLikeError, bodyLimitBytes: number): ApiError | undefined {
  switch (error.type) {
    case 'entity.parse.failed':
      return new ApiError(400, 'MALFORMED_JSON', 'Request body is not valid JSON');
    case 'entity.too.large':
      return new ApiError(
        413,
        'PAYLOAD_TOO_LARGE',
        `Request body exceeds the limit of ${bodyLimitBytes} bytes`,
      );
    case 'encoding.unsupported':
      return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported Content-Encoding');
    case 'charset.unsupported':
      return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported charset; use utf-8');
    default:
      break;
  }
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    return new ApiError(400, 'BAD_REQUEST', 'The request could not be processed');
  }
  return undefined;
}

export function notFound(): RequestHandler {
  return (_req, _res, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'Resource not found'));
  };
}

export function methodNotAllowed(allowed: readonly string[]): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Allow', allowed.join(', '));
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', `Method not allowed; use ${allowed.join(', ')}`));
  };
}

export function errorHandler({ logger, bodyLimitBytes }: ErrorHandlerOptions): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const requestId = getRequestId(res);
    const apiError =
      error instanceof ApiError
        ? error
        : typeof error === 'object' && error !== null
          ? fromBodyParserError(error, bodyLimitBytes)
          : undefined;

    if (apiError) {
      logger.info('http.client_error', { requestId, code: apiError.code, status: apiError.status });
      res.status(apiError.status).json(toErrorBody(apiError, requestId));
      return;
    }

    logger.error('http.unhandled_error', { requestId, ...describeErrorSafely(error) });
    const internal = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    res.status(500).json(toErrorBody(internal, requestId));
  };
}
