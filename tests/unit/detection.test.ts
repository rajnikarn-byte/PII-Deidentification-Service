import { describe, expect, it } from 'vitest';
import { detectCandidates } from '../../src/detection/detector.js';
import { compile } from '../../src/detection/patterns.js';
import { DEFAULT_RULES, type DetectionRule } from '../../src/detection/rules.js';
import { NOW, redact } from '../helpers.js';

describe('EMAIL detection', () => {
  it.each([
    ['plain', 'Contact john@example.com now', 'Contact [EMAIL] now'],
    ['dots, plus and subdomains', 'Mail jane.doe+news@mail.example.co.uk.', 'Mail [EMAIL].'],
    ['in angle brackets', 'From: Jane <jane@example.org>', 'From: Jane <[EMAIL]>'],
    ['in parentheses', '(jane@example.org)', '([EMAIL])'],
    ['quoted', '"jane@example.org"', '"[EMAIL]"'],
    ['mailto', 'mailto:jane@example.org', 'mailto:[EMAIL]'],
    ['uppercase', 'JANE.DOE@EXAMPLE.COM', '[EMAIL]'],
    ['unicode local part and IDN', 'josé@münchen.de', '[EMAIL]'],
    ['adjacent to CJK text', '邮箱john@example.com谢谢', '邮箱[EMAIL]谢谢'],
    ['trailing comma', 'a@b.co, c@d.io', '[EMAIL], [EMAIL]'],
  ])('detects %s', (_label, input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ['no TLD', 'user@localhost'],
    ['single-letter TLD', 'user@example.c'],
    ['numeric TLD', 'user@example.123'],
    ['twitter handle', 'ping @someone today'],
    ['missing local part', '@example.com'],
    ['double dot in domain', 'user@example..com'],
  ])('ignores %s', (_label, input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('PHONE detection', () => {
  it.each([
    ['dashed', 'Call 555-123-4567.', 'Call [PHONE].'],
    ['dotted', 'Call 555.123.4567', 'Call [PHONE]'],
    ['spaced', 'Call 555 123 4567', 'Call [PHONE]'],
    ['parenthesised area code', 'Call (555) 123-4567!', 'Call [PHONE]!'],
    ['+1 prefix', 'Call +1 (555) 123-4567', 'Call [PHONE]'],
    ['1- prefix', 'Call 1-555-123-4567', 'Call [PHONE]'],
    ['E.164', 'Call +14155552671', 'Call [PHONE]'],
    ['UK international', 'Call +44 20 7946 0958 today', 'Call [PHONE] today'],
    ['India international', 'Call +91 98765 43210', 'Call [PHONE]'],
    ['trunk prefix in parentheses', 'Call +49 (0)30 123456', 'Call [PHONE]'],
    ['en dash separators', 'Call 555–123–4567', 'Call [PHONE]'],
    ['no-break spaces', 'Call 555\u00A0123\u00A04567', 'Call [PHONE]'],
    ['adjacent to CJK text', '电话555-123-4567', '电话[PHONE]'],
    ['spaced extension', 'Call 555-123-4567 ext. 89.', 'Call [PHONE].'],
    ['attached extension', 'Call 555-123-4567x89', 'Call [PHONE]'],
    ['international with extension', 'Call +44 20 7946 0958 #12', 'Call [PHONE]'],
  ])('detects %s', (_label, input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ['bare 10 digits', 'Order 5551234567'],
    ['too short', 'Code 555-1234'],
    ['part of longer digit group', 'Ref 12-555-123-4567'],
    ['continued by another group', 'Ref 555-123-4567-89'],
    ['glued to letters', 'ID555-123-4567'],
    ['split across lines', 'Call 555\n123-4567'],
    ['too many international digits', 'Code +1234 5678 9012 3456'],
    ['too few international digits', 'Score +12 34'],
    ['arithmetic', 'Result: 5 + 3 - 2'],
  ])('ignores %s', (_label, input) => {
    expect(redact(input)).toBe(input);
  });

  it('does not treat a detached "x" as an extension', () => {
    expect(redact('Call 555-123-4567 x 3 apples')).toBe('Call [PHONE] x 3 apples');
  });

  it.each([
    ['phone-shaped invoice number', 'Invoice 100-200-3000', 'Invoice [PHONE]'],
  ])('documents known false positive: %s', (_label, input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ['bare 10 digits', 'Bare 5551234567'],
    ['full-width digits', 'Tel ５５５-１２３-４５６７'],
    ['national format without +', 'UK 020 7946 0958'],
  ])('documents known miss: %s', (_label, input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('SSN detection', () => {
  it.each([
    ['dashed', 'SSN 123-45-6789.', 'SSN [SSN].'],
    ['spaced', 'SSN 123 45 6789', 'SSN [SSN]'],
    ['without keyword', 'ID: 219-09-9999', 'ID: [SSN]'],
    ['bare digits after keyword', 'SSN: 123456789', 'SSN: [SSN]'],
    ['bare digits after long keyword', 'Social Security Number is 123456789', 'Social Security Number is [SSN]'],
    ['lowercase keyword', 'ssn#123456789', 'ssn#[SSN]'],
    ['two in a list', '123-45-6789,234-56-7890', '[SSN],[SSN]'],
  ])('detects %s', (_label, input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ['area 000', 'SSN 000-12-3456'],
    ['area 666', 'SSN 666-12-3456'],
    ['area 9xx', 'SSN 912-34-5678'],
    ['group 00', 'SSN 123-00-6789'],
    ['serial 0000', 'SSN 123-45-0000'],
    ['mixed separators', 'SSN 123-45 6789'],
    ['bare digits without keyword', 'Order 123456789'],
    ['bare digits after sentence end', 'SSN unknown. Order 123456789'],
    ['keyword inside another word', 'classn 123456789'],
    ['longer digit group', 'Ref 1123-45-6789'],
  ])('ignores %s', (_label, input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('DATE_OF_BIRTH detection', () => {
  it.each([
    ['DOB slash', 'DOB: 01/15/1990', 'DOB: [DATE_OF_BIRTH]'],
    ['D.O.B. with dashes', 'D.O.B. 15-01-1990', 'D.O.B. [DATE_OF_BIRTH]'],
    ['date of birth ISO', 'Date of birth: 1990-01-15.', 'Date of birth: [DATE_OF_BIRTH].'],
    ['birthdate', 'Birthdate 1990/01/15', 'Birthdate [DATE_OF_BIRTH]'],
    ['birthday textual', 'Birthday: January 15th, 1990', 'Birthday: [DATE_OF_BIRTH]'],
    ['born on', 'She was born on 5 March 1985.', 'She was born on [DATE_OF_BIRTH].'],
    ['day of month', 'Born 15th of March, 1990', 'Born [DATE_OF_BIRTH]'],
    ['abbreviated month', 'DOB Sept. 5, 1985', 'DOB [DATE_OF_BIRTH]'],
    ['dd-Mon-yyyy', 'dob=15-Jan-1990', 'dob=[DATE_OF_BIRTH]'],
    ['format hint between', 'DOB (MM/DD/YYYY): 07/04/1976', 'DOB (MM/DD/YYYY): [DATE_OF_BIRTH]'],
    ['two-digit year', 'DOB 07/04/76', 'DOB [DATE_OF_BIRTH]'],
    ['day-first reading', 'DOB 31/12/1999', 'DOB [DATE_OF_BIRTH]'],
    ['hyphenated keyword', 'date-of-birth: 1990-01-15', 'date-of-birth: [DATE_OF_BIRTH]'],
  ])('detects %s', (_label, input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ['date without DOB context', 'Appointment on 01/15/2024'],
    ['ISO timestamp', 'Created 2024-01-15'],
    ['impossible date', 'DOB 02/30/1990'],
    ['future date', 'DOB 01/01/2099'],
    ['before 1900', 'DOB 1850-01-01'],
    ['context ended by sentence', 'Born in Ohio. Visit on 01/15/2020'],
    ['context ended by line break', 'DOB:\n01/15/1990'],
    ['keyword inside a word', 'newborn 01/15/2020'],
    ['context window too long', `DOB ${'x'.repeat(40)} 01/15/1990`],
  ])('ignores %s', (_label, input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('CREDIT_CARD detection', () => {
  it.each([
    ['Visa spaced', 'Card 4111 1111 1111 1111.', 'Card [CREDIT_CARD].'],
    ['Visa dashed', 'Card 4111-1111-1111-1111', 'Card [CREDIT_CARD]'],
    ['Visa contiguous', 'Card 4111111111111111', 'Card [CREDIT_CARD]'],
    ['Mastercard', 'MC: 5555 5555 5555 4444', 'MC: [CREDIT_CARD]'],
    ['Amex 4-6-5', 'Amex 3782 822463 10005', 'Amex [CREDIT_CARD]'],
    ['Discover', 'Discover 6011111111111117', 'Discover [CREDIT_CARD]'],
    ['adjacent to CJK text', '卡号4111111111111111', '卡号[CREDIT_CARD]'],
  ])('detects %s', (_label, input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ['failed Luhn', 'Card 4111 1111 1111 1112'],
    ['unknown network', 'Ref 9999999999999995'],
    ['order number', 'Order 1234567890123'],
    ['mixed separators', 'Card 4111 1111-1111 1111'],
    ['inside longer digit run', 'Tx 41111111111111110000'],
    ['tracking number with letters', 'Track 1Z4111111111111111'],
    ['single digits spaced', '4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1'],
  ])('ignores %s', (_label, input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('IP_ADDRESS detection', () => {
  it.each([
    ['plain', 'Host 192.168.1.1 is up', 'Host [IP_ADDRESS] is up'],
    ['end of sentence', 'Blocked 8.8.8.8.', 'Blocked [IP_ADDRESS].'],
    ['with port', 'Connect to 10.0.0.1:8080', 'Connect to [IP_ADDRESS]:8080'],
    ['CIDR', 'Subnet 10.0.0.0/24', 'Subnet [IP_ADDRESS]/24'],
    ['brackets', '[203.0.113.7]', '[[IP_ADDRESS]]'],
    ['boundaries', '0.0.0.0 and 255.255.255.255', '[IP_ADDRESS] and [IP_ADDRESS]'],
  ])('detects %s', (_label, input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ['octet out of range', 'Bad 256.1.1.1'],
    ['leading zeros', 'Bad 01.02.03.04'],
    ['five parts', 'Version 1.2.3.4.5'],
    ['prefixed version', 'v1.2.3.4'],
    ['three parts', 'Version 1.2.3'],
    ['hostname-like suffix', '1.2.3.4.example'],
    ['IPv6 (out of scope)', 'IPv6 2001:db8::1'],
  ])('ignores %s', (_label, input) => {
    expect(redact(input)).toBe(input);
  });

  it('documents known false positive: four-part version numbers', () => {
    expect(redact('Release 1.2.3.4 shipped')).toBe('Release [IP_ADDRESS] shipped');
  });
});

describe('detectCandidates', () => {
  it('returns raw validated candidates including overlaps from multiple rules', () => {
    const candidates = detectCandidates('+1 555 123 4567', DEFAULT_RULES, { now: NOW });
    const phoneSpans = candidates.filter((c) => c.type === 'PHONE');
    expect(phoneSpans.length).toBeGreaterThanOrEqual(2);
    expect(phoneSpans).toContainEqual({ type: 'PHONE', start: 0, end: 15 });
  });

  it('retries after a failed validation so overlapping valid candidates are found', () => {
    const rule: DetectionRule = {
      id: 'test',
      entityType: 'SSN',
      pattern: compile(String.raw`\d{3}`),
      validate: (value) => value !== '123',
    };
    expect(detectCandidates('1234', [rule], { now: NOW })).toEqual([
      { type: 'SSN', start: 1, end: 4 },
    ]);
  });

  it('does not loop forever on zero-length matches', () => {
    const rule: DetectionRule = {
      id: 'empty',
      entityType: 'EMAIL',
      pattern: compile('(?:)'),
      validate: () => true,
    };
    expect(detectCandidates('abc😀', [rule], { now: NOW })).toEqual([]);
  });

  it('resumes after a rejected match on an astral character with correct offsets', () => {
    let calls = 0;
    const rule: DetectionRule = {
      id: 'emoji',
      entityType: 'EMAIL',
      pattern: compile(String.raw`\p{Extended_Pictographic}x`),
      validate: () => (calls += 1) > 1,
    };
    expect(detectCandidates('😀x😀x', [rule], { now: NOW })).toEqual([
      { type: 'EMAIL', start: 3, end: 6 },
    ]);
    expect(calls).toBe(2);
  });

  it('ignores lastIndex state left on a rule pattern', () => {
    const rule: DetectionRule = {
      id: 'stateful',
      entityType: 'EMAIL',
      pattern: compile('a@b\\.co'),
      validate: () => true,
    };
    rule.pattern.lastIndex = 100;
    expect(detectCandidates('a@b.co', [rule], { now: NOW })).toEqual([
      { type: 'EMAIL', start: 0, end: 6 },
    ]);
    expect(rule.pattern.lastIndex).toBe(100);
  });

  it('defaults to the built-in rules and current date', () => {
    expect(detectCandidates('DOB 01/02/1990')).toEqual([
      { type: 'DATE_OF_BIRTH', start: 4, end: 14 },
    ]);
  });
});
