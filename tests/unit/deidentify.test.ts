import { describe, expect, it } from 'vitest';
import { ENTITY_TYPES } from '../../src/domain/entities.js';
import { deidentify } from '../../src/service/deidentify.js';
import { NOW, redact } from '../helpers.js';

const SAMPLE = [
  'Patient: Jane Doe, DOB: 03/14/1985',
  'Email: jane.doe@example.com | Phone: (555) 123-4567',
  'SSN 123-45-6789; card 4111 1111 1111 1111; last login from 192.168.0.12.',
].join('\n');

describe('deidentify', () => {
  it('redacts every supported entity type and counts them', () => {
    const result = deidentify(SAMPLE, { now: NOW });
    expect(result.deidentifiedText).toBe(
      [
        'Patient: Jane Doe, DOB: [DATE_OF_BIRTH]',
        'Email: [EMAIL] | Phone: [PHONE]',
        'SSN [SSN]; card [CREDIT_CARD]; last login from [IP_ADDRESS].',
      ].join('\n'),
    );
    expect(result.entityCounts).toEqual({
      EMAIL: 1,
      PHONE: 1,
      SSN: 1,
      DATE_OF_BIRTH: 1,
      CREDIT_CARD: 1,
      IP_ADDRESS: 1,
    });
    expect(result.totalEntities).toBe(6);
  });

  it('reports zero counts for selected types that were not found, in canonical order', () => {
    const result = deidentify('nothing here', { now: NOW });
    expect(Object.keys(result.entityCounts)).toEqual([...ENTITY_TYPES]);
    expect(Object.values(result.entityCounts).every((count) => count === 0)).toBe(true);
    expect(result.totalEntities).toBe(0);
    expect(result.deidentifiedText).toBe('nothing here');
  });

  it('only redacts and counts the selected entity types', () => {
    const result = deidentify(SAMPLE, { now: NOW, entities: ['EMAIL', 'SSN'] });
    expect(result.entityCounts).toEqual({ EMAIL: 1, SSN: 1 });
    expect(result.totalEntities).toBe(2);
    expect(result.deidentifiedText).toContain('[EMAIL]');
    expect(result.deidentifiedText).toContain('[SSN]');
    expect(result.deidentifiedText).toContain('(555) 123-4567');
    expect(result.deidentifiedText).toContain('4111 1111 1111 1111');
    expect(result.deidentifiedText).toContain('192.168.0.12');
    expect(result.deidentifiedText).toContain('03/14/1985');
  });

  it('counts multiple matches of the same type', () => {
    const result = deidentify('a@b.co, c@d.io and e@f.net', { now: NOW, entities: ['EMAIL'] });
    expect(result.deidentifiedText).toBe('[EMAIL], [EMAIL] and [EMAIL]');
    expect(result.entityCounts).toEqual({ EMAIL: 3 });
  });

  it('lets the longer entity win overlaps (phone-like e-mail local part)', () => {
    const result = deidentify('555-123-4567@example.com', { now: NOW });
    expect(result.deidentifiedText).toBe('[EMAIL]');
    expect(result.entityCounts['PHONE']).toBe(0);
  });

  it('does not relabel part of an unselected entity as a selected one', () => {
    const result = deidentify('Write 555-123-4567@example.com or call 555-123-4567', {
      now: NOW,
      entities: ['PHONE'],
    });
    expect(result.deidentifiedText).toBe('Write 555-123-4567@example.com or call [PHONE]');
    expect(result.entityCounts).toEqual({ PHONE: 1 });
  });

  it('treats an IP-like e-mail local part as part of the e-mail only', () => {
    const result = deidentify('ops.10.0.0.1@example.com', { now: NOW });
    expect(result.deidentifiedText).toBe('[EMAIL]');
    expect(result.totalEntities).toBe(1);
  });

  it('handles adjacent entities separated only by punctuation', () => {
    expect(redact('a@b.co;555-123-4567,10.0.0.1')).toBe('[EMAIL];[PHONE],[IP_ADDRESS]');
  });

  it('preserves CRLF, tabs and Unicode around redactions', () => {
    const input = 'Naïve café 😀\r\n\tTel: +44 20 7946 0958\r\n— fin';
    expect(redact(input)).toBe('Naïve café 😀\r\n\tTel: [PHONE]\r\n— fin');
  });

  it('works with entity values at the very start and end of the text', () => {
    expect(redact('10.0.0.1 x a@b.co')).toBe('[IP_ADDRESS] x [EMAIL]');
  });

  it('returns an empty string unchanged', () => {
    expect(deidentify('', { now: NOW })).toEqual({
      deidentifiedText: '',
      entityCounts: Object.fromEntries(ENTITY_TYPES.map((type) => [type, 0])),
      totalEntities: 0,
    });
  });

  it('is idempotent: placeholders are never re-detected', () => {
    const once = redact(SAMPLE);
    expect(redact(once)).toBe(once);
  });

  it('defaults to all entities and the current date', () => {
    const result = deidentify('DOB 01/02/1990, a@b.co');
    expect(result.deidentifiedText).toBe('DOB [DATE_OF_BIRTH], [EMAIL]');
  });

  it('accepts custom rule sets', () => {
    const result = deidentify('a@b.co 10.0.0.1', { now: NOW, rules: [] });
    expect(result.totalEntities).toBe(0);
  });
});
