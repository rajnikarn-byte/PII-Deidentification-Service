/*
 * Reusable regex source fragments. All rules are compiled with the `u` flag, so
 * `\p{...}` property escapes are available.
 *
 * Boundary model: a match must not start or end in the middle of a "word". JavaScript's
 * `\b` is ASCII-only, so we define word characters ourselves. Letters from scripts that
 * do not separate words with spaces (CJK, Thai, ...) are deliberately NOT word characters,
 * so "电话555-123-4567" still matches while "ID555-123-4567" does not.
 */

const NON_SPACED_SCRIPTS = ['Han', 'Hiragana', 'Katakana', 'Hangul', 'Thai', 'Lao', 'Khmer', 'Myanmar']
  .map((script) => String.raw`\p{Script=${script}}`)
  .join('');

/** A letter or combining mark from a space-delimited script (Latin, Cyrillic, Greek, ...). */
export const SPACED_LETTER = String.raw`(?:(?![${NON_SPACED_SCRIPTS}])[\p{L}\p{M}])`;

export const WORD_CHAR = String.raw`(?:[\p{N}_]|${SPACED_LETTER})`;

/** ASCII hyphen plus Unicode hyphen, non-breaking hyphen, figure dash, en dash and minus sign. */
export const HYPHEN_CHARS = String.raw`\-\u2010\u2011\u2012\u2013\u2212`;
export const HYPHEN = `[${HYPHEN_CHARS}]`;

/** Space, no-break space and narrow no-break space. Line breaks and tabs are never separators. */
export const SPACE_CHARS = String.raw` \u00A0\u202F`;
export const SPACE = `[${SPACE_CHARS}]`;

/** Characters that glue digit groups into a single larger token (e.g. "1.2.3.4.5", "12-34-56"). */
const NUMERIC_JOINER = `[./${HYPHEN_CHARS}]`;

/** Start guard for numeric entities: not inside a word and not continuing a digit group. */
export const NUM_LEFT = String.raw`(?<!${WORD_CHAR}|\p{N}${NUMERIC_JOINER})`;

/** End guard for numeric entities: not inside a word and not followed by another digit group. */
export const NUM_RIGHT = String.raw`(?!${WORD_CHAR}|${NUMERIC_JOINER}\p{N})`;

/** Start/end guards for keyword matches. */
export const WORD_LEFT = `(?<!${WORD_CHAR})`;
export const WORD_RIGHT = `(?!${WORD_CHAR})`;

/**
 * Text allowed between a context keyword (e.g. "DOB") and its value, such as ": ", " is ",
 * " (MM/DD/YYYY): ". Digits, line breaks and sentence terminators end the context window.
 */
export const CONTEXT_GAP = String.raw`(?:[^\d\r\n.!?;]|\.(?!\s)){0,30}?`;

export function compile(source: string, extraFlags = ''): RegExp {
  return new RegExp(source, `gdu${extraFlags}`);
}
