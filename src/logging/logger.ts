export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Fields are restricted to primitives so whole objects (request bodies, errors carrying
 * request data) cannot be logged by accident. Never put user-supplied text in a field.
 */
export type LogFields = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly write?: (line: string) => void;
  readonly clock?: () => Date;
}

const SEVERITY: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

/** Minimal structured JSON-lines logger. */
export function createLogger({
  level,
  write = (line) => process.stdout.write(`${line}\n`),
  clock = () => new Date(),
}: LoggerOptions): Logger {
  const threshold = SEVERITY[level];
  const log =
    (entryLevel: Exclude<LogLevel, 'silent'>) =>
    (event: string, fields: LogFields = {}): void => {
      if (SEVERITY[entryLevel] < threshold) {
        return;
      }
      write(JSON.stringify({ ...fields, time: clock().toISOString(), level: entryLevel, event }));
    };

  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}

/**
 * Describes an error for logging without its message: messages can embed user input
 * (JSON.parse errors, for example, quote a fragment of the request body).
 */
export function describeErrorSafely(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    return { errorName: typeof error };
  }
  const code = (error as { code?: unknown }).code;
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .map((line) => line.trim())
    .slice(0, 10)
    .join(' | ');
  return {
    errorName: error.name,
    errorCode: typeof code === 'string' || typeof code === 'number' ? code : undefined,
    stack: frames || undefined,
  };
}
