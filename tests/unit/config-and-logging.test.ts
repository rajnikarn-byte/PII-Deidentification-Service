import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, loadConfig, parseByteSize } from '../../src/config.js';
import { createLogger, describeErrorSafely } from '../../src/logging/logger.js';

describe('loadConfig', () => {
  it('uses defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('reads all supported variables', () => {
    expect(
      loadConfig({
        PORT: '8080',
        HOST: '127.0.0.1',
        BODY_LIMIT: '1mb',
        MAX_TEXT_LENGTH: '5000',
        RATE_LIMIT_WINDOW_MS: '1000',
        RATE_LIMIT_MAX: '0',
        TRUST_PROXY: '1',
        LOG_LEVEL: 'DEBUG',
      }),
    ).toEqual({
      port: 8080,
      host: '127.0.0.1',
      bodyLimitBytes: 1024 * 1024,
      maxTextLength: 5000,
      rateLimit: { windowMs: 1000, max: 0 },
      trustProxy: 1,
      logLevel: 'debug',
    });
  });

  it.each([
    ['', false],
    ['false', false],
    ['true', true],
    ['2', 2],
    ['loopback', 'loopback'],
  ])('parses TRUST_PROXY=%j', (value, expected) => {
    expect(loadConfig({ TRUST_PROXY: value }).trustProxy).toEqual(expected);
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['PORT', '-1'],
    ['MAX_TEXT_LENGTH', '0'],
    ['RATE_LIMIT_WINDOW_MS', '10'],
    ['LOG_LEVEL', 'verbose'],
    ['BODY_LIMIT', 'lots'],
    ['BODY_LIMIT', '0kb'],
    ['BODY_LIMIT', '100mb'],
  ])('rejects invalid %s=%s', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(ConfigError);
  });
});

describe('parseByteSize', () => {
  it.each([
    ['512', 512],
    ['512b', 512],
    ['256kb', 256 * 1024],
    ['256 KB', 256 * 1024],
    ['2mb', 2 * 1024 * 1024],
  ])('parses %s', (raw, bytes) => {
    expect(parseByteSize(raw)).toBe(bytes);
  });
});

describe('createLogger', () => {
  const clock = () => new Date('2026-01-01T00:00:00Z');

  it('writes structured JSON lines at or above the configured level', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', write: (line) => lines.push(line), clock });
    logger.debug('hidden');
    logger.info('shown', { a: 1 });
    logger.warn('warned');
    logger.error('failed');
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { a: 1, time: '2026-01-01T00:00:00.000Z', level: 'info', event: 'shown' },
      { time: '2026-01-01T00:00:00.000Z', level: 'warn', event: 'warned' },
      { time: '2026-01-01T00:00:00.000Z', level: 'error', event: 'failed' },
    ]);
  });

  it('does not let fields override reserved keys', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'debug', write: (line) => lines.push(line), clock });
    logger.info('real', { event: 'spoofed', level: 'error' });
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ event: 'real', level: 'info' });
  });

  it('writes nothing when silent', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'silent', write: (line) => lines.push(line) });
    logger.error('x');
    expect(lines).toEqual([]);
  });
});

describe('describeErrorSafely', () => {
  it('omits the error message (which may contain user data)', () => {
    const error = new SyntaxError('Unexpected token in JSON: "ssn 123-45-6789"');
    const fields = describeErrorSafely(error);
    expect(fields['errorName']).toBe('SyntaxError');
    expect(JSON.stringify(fields)).not.toContain('123-45-6789');
    expect(String(fields['stack'])).toContain('at ');
  });

  it('includes string or numeric error codes', () => {
    const error = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
    expect(describeErrorSafely(error)['errorCode']).toBe('ECONNRESET');
  });

  it('handles non-Error values', () => {
    expect(describeErrorSafely('a@b.co')).toEqual({ errorName: 'string' });
  });

  it('handles errors without a stack', () => {
    const error = new Error('x');
    delete error.stack;
    expect(describeErrorSafely(error)).toEqual({
      errorName: 'Error',
      errorCode: undefined,
      stack: undefined,
    });
  });
});
