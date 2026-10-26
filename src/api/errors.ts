export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'MALFORMED_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  readonly field: string;
  readonly message: string;
}

export interface ErrorResponseBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly ErrorDetail[];
  };
}

/** An error whose message and details are safe to return to the client. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: readonly ErrorDetail[] | undefined;

  constructor(status: number, code: ErrorCode, message: string, details?: readonly ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toErrorBody(error: ApiError, requestId: string): ErrorResponseBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details && error.details.length > 0 ? { details: error.details } : {}),
    },
  };
}
