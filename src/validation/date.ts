export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export const MIN_BIRTH_YEAR = 1900;

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const SEP = String.raw`[\/.\-\u2010-\u2013\u2212]`;
const GAP = String.raw`(?:[\s,]+|\s*[\-\u2010-\u2013\u2212]\s*)`;
const ORDINAL = '(?:st|nd|rd|th)?';

const ISO_RE = new RegExp(String.raw`^(\d{4})${SEP}(\d{1,2})${SEP}(\d{1,2})$`, 'u');
const NUMERIC_RE = new RegExp(String.raw`^(\d{1,2})${SEP}(\d{1,2})${SEP}(\d{2}|\d{4})$`, 'u');
const MONTH_FIRST_RE = new RegExp(
  String.raw`^(\p{L}+)\.?${GAP}(\d{1,2})${ORDINAL}${GAP}(\d{4})$`,
  'u',
);
const DAY_FIRST_RE = new RegExp(
  String.raw`^(\d{1,2})${ORDINAL}${GAP}(?:of\s+)?(\p{L}+)\.?${GAP}(\d{4})$`,
  'u',
);

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidCalendarDate({ year, month, day }: DateParts): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function expandYear(raw: string): number[] {
  const value = Number(raw);
  return raw.length === 2 ? [2000 + value, 1900 + value] : [value];
}

/**
 * Returns every plausible reading of a date string. Ambiguous numeric dates such as
 * 03/04/1990 yield both month-first and day-first interpretations; two-digit years yield
 * both 19xx and 20xx. Returns an empty array for unrecognised formats.
 */
export function parseDateCandidates(value: string): DateParts[] {
  const text = value.trim().toLowerCase();

  const iso = ISO_RE.exec(text);
  if (iso) {
    return [{ year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }];
  }

  const numeric = NUMERIC_RE.exec(text);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    return expandYear(numeric[3] ?? '').flatMap((year) => [
      { year, month: first, day: second },
      { year, month: second, day: first },
    ]);
  }

  const monthFirst = MONTH_FIRST_RE.exec(text);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1] ?? ''];
    return month === undefined
      ? []
      : [{ year: Number(monthFirst[3]), month, day: Number(monthFirst[2]) }];
  }

  const dayFirst = DAY_FIRST_RE.exec(text);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2] ?? ''];
    return month === undefined
      ? []
      : [{ year: Number(dayFirst[3]), month, day: Number(dayFirst[1]) }];
  }

  return [];
}

function isOnOrBefore(date: DateParts, now: Date): boolean {
  const todayKey = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  return date.year * 10000 + date.month * 100 + date.day <= todayKey;
}

/** A date of birth must be a real calendar date between MIN_BIRTH_YEAR and today. */
export function isPlausibleDateOfBirth(value: string, now: Date = new Date()): boolean {
  return parseDateCandidates(value).some(
    (date) => isValidCalendarDate(date) && date.year >= MIN_BIRTH_YEAR && isOnOrBefore(date, now),
  );
}
