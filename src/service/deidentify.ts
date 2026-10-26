import { ENTITY_TYPES, type EntityCounts, type EntityType } from '../domain/entities.js';
import { detectCandidates } from '../detection/detector.js';
import { resolveOverlaps } from '../detection/overlap.js';
import { DEFAULT_RULES, type DetectionRule } from '../detection/rules.js';
import { replaceSpans } from '../replacement/replacer.js';

export interface DeidentifyOptions {
  /** Entity types to redact. Defaults to all supported types. */
  readonly entities?: readonly EntityType[];
  /** Reference date for date-of-birth plausibility checks. Defaults to the current time. */
  readonly now?: Date;
  readonly rules?: readonly DetectionRule[];
}

export interface DeidentifyResult {
  readonly deidentifiedText: string;
  /** One entry per selected entity type (zero when nothing was found), in canonical order. */
  readonly entityCounts: EntityCounts;
  readonly totalEntities: number;
}

/**
 * Detects, validates and replaces PII in `text`.
 *
 * Overlaps are resolved across all entity types before applying the selection, so an
 * unselected entity still "owns" its text. For example, with only PHONE selected, the
 * phone-like local part of "555-123-4567@example.com" is not redacted as a phone because
 * the whole token is an e-mail address.
 */
export function deidentify(text: string, options: DeidentifyOptions = {}): DeidentifyResult {
  const selected = new Set<EntityType>(options.entities ?? ENTITY_TYPES);
  const candidates = detectCandidates(text, options.rules ?? DEFAULT_RULES, {
    now: options.now ?? new Date(),
  });
  const spans = resolveOverlaps(candidates).filter((span) => selected.has(span.type));

  const entityCounts: EntityCounts = {};
  for (const type of ENTITY_TYPES) {
    if (selected.has(type)) {
      entityCounts[type] = 0;
    }
  }
  for (const span of spans) {
    entityCounts[span.type] = (entityCounts[span.type] ?? 0) + 1;
  }

  return {
    deidentifiedText: replaceSpans(text, spans),
    entityCounts,
    totalEntities: spans.length,
  };
}
