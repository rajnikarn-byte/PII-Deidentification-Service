export const ENTITY_TYPES = [
  'EMAIL',
  'PHONE',
  'SSN',
  'DATE_OF_BIRTH',
  'CREDIT_CARD',
  'IP_ADDRESS',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const PLACEHOLDERS: Readonly<Record<EntityType, string>> = Object.freeze({
  EMAIL: '[EMAIL]',
  PHONE: '[PHONE]',
  SSN: '[SSN]',
  DATE_OF_BIRTH: '[DATE_OF_BIRTH]',
  CREDIT_CARD: '[CREDIT_CARD]',
  IP_ADDRESS: '[IP_ADDRESS]',
});

/**
 * Tie-breaker used when two overlapping candidates have the same length.
 * Lower index wins. More structurally specific entities come first.
 */
export const ENTITY_PRIORITY: readonly EntityType[] = [
  'EMAIL',
  'CREDIT_CARD',
  'SSN',
  'DATE_OF_BIRTH',
  'PHONE',
  'IP_ADDRESS',
];

const ENTITY_TYPE_SET: ReadonlySet<string> = new Set(ENTITY_TYPES);

export function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && ENTITY_TYPE_SET.has(value);
}

/** A detected entity. `start` is inclusive and `end` exclusive (UTF-16 code unit offsets). */
export interface EntitySpan {
  readonly type: EntityType;
  readonly start: number;
  readonly end: number;
}

export type EntityCounts = Partial<Record<EntityType, number>>;
