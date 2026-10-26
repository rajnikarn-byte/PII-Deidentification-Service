import { describe, expect, it } from 'vitest';
import { validateDeidentifyRequest } from '../../src/api/validation/deidentifyRequest.js';

const limits = { maxTextLength: 20 };

describe('validateDeidentifyRequest', () => {
  it('accepts text without entities', () => {
    expect(validateDeidentifyRequest({ text: 'hello' }, limits)).toEqual({
      ok: true,
      value: { text: 'hello' },
    });
  });

  it('accepts an empty string', () => {
    expect(validateDeidentifyRequest({ text: '' }, limits)).toEqual({ ok: true, value: { text: '' } });
  });

  it('accepts text at exactly the length limit', () => {
    expect(validateDeidentifyRequest({ text: 'x'.repeat(20) }, limits).ok).toBe(true);
  });

  it('deduplicates entities and returns them in canonical order', () => {
    const result = validateDeidentifyRequest(
      { text: 'x', entities: ['SSN', 'EMAIL', 'SSN'] },
      limits,
    );
    expect(result).toEqual({ ok: true, value: { text: 'x', entities: ['EMAIL', 'SSN'] } });
  });

  it.each([
    ['null', null],
    ['an array', [{ text: 'x' }]],
    ['a string', 'text'],
    ['a number', 42],
  ])('rejects a body that is %s', (_label, body) => {
    expect(validateDeidentifyRequest(body, limits)).toEqual({
      ok: false,
      issues: [{ field: 'body', message: 'Request body must be a JSON object' }],
    });
  });

  it.each([
    ['missing text', {}, 'text', 'text is required'],
    ['numeric text', { text: 5 }, 'text', 'text must be a string'],
    ['null text', { text: null }, 'text', 'text must be a string'],
    ['too long text', { text: 'x'.repeat(21) }, 'text', 'text must be at most 20 characters'],
    ['entities not array', { text: 'x', entities: 'EMAIL' }, 'entities', 'entities must be an array of entity types'],
    ['entities null', { text: 'x', entities: null }, 'entities', 'entities must be an array of entity types'],
    ['empty entities', { text: 'x', entities: [] }, 'entities', 'entities must contain at least one entity type'],
  ])('rejects %s', (_label, body, field, message) => {
    const result = validateDeidentifyRequest(body, limits);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues).toContainEqual({ field, message });
  });

  it('rejects unknown and wrongly-cased entity types by index without echoing them', () => {
    const result = validateDeidentifyRequest(
      { text: 'x', entities: ['EMAIL', 'email', 'john@example.com', 7] },
      limits,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.field)).toEqual([
        'entities[1]',
        'entities[2]',
        'entities[3]',
      ]);
      expect(JSON.stringify(result.issues)).not.toContain('john@example.com');
    }
  });

  it('caps the number of reported entity issues', () => {
    const result = validateDeidentifyRequest(
      { text: 'x', entities: Array.from({ length: 50 }, () => 'NOPE') },
      limits,
    );
    expect(!result.ok && result.issues).toHaveLength(10);
  });

  it('rejects unknown fields without echoing their names', () => {
    const result = validateDeidentifyRequest({ text: 'x', 'jane@example.com': 1 }, limits);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('jane@example.com');
  });

  it('reports multiple problems at once', () => {
    const result = validateDeidentifyRequest({ entities: 'x', extra: true }, limits);
    expect(!result.ok && result.issues.map((issue) => issue.field)).toEqual([
      'body',
      'text',
      'entities',
    ]);
  });
});
