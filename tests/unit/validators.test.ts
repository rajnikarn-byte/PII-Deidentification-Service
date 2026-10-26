import { describe, expect, it } from 'vitest';
import {
  isValidCreditCardNumber,
  matchesKnownCardNetwork,
  passesLuhn,
} from '../../src/validation/creditCard.js';
import {
  daysInMonth,
  isLeapYear,
  isPlausibleDateOfBirth,
  isValidCalendarDate,
  parseDateCandidates,
} from '../../src/validation/date.js';
import { isValidEmail } from '../../src/validation/email.js';
import { isValidIPv4 } from '../../src/validation/ipv4.js';
import { isValidInternationalPhone, isValidNanpPhone } from '../../src/validation/phone.js';
import { isValidSsn } from '../../src/validation/ssn.js';

const NOW = new Date('2026-10-26T12:00:00Z');

describe('passesLuhn', () => {
  it.each(['4111111111111111', '5555555555554444', '378282246310005', '79927398713', '0'])(
    'accepts %s',
    (digits) => {
      expect(passesLuhn(digits)).toBe(true);
    },
  );

  it.each(['4111111111111112', '79927398710', '', '4111-1111', 'abc'])('rejects %s', (digits) => {
    expect(passesLuhn(digits)).toBe(false);
  });
});

describe('isValidCreditCardNumber', () => {
  it.each([
    ['Visa 16', '4111111111111111'],
    ['Visa 13', '4222222222222'],
    ['Mastercard 5x', '5555555555554444'],
    ['Mastercard 2-series', '2223003122003222'],
    ['Amex', '378282246310005'],
    ['Discover', '6011111111111117'],
    ['Diners', '30569309025904'],
    ['JCB', '3530111333300000'],
    ['UnionPay', '6200000000000005'],
    ['spaces', '4111 1111 1111 1111'],
    ['hyphens', '4111-1111-1111-1111'],
    ['unicode hyphens', '4111\u20111111\u20111111\u20111111'],
  ])('accepts %s', (_label, value) => {
    expect(isValidCreditCardNumber(value)).toBe(true);
  });

  it.each([
    ['bad checksum', '4111111111111112'],
    ['too short', '411111111111'],
    ['too long', '41111111111111111111'],
    ['unknown network (Luhn-valid)', '9999999999999995'],
    ['all zeros', '0000000000000000'],
    ['visa with wrong length', '411111111111111'],
    ['letters', '4111a11111111111'],
  ])('rejects %s', (_label, value) => {
    expect(isValidCreditCardNumber(value)).toBe(false);
  });

  it('checks network prefix and length together', () => {
    expect(matchesKnownCardNetwork('378282246310005')).toBe(true);
    expect(matchesKnownCardNetwork('3782822463100050')).toBe(false);
  });
});

describe('isValidSsn', () => {
  it.each(['123-45-6789', '123 45 6789', '123456789', '899-99-9999', '001-01-0001'])(
    'accepts %s',
    (value) => {
      expect(isValidSsn(value)).toBe(true);
    },
  );

  it.each([
    ['area 000', '000-12-3456'],
    ['area 666', '666-12-3456'],
    ['area 9xx', '900-12-3456'],
    ['group 00', '123-00-4567'],
    ['serial 0000', '123-45-0000'],
    ['too few digits', '123-45-678'],
    ['too many digits', '123-45-67890'],
  ])('rejects %s', (_label, value) => {
    expect(isValidSsn(value)).toBe(false);
  });
});

describe('isValidIPv4', () => {
  it.each(['0.0.0.0', '192.168.1.1', '255.255.255.255', '10.0.0.1', '8.8.8.8'])(
    'accepts %s',
    (value) => {
      expect(isValidIPv4(value)).toBe(true);
    },
  );

  it.each(['256.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.0004', '1.2.3.a', '1..3.4', ''])(
    'rejects %s',
    (value) => {
      expect(isValidIPv4(value)).toBe(false);
    },
  );
});

describe('phone validators', () => {
  it.each([
    '555-123-4567',
    '(555) 123-4567',
    '+1 555 123 4567',
    '1-555-123-4567',
    '555-123-4567 ext. 123456',
    '555-123-4567x9',
  ])(
    'NANP accepts %s',
    (value) => {
      expect(isValidNanpPhone(value)).toBe(true);
    },
  );

  it.each(['555-123-456', '2-555-123-4567', '55-5123-45678901'])('NANP rejects %s', (value) => {
    expect(isValidNanpPhone(value)).toBe(false);
  });

  it.each(['+44 20 7946 0958', '+91 98765 43210', '+14155552671', '+500 12345'])(
    'international accepts %s',
    (value) => {
      expect(isValidInternationalPhone(value)).toBe(true);
    },
  );

  it.each(['44 20 7946 0958', '+1234567', '+1234567890123456', '+0 20 7946 0958', '+1234567 x89'])(
    'international rejects %s',
    (value) => {
      expect(isValidInternationalPhone(value)).toBe(false);
    },
  );
});

describe('isValidEmail', () => {
  it.each(['a@b.co', 'john.doe+tag@sub.example.com', 'josé@münchen.de', 'x@xn--80ak6aa92e.com'])(
    'accepts %s',
    (value) => {
      expect(isValidEmail(value)).toBe(true);
    },
  );

  it.each([
    ['no at', 'john.example.com'],
    ['empty local', '@example.com'],
    ['empty domain', 'john@'],
    ['single label', 'john@localhost'],
    ['numeric tld', 'john@example.123'],
    ['leading dot', '.john@example.com'],
    ['double dot', 'jo..hn@example.com'],
    ['hyphen label', 'john@-example.com'],
    ['empty label', 'john@example..com'],
    ['local too long', `${'a'.repeat(65)}@example.com`],
    ['address too long', `a@${'b'.repeat(250)}.com`],
    ['label too long', `a@${'b'.repeat(64)}.com`],
  ])('rejects %s', (_label, value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});

describe('date validation', () => {
  it('knows leap years and month lengths', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2024, 4)).toBe(30);
    expect(daysInMonth(2024, 12)).toBe(31);
  });

  it('validates calendar dates', () => {
    expect(isValidCalendarDate({ year: 2024, month: 2, day: 29 })).toBe(true);
    expect(isValidCalendarDate({ year: 2023, month: 2, day: 29 })).toBe(false);
    expect(isValidCalendarDate({ year: 2023, month: 13, day: 1 })).toBe(false);
    expect(isValidCalendarDate({ year: 2023, month: 0, day: 1 })).toBe(false);
    expect(isValidCalendarDate({ year: 2023, month: 4, day: 31 })).toBe(false);
  });

  it('parses supported formats', () => {
    expect(parseDateCandidates('1990-01-15')).toEqual([{ year: 1990, month: 1, day: 15 }]);
    expect(parseDateCandidates('03/04/1990')).toEqual([
      { year: 1990, month: 3, day: 4 },
      { year: 1990, month: 4, day: 3 },
    ]);
    expect(parseDateCandidates('01/02/85')).toEqual(
      expect.arrayContaining([
        { year: 1985, month: 1, day: 2 },
        { year: 2085, month: 1, day: 2 },
      ]),
    );
    expect(parseDateCandidates('January 15th, 1990')).toEqual([{ year: 1990, month: 1, day: 15 }]);
    expect(parseDateCandidates('Sept. 5 1985')).toEqual([{ year: 1985, month: 9, day: 5 }]);
    expect(parseDateCandidates('15th of March, 1990')).toEqual([{ year: 1990, month: 3, day: 15 }]);
    expect(parseDateCandidates('15-Jan-1990')).toEqual([{ year: 1990, month: 1, day: 15 }]);
  });

  it('returns no candidates for unknown formats or month names', () => {
    expect(parseDateCandidates('yesterday')).toEqual([]);
    expect(parseDateCandidates('Foo 15, 1990')).toEqual([]);
    expect(parseDateCandidates('15 Foo 1990')).toEqual([]);
  });

  it.each(['01/15/1990', '15/01/1990', '2000-02-29', 'March 5, 1985', '01/02/85', '2026-10-26'])(
    'accepts plausible DOB %s',
    (value) => {
      expect(isPlausibleDateOfBirth(value, NOW)).toBe(true);
    },
  );

  it.each([
    ['impossible day', '02/30/1990'],
    ['13th month both ways', '13/13/1990'],
    ['non-leap Feb 29', '2023-02-29'],
    ['future date', '2026-10-27'],
    ['far future', '01/01/2099'],
    ['before 1900', '1899-12-31'],
    ['unparseable', 'soon'],
  ])('rejects %s', (_label, value) => {
    expect(isPlausibleDateOfBirth(value, NOW)).toBe(false);
  });

  it('defaults "now" to the current date', () => {
    expect(isPlausibleDateOfBirth('1990-01-01')).toBe(true);
    expect(isPlausibleDateOfBirth('2999-01-01')).toBe(false);
  });
});
