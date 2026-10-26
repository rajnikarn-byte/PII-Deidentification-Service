import type { EntitySpan } from '../domain/entities.js';
import { DEFAULT_RULES, type DetectionRule, type ValidationContext } from './rules.js';

interface MatchSpan {
  readonly start: number;
  readonly end: number;
}

function spanOf(match: RegExpExecArray): MatchSpan {
  const valueIndices = match.indices?.groups?.['value'];
  if (valueIndices) {
    return { start: valueIndices[0], end: valueIndices[1] };
  }
  return { start: match.index, end: match.index + match[0].length };
}

/** Next code-point boundary after `index`, so `lastIndex` never lands inside a surrogate pair. */
function nextCodePointIndex(text: string, index: number): number {
  const code = text.charCodeAt(index);
  return code >= 0xd800 && code <= 0xdbff && index + 1 < text.length ? index + 2 : index + 1;
}

/**
 * Runs every rule over the text and returns all validated candidates. Candidates from
 * different rules may overlap; use `resolveOverlaps` to obtain a consistent set.
 *
 * When a regex match fails validation, scanning resumes one code point after the match start
 * rather than after the match end, so a valid candidate overlapping an invalid one is not lost.
 */
export function detectCandidates(
  text: string,
  rules: readonly DetectionRule[] = DEFAULT_RULES,
  context: ValidationContext = { now: new Date() },
): EntitySpan[] {
  const candidates: EntitySpan[] = [];

  for (const rule of rules) {
    // Fresh instance per call: global regexes carry `lastIndex` state.
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const { start, end } = spanOf(match);
      const isValid = end > start && rule.validate(text.slice(start, end), context);

      if (isValid) {
        candidates.push({ type: rule.entityType, start, end });
      }
      const matchEnd = match.index + match[0].length;
      pattern.lastIndex =
        isValid && matchEnd > match.index ? matchEnd : nextCodePointIndex(text, match.index);
    }
  }

  return candidates;
}
