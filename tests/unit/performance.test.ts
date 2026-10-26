import { describe, expect, it } from 'vitest';
import { deidentify } from '../../src/service/deidentify.js';
import { NOW } from '../helpers.js';

/**
 * Guards against catastrophic regex backtracking (ReDoS). Each input is crafted to stress a
 * specific rule at the default maximum text length; a vulnerable pattern takes minutes.
 */
const MAX_TEXT = 100_000;
const BUDGET_MS = 2_000;

const fill = (unit: string): string => unit.repeat(Math.ceil(MAX_TEXT / unit.length)).slice(0, MAX_TEXT);

describe('performance / ReDoS resistance', () => {
  it.each([
    ['long local part without @', fill('a')],
    ['dotted local part without @', fill('a.')],
    ['domain labels without TLD', `a@${fill('b.')}`],
    ['hyphenated domain', `a@${fill('b-')}`],
    ['repeated @', fill('a@')],
    ['long digit run', fill('1')],
    ['spaced digits', fill('1 ')],
    ['dashed digit groups', fill('1234-')],
    ['international phone prefixes', fill('+1 2')],
    ['dotted numbers', fill('1.')],
    ['DOB keywords without dates', fill('DOB ')],
    ['SSN keywords without digits', fill('ssn ')],
    ['mixed realistic text', fill('Call 555-123-4567 or mail a@b.co, DOB 01/02/1990. ')],
  ])('processes %s within budget', (_label, text) => {
    const started = performance.now();
    deidentify(text, { now: NOW });
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });

  it('redacts thousands of entities correctly', () => {
    const text = 'x a@b.co 10.0.0.1\n'.repeat(5_000);
    const result = deidentify(text, { now: NOW });
    expect(result.entityCounts).toMatchObject({ EMAIL: 5_000, IP_ADDRESS: 5_000 });
  });
});
