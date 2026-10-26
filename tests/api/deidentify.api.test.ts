import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import express, { type Express, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/api/app.js';
import { errorHandler } from '../../src/api/middleware/errorHandler.js';
import { requestId } from '../../src/api/middleware/requestContext.js';
import { createLogger, type Logger } from '../../src/logging/logger.js';
import { capturingLogger, testConfig } from '../helpers.js';

const silent = createLogger({ level: 'silent' });

function appWith(overrides: Parameters<typeof testConfig>[0] = {}): Express {
  return createApp({ config: testConfig(overrides), logger: silent });
}

interface ErrorBody {
  error: { code: string; message: string; requestId: string; details?: unknown[] };
}

describe('POST /deidentify', () => {
  let app: Express;
  beforeEach(() => {
    app = appWith();
  });

  it('de-identifies all entity types by default', async () => {
    const res = await request(app)
      .post('/deidentify')
      .send({
        text: 'Mail jane@example.com, call (555) 123-4567, SSN 123-45-6789,\nDOB: 01/15/1990, card 4111 1111 1111 1111, IP 10.1.2.3.',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({
      deidentifiedText:
        'Mail [EMAIL], call [PHONE], SSN [SSN],\nDOB: [DATE_OF_BIRTH], card [CREDIT_CARD], IP [IP_ADDRESS].',
      entityCounts: {
        EMAIL: 1,
        PHONE: 1,
        SSN: 1,
        DATE_OF_BIRTH: 1,
        CREDIT_CARD: 1,
        IP_ADDRESS: 1,
      },
      totalEntities: 6,
    });
  });

  it('honours entity selection and only reports selected counts', async () => {
    const res = await request(app)
      .post('/deidentify')
      .send({ text: 'a@b.co and c@d.io from 10.0.0.1', entities: ['EMAIL'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      deidentifiedText: '[EMAIL] and [EMAIL] from 10.0.0.1',
      entityCounts: { EMAIL: 2 },
      totalEntities: 2,
    });
  });

  it('accepts a charset parameter and preserves Unicode', async () => {
    const res = await request(app)
      .post('/deidentify')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify({ text: 'Café ☕ 电话555-123-4567 😀' }));

    expect(res.status).toBe(200);
    expect((res.body as { deidentifiedText: string }).deidentifiedText).toBe('Café ☕ 电话[PHONE] 😀');
  });

  it('accepts an empty text', async () => {
    const res = await request(app).post('/deidentify').send({ text: '' });
    expect(res.status).toBe(200);
    expect((res.body as { totalEntities: number }).totalEntities).toBe(0);
  });

  it('accepts a trailing slash on the path', async () => {
    const res = await request(app).post('/deidentify/').send({ text: 'a@b.co' });
    expect(res.status).toBe(200);
  });

  describe('validation errors', () => {
    it.each([
      ['missing text', {}, 'text'],
      ['non-string text', { text: 123 }, 'text'],
      ['invalid entities type', { text: 'x', entities: 'EMAIL' }, 'entities'],
      ['empty entities', { text: 'x', entities: [] }, 'entities'],
      ['unsupported entity', { text: 'x', entities: ['NAME'] }, 'entities[0]'],
      ['unknown field', { text: 'x', foo: 1 }, 'body'],
      ['array body', [{ text: 'x' }], 'body'],
    ])('returns 400 for %s', async (_label, body, field) => {
      const res = await request(app).post('/deidentify').send(body);
      const payload = res.body as ErrorBody;

      expect(res.status).toBe(400);
      expect(payload.error.code).toBe('VALIDATION_ERROR');
      expect(payload.error.message).toBe('Request validation failed');
      expect(payload.error.details).toContainEqual(expect.objectContaining({ field }));
      expect(payload.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('returns 400 when text exceeds MAX_TEXT_LENGTH', async () => {
      const res = await request(appWith({ maxTextLength: 10 }))
        .post('/deidentify')
        .send({ text: 'x'.repeat(11) });
      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.details).toEqual([
        { field: 'text', message: 'text must be at most 10 characters' },
      ]);
    });

    it('returns 400 for an empty JSON body', async () => {
      const res = await request(app).post('/deidentify').set('Content-Type', 'application/json');
      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('returns 400 MALFORMED_JSON without echoing the body', async () => {
    const res = await request(app)
      .post('/deidentify')
      .set('Content-Type', 'application/json')
      .send('{"text": "ssn 123-45-6789"');

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error).toMatchObject({
      code: 'MALFORMED_JSON',
      message: 'Request body is not valid JSON',
    });
    expect(res.text).not.toContain('123-45-6789');
  });

  it('returns 400 MALFORMED_JSON for non-object JSON primitives (strict mode)', async () => {
    const res = await request(app)
      .post('/deidentify')
      .set('Content-Type', 'application/json')
      .send('"just a string"');
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('MALFORMED_JSON');
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const res = await request(appWith({ bodyLimitBytes: 1024 }))
      .post('/deidentify')
      .send({ text: 'x'.repeat(2048) });

    expect(res.status).toBe(413);
    expect((res.body as ErrorBody).error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the limit of 1024 bytes',
    });
  });

  describe.each([
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
  ] as const)('%s-encoded bodies', (encoding, compress) => {
    const sendCompressed = (app: Express, payload: unknown) => {
      const body = compress(JSON.stringify(payload));
      return (
        request(app)
          .post('/deidentify')
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', encoding)
          // Send the raw bytes; superagent would otherwise JSON-serialise the Buffer.
          .serialize(() => body as unknown as string)
          .send(body)
      );
    };

    it('accepts a compressed body within the limit', async () => {
      const res = await sendCompressed(appWith({ bodyLimitBytes: 1024 }), { text: 'a@b.co' });
      expect(res.status).toBe(200);
      expect((res.body as { deidentifiedText: string }).deidentifiedText).toBe('[EMAIL]');
    });

    it('applies the size limit to the decompressed body (zip-bomb protection)', async () => {
      const payload = { text: 'x'.repeat(10_000) };
      expect(compress(JSON.stringify(payload)).length).toBeLessThan(1024);

      const res = await sendCompressed(appWith({ bodyLimitBytes: 1024 }), payload);
      expect(res.status).toBe(413);
      expect((res.body as ErrorBody).error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  it.each([
    ['text/plain', 'hello'],
    ['application/x-www-form-urlencoded', 'text=hello'],
  ])('returns 415 for Content-Type %s', async (contentType, body) => {
    const res = await request(app).post('/deidentify').set('Content-Type', contentType).send(body);
    expect(res.status).toBe(415);
    expect((res.body as ErrorBody).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('returns 415 for an unsupported charset', async () => {
    const res = await request(app)
      .post('/deidentify')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{"text":"x"}');
    expect(res.status).toBe(415);
    expect((res.body as ErrorBody).error.message).toBe('Unsupported charset; use utf-8');
  });

  it('returns 415 for an unsupported Content-Encoding', async () => {
    const res = await request(app)
      .post('/deidentify')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress')
      .send('{"text":"x"}');
    expect(res.status).toBe(415);
    expect((res.body as ErrorBody).error.message).toBe('Unsupported Content-Encoding');
  });

  it('returns 400 BAD_REQUEST for a corrupt gzip body', async () => {
    const res = await request(app)
      .post('/deidentify')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('not gzip data');
    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).error.code).toBe('BAD_REQUEST');
  });

  it.each(['get', 'put', 'delete', 'patch'] as const)('returns 405 for %s', async (method) => {
    const res = await request(app)[method]('/deidentify');
    expect(res.status).toBe(405);
    expect(res.headers['allow']).toBe('POST');
    expect((res.body as ErrorBody).error.code).toBe('METHOD_NOT_ALLOWED');
  });
});

describe('rate limiting', () => {
  it('returns 429 with standard headers once the limit is exceeded', async () => {
    const app = appWith({ rateLimit: { windowMs: 60_000, max: 2 } });
    const send = () => request(app).post('/deidentify').send({ text: 'x' });

    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const limited = await send();

    expect(limited.status).toBe(429);
    expect((limited.body as ErrorBody).error.code).toBe('RATE_LIMITED');
    expect(limited.headers['ratelimit-policy']).toBeDefined();
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('does not rate-limit the health endpoint', async () => {
    const app = appWith({ rateLimit: { windowMs: 60_000, max: 1 } });
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });
});

describe('cross-cutting behaviour', () => {
  it('serves GET /health', async () => {
    const res = await request(appWith()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 405 for POST /health', async () => {
    const res = await request(appWith()).post('/health');
    expect(res.status).toBe(405);
    expect(res.headers['allow']).toBe('GET, HEAD');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(appWith()).get('/nope');
    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('sets security and no-cache headers and hides the framework', async () => {
    const res = await request(appWith()).post('/deidentify').send({ text: 'x' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['etag']).toBeUndefined();
  });

  it('propagates a well-formed X-Request-Id and replaces a malformed one', async () => {
    const app = appWith();
    const kept = await request(app).get('/health').set('X-Request-Id', 'trace-123');
    expect(kept.headers['x-request-id']).toBe('trace-123');

    const replaced = await request(app).get('/health').set('X-Request-Id', 'bad id <script>');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

});

describe('error handler', () => {
  function explodingApp(logger: Logger, thrown: unknown): Express {
    const app = express();
    app.use(requestId());
    app.get('/explode', () => {
      throw thrown;
    });
    app.use(errorHandler({ logger, bodyLimitBytes: 1024 }));
    return app;
  }

  it.each([
    ['an Error', new Error('secret a@b.co')],
    ['a non-Error value', 'secret a@b.co'],
    ['an object with a 5xx status', { status: 503, message: 'secret a@b.co' }],
  ])('returns a generic 500 for %s and logs no message', async (_label, thrown) => {
    const { logger, lines } = capturingLogger();
    const res = await request(explodingApp(logger, thrown)).get('/explode');

    expect(res.status).toBe(500);
    expect((res.body as ErrorBody).error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
    expect(res.text).not.toContain('a@b.co');
    expect(lines.join('\n')).not.toContain('a@b.co');
    expect(lines.join('\n')).toContain('http.unhandled_error');
  });

  it('delegates to Express when headers were already sent', () => {
    const handler = errorHandler({ logger: silent, bodyLimitBytes: 1024 });
    const error = new Error('late');
    const next = vi.fn();
    const res = { headersSent: true } as unknown as Response;

    handler(error, {} as Request, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('safe logging', () => {
  it('never writes request text, entity values or query strings to the logs', async () => {
    const { logger, lines } = capturingLogger();
    const app = createApp({ config: testConfig(), logger });
    const secrets = ['jane@example.com', '123-45-6789', '4111 1111 1111 1111', '10.9.8.7'];

    await request(app)
      .post('/deidentify?email=jane@example.com')
      .send({ text: secrets.join(' and ') });
    await request(app)
      .post('/deidentify')
      .set('Content-Type', 'application/json')
      .send(`{"text": "${secrets[1] ?? ''}"`);
    await request(app).get('/deidentify/jane@example.com');

    const output = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const secret of secrets) {
      expect(output).not.toContain(secret);
    }
    const access = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry['event'] === 'http.request');
    expect(access.map((entry) => entry['route'])).toEqual(['/deidentify', '/deidentify', 'unmatched']);
  });
});