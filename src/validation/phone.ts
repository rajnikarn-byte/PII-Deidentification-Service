const EXTENSION_SUFFIX = /[\s\u202F]*(?:x|ext\.?|#)[\s\u202F]*\d{1,6}$/iu;

/** Digits of the subscriber number, ignoring any trailing extension. */
const digitsOf = (value: string): string => value.replace(EXTENSION_SUFFIX, '').replace(/\D/gu, '');

/**
 * North American Numbering Plan number: 10 digits, optionally preceded by country code 1.
 *
 * Area/exchange code rules (e.g. "must start with 2-9") are intentionally not enforced:
 * fictional and placeholder numbers such as 555-123-4567 are common in real text and
 * leaving them unredacted is the more harmful error for a de-identification service.
 */
export function isValidNanpPhone(candidate: string): boolean {
  const digits = digitsOf(candidate);
  if (digits.length === 11) {
    return digits.startsWith('1');
  }
  return digits.length === 10;
}

/** International number in "+<country code> ..." form; E.164 allows at most 15 digits. */
export function isValidInternationalPhone(candidate: string): boolean {
  if (!candidate.startsWith('+')) {
    return false;
  }
  const digits = digitsOf(candidate);
  return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0');
}
