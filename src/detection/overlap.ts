import { ENTITY_PRIORITY, type EntitySpan } from '../domain/entities.js';

const length = (span: EntitySpan): number => span.end - span.start;
const priority = (span: EntitySpan): number => ENTITY_PRIORITY.indexOf(span.type);

/** Index of the first span in `sorted` (ordered by start) whose start is >= `start`. */
function lowerBound(sorted: readonly EntitySpan[], start: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((sorted[mid] as EntitySpan).start < start) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Selects a non-overlapping subset of candidates.
 *
 * Candidates are considered longest-first (the longest match is the most specific reading,
 * e.g. an e-mail address that contains a phone-like local part). Ties are broken by
 * ENTITY_PRIORITY and then by position. A candidate is accepted only if it does not overlap
 * any already accepted span. Exact duplicates produced by different rules collapse to one.
 *
 * @returns accepted spans ordered by start offset.
 */
export function resolveOverlaps(candidates: readonly EntitySpan[]): EntitySpan[] {
  const ranked = [...candidates].sort(
    (a, b) => length(b) - length(a) || priority(a) - priority(b) || a.start - b.start,
  );

  const accepted: EntitySpan[] = [];
  for (const candidate of ranked) {
    const index = lowerBound(accepted, candidate.start);
    const previous = accepted[index - 1];
    const next = accepted[index];
    const overlapsPrevious = previous !== undefined && previous.end > candidate.start;
    const overlapsNext = next !== undefined && next.start < candidate.end;
    if (!overlapsPrevious && !overlapsNext) {
      accepted.splice(index, 0, candidate);
    }
  }
  return accepted;
}
