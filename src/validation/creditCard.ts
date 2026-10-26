/** Luhn (mod 10) checksum. Expects ASCII digits only. */
export function passesLuhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) {
    return false;
  }
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

interface CardNetwork {
  readonly name: string;
  /** Inclusive IIN prefix ranges; both bounds of a range have the same number of digits. */
  readonly prefixes: readonly (readonly [string, string])[];
  readonly lengths: readonly number[];
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Publicly documented IIN ranges for major networks. */
const CARD_NETWORKS: readonly CardNetwork[] = [
  { name: 'visa', prefixes: [['4', '4']], lengths: [13, 16, 19] },
  {
    name: 'mastercard',
    prefixes: [
      ['51', '55'],
      ['2221', '2720'],
    ],
    lengths: [16],
  },
  {
    name: 'amex',
    prefixes: [
      ['34', '34'],
      ['37', '37'],
    ],
    lengths: [15],
  },
  {
    name: 'discover',
    prefixes: [
      ['6011', '6011'],
      ['644', '649'],
      ['65', '65'],
      ['622126', '622925'],
    ],
    lengths: range(16, 19),
  },
  { name: 'jcb', prefixes: [['3528', '3589']], lengths: range(16, 19) },
  {
    name: 'diners',
    prefixes: [
      ['300', '305'],
      ['3095', '3095'],
      ['36', '36'],
      ['38', '39'],
    ],
    lengths: range(14, 19),
  },
  {
    name: 'unionpay',
    prefixes: [
      ['62', '62'],
      ['81', '81'],
    ],
    lengths: range(16, 19),
  },
  {
    name: 'maestro',
    prefixes: [
      ['5018', '5018'],
      ['5020', '5020'],
      ['5038', '5038'],
      ['5893', '5893'],
      ['6304', '6304'],
      ['6759', '6759'],
      ['6761', '6763'],
    ],
    lengths: range(13, 19),
  },
  { name: 'mir', prefixes: [['2200', '2204']], lengths: range(16, 19) },
];

export function matchesKnownCardNetwork(digits: string): boolean {
  return CARD_NETWORKS.some(
    (network) =>
      network.lengths.includes(digits.length) &&
      network.prefixes.some(([low, high]) => {
        const prefix = Number(digits.slice(0, low.length));
        return prefix >= Number(low) && prefix <= Number(high);
      }),
  );
}

/**
 * Validates a candidate card number that may contain space or hyphen separators.
 * Requires 13-19 digits, a known network prefix/length combination and a valid Luhn checksum.
 */
export function isValidCreditCardNumber(candidate: string): boolean {
  const digits = candidate.replace(/[\s\-\u2010-\u2013\u2212]/gu, '');
  if (!/^\d{13,19}$/.test(digits)) {
    return false;
  }
  if (/^(\d)\1+$/.test(digits)) {
    return false;
  }
  return matchesKnownCardNetwork(digits) && passesLuhn(digits);
}
