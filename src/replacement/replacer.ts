import { PLACEHOLDERS, type EntitySpan, type EntityType } from '../domain/entities.js';

export type PlaceholderResolver = (type: EntityType) => string;

const defaultPlaceholder: PlaceholderResolver = (type) => PLACEHOLDERS[type];

/**
 * Replaces each span with its entity placeholder in a single pass. Text outside the spans,
 * including punctuation, Unicode and line breaks, is copied through unchanged.
 *
 * @param spans must be sorted by start and non-overlapping (as returned by `resolveOverlaps`).
 */
export function replaceSpans(
  text: string,
  spans: readonly EntitySpan[],
  placeholderFor: PlaceholderResolver = defaultPlaceholder,
): string {
  const parts: string[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start < cursor || span.end <= span.start || span.end > text.length) {
      throw new RangeError('Spans must be sorted, non-overlapping and within the text bounds');
    }
    parts.push(text.slice(cursor, span.start), placeholderFor(span.type));
    cursor = span.end;
  }
  parts.push(text.slice(cursor));

  return parts.join('');
}
