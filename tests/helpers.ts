import type { AppConfig } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import type { EntityType } from '../src/domain/entities.js';
import { createLogger, type Logger } from '../src/logging/logger.js';
import { deidentify } from '../src/service/deidentify.js';

/** Fixed reference date so date-of-birth tests do not depend on the wall clock. */
export const NOW = new Date('2026-10-26T12:00:00Z');

export function redact(text: string, entities?: readonly EntityType[]): string {
  return deidentify(text, entities ? { now: NOW, entities } : { now: NOW }).deidentifiedText;
}

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...DEFAULT_CONFIG, rateLimit: { windowMs: 60_000, max: 0 }, ...overrides };
}

export interface CapturingLogger {
  readonly logger: Logger;
  readonly lines: string[];
}

export function capturingLogger(): CapturingLogger {
  const lines: string[] = [];
  return { logger: createLogger({ level: 'debug', write: (line) => lines.push(line) }), lines };
}
