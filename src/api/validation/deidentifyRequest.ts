import { ENTITY_TYPES, isEntityType, type EntityType } from '../../domain/entities.js';
import type { ErrorDetail } from '../errors.js';

export interface DeidentifyRequest {
  readonly text: string;
  readonly entities?: readonly EntityType[];
}

export type ValidationResult =
  | { readonly ok: true; readonly value: DeidentifyRequest }
  | { readonly ok: false; readonly issues: readonly ErrorDetail[] };

export interface RequestLimits {
  readonly maxTextLength: number;
}

const ALLOWED_FIELDS: ReadonlySet<string> = new Set(['text', 'entities']);
const MAX_REPORTED_ISSUES = 10;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the POST /deidentify body. Messages never echo submitted values, since those
 * may themselves contain PII.
 */
export function validateDeidentifyRequest(body: unknown, limits: RequestLimits): ValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const issues: ErrorDetail[] = [];

  const unknownFields = Object.keys(body).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknownFields.length > 0) {
    issues.push({
      field: 'body',
      message: `Unknown field(s); allowed fields are: ${[...ALLOWED_FIELDS].join(', ')}`,
    });
  }

  const { text, entities } = body;
  if (text === undefined) {
    issues.push({ field: 'text', message: 'text is required' });
  } else if (typeof text !== 'string') {
    issues.push({ field: 'text', message: 'text must be a string' });
  } else if (text.length > limits.maxTextLength) {
    issues.push({
      field: 'text',
      message: `text must be at most ${limits.maxTextLength} characters`,
    });
  }

  let selected: EntityType[] | undefined;
  if (entities !== undefined) {
    if (!Array.isArray(entities)) {
      issues.push({ field: 'entities', message: 'entities must be an array of entity types' });
    } else if (entities.length === 0) {
      issues.push({ field: 'entities', message: 'entities must contain at least one entity type' });
    } else {
      const invalid = entities
        .map((entity: unknown, index) => ({ entity, index }))
        .filter(({ entity }) => !isEntityType(entity));
      for (const { index } of invalid.slice(0, MAX_REPORTED_ISSUES)) {
        issues.push({
          field: `entities[${index}]`,
          message: `Unsupported entity type; allowed values are: ${ENTITY_TYPES.join(', ')}`,
        });
      }
      if (invalid.length === 0) {
        const unique = new Set(entities as EntityType[]);
        selected = ENTITY_TYPES.filter((type) => unique.has(type));
      }
    }
  }

  if (issues.length > 0 || typeof text !== 'string') {
    return { ok: false, issues };
  }
  return { ok: true, value: selected ? { text, entities: selected } : { text } };
}
