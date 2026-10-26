import { LOG_LEVELS, type LogLevel } from './logging/logger.js';

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  /** Maximum JSON request body size in bytes. */
  readonly bodyLimitBytes: number;
  /** Maximum `text` length in UTF-16 code units (JavaScript string length). */
  readonly maxTextLength: number;
  readonly rateLimit: {
    readonly windowMs: number;
    /** Requests per window per client; 0 disables rate limiting. */
    readonly max: number;
  };
  /** Express `trust proxy` setting. Only enable behind a proxy you control. */
  readonly trustProxy: boolean | number | string;
  readonly logLevel: LogLevel;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const DEFAULT_CONFIG: AppConfig = Object.freeze({
  port: 3000,
  host: '0.0.0.0',
  bodyLimitBytes: 256 * 1024,
  maxTextLength: 100_000,
  rateLimit: Object.freeze({ windowMs: 60_000, max: 120 }),
  trustProxy: false,
  logLevel: 'info',
});

type Env = Readonly<Record<string, string | undefined>>;

function readInt(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be a non-negative integer`);
  }
  const value = Number(raw);
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

const SIZE_UNITS: Readonly<Record<string, number>> = { b: 1, kb: 1024, mb: 1024 * 1024 };
const MAX_BODY_LIMIT_BYTES = 10 * 1024 * 1024;

/**
 * Parses sizes like "256kb" strictly. An unparseable limit must never reach body-parser,
 * which historically treated invalid limits as "no limit" (GHSA-v422-hmwv-36x6).
 */
export function parseByteSize(raw: string): number {
  const match = /^(\d+)\s*(b|kb|mb)?$/i.exec(raw.trim());
  if (!match) {
    throw new ConfigError('BODY_LIMIT must look like "512b", "256kb" or "1mb"');
  }
  const bytes = Number(match[1]) * (SIZE_UNITS[(match[2] ?? 'b').toLowerCase()] ?? 1);
  if (bytes < 1 || bytes > MAX_BODY_LIMIT_BYTES) {
    throw new ConfigError(`BODY_LIMIT must be between 1 byte and ${MAX_BODY_LIMIT_BYTES} bytes`);
  }
  return bytes;
}

function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = raw?.trim();
  if (value === undefined || value === '' || value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === '') {
    return DEFAULT_CONFIG.logLevel;
  }
  if (!(LOG_LEVELS as readonly string[]).includes(value)) {
    throw new ConfigError(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`);
  }
  return value as LogLevel;
}

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    port: readInt(env, 'PORT', DEFAULT_CONFIG.port, 0, 65_535),
    host: env['HOST']?.trim() || DEFAULT_CONFIG.host,
    bodyLimitBytes: env['BODY_LIMIT']
      ? parseByteSize(env['BODY_LIMIT'])
      : DEFAULT_CONFIG.bodyLimitBytes,
    maxTextLength: readInt(env, 'MAX_TEXT_LENGTH', DEFAULT_CONFIG.maxTextLength, 1, 5_000_000),
    rateLimit: {
      windowMs: readInt(
        env,
        'RATE_LIMIT_WINDOW_MS',
        DEFAULT_CONFIG.rateLimit.windowMs,
        1_000,
        86_400_000,
      ),
      max: readInt(env, 'RATE_LIMIT_MAX', DEFAULT_CONFIG.rateLimit.max, 0, 1_000_000),
    },
    trustProxy: parseTrustProxy(env['TRUST_PROXY']),
    logLevel: parseLogLevel(env['LOG_LEVEL']),
  };
}
