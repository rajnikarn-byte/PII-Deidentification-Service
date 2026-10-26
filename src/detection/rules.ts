import type { EntityType } from '../domain/entities.js';
import { isValidCreditCardNumber } from '../validation/creditCard.js';
import { isPlausibleDateOfBirth } from '../validation/date.js';
import { isValidEmail } from '../validation/email.js';
import { isValidIPv4 } from '../validation/ipv4.js';
import { isValidInternationalPhone, isValidNanpPhone } from '../validation/phone.js';
import { isValidSsn } from '../validation/ssn.js';
import {
  CONTEXT_GAP,
  HYPHEN,
  HYPHEN_CHARS,
  NUM_LEFT,
  NUM_RIGHT,
  SPACE,
  SPACED_LETTER,
  WORD_CHAR,
  WORD_LEFT,
  WORD_RIGHT,
  compile,
} from './patterns.js';

export interface ValidationContext {
  /** Reference "today", used to reject future dates of birth. */
  readonly now: Date;
}

export interface DetectionRule {
  readonly id: string;
  readonly entityType: EntityType;
  /**
   * Candidate generator. Must be compiled with the `g`, `d` and `u` flags.
   * If it defines a named group `value`, only that group is treated as the entity
   * (used for keyword-anchored rules such as "DOB: <date>").
   */
  readonly pattern: RegExp;
  readonly validate: (value: string, context: ValidationContext) => boolean;
}

/* ---------------------------------- EMAIL --------------------------------- */

/*
 * The alternatives below must stay mutually exclusive (ASCII letters are covered only by
 * SPACED_LETTER, ASCII digits only by \p{N}). Overlapping alternatives inside `+` cause
 * exponential backtracking - the ReDoS tests in tests/unit/performance.test.ts guard this.
 */
const EMAIL_LOCAL_CHAR = String.raw`(?:[_%+\-]|\p{N}|${SPACED_LETTER})`;
const DOMAIN_CHAR = String.raw`[\p{L}\p{M}\p{N}]`;
const DOMAIN_LABEL = String.raw`${DOMAIN_CHAR}(?:[\p{L}\p{M}\p{N}\-]{0,61}${DOMAIN_CHAR})?`;
const TLD = String.raw`(?:xn--[A-Za-z0-9\-]{1,59}|${SPACED_LETTER}{2,63})`;

const EMAIL = [
  String.raw`(?<!${EMAIL_LOCAL_CHAR}|\.)`,
  String.raw`${EMAIL_LOCAL_CHAR}+(?:\.${EMAIL_LOCAL_CHAR}+)*`,
  '@',
  String.raw`(?:${DOMAIN_LABEL}\.)+${TLD}`,
  String.raw`(?!${WORD_CHAR}|-|\.${DOMAIN_CHAR})`,
].join('');

/* ---------------------------------- PHONE --------------------------------- */

const PHONE_SEP = `(?:${SPACE}|[.${HYPHEN_CHARS}])`;

/**
 * Optional extension ("x89", " x89", " ext. 89", " #89"), redacted together with the number.
 * A bare "x" must touch its digits so "555-123-4567 x 3 apples" keeps "x 3".
 */
const PHONE_EXTENSION = String.raw`(?:${SPACE}{0,2}(?:[xX]|(?:[eE][xX][tT]\.?|#)${SPACE}{0,2})\d{1,6})?`;

/** (555) 123-4567, 555-123-4567, 555.123.4567, 555 123 4567, +1 555 123 4567, 1-555-123-4567 */
const PHONE_NANP = [
  NUM_LEFT,
  String.raw`(?<!\+)`,
  String.raw`(?:\+?1${PHONE_SEP}?)?`,
  String.raw`(?:\(\d{3}\)${PHONE_SEP}?|\d{3}${PHONE_SEP})`,
  String.raw`\d{3}${PHONE_SEP}\d{4}`,
  PHONE_EXTENSION,
  NUM_RIGHT,
].join('');

/**
 * +44 20 7946 0958, +91 98765 43210, +49 (0)30 123456, +14155552671.
 * Groups are separated by mandatory separators (or parentheses) so the digit
 * partitioning is unambiguous and backtracking stays linear.
 */
const PHONE_INTL_GROUP = String.raw`(?:${PHONE_SEP}?\(\d{1,4}\)${PHONE_SEP}?\d{1,6}|${PHONE_SEP}\d{1,6})`;
const PHONE_INTL = [
  NUM_LEFT,
  String.raw`\+[1-9]`,
  String.raw`(?:\d{0,3}${PHONE_INTL_GROUP}{1,6}|\d{7,14})`,
  PHONE_EXTENSION,
  NUM_RIGHT,
].join('');

/* ----------------------------------- SSN ---------------------------------- */

/** 123-45-6789 or 123 45 6789 (separator must be consistent). */
const SSN_FORMATTED = String.raw`${NUM_LEFT}\d{3}(?<ssnSep>${HYPHEN}|${SPACE})\d{2}\k<ssnSep>\d{4}${NUM_RIGHT}`;

/** Unformatted 9-digit SSNs are only accepted directly after an SSN keyword. */
const SSN_KEYWORD = String.raw`(?:ssns?|ss#|social${SPACE}+security(?:${SPACE}+(?:numbers?|nos?\.?|#))?)`;
const SSN_CONTEXTUAL = String.raw`${WORD_LEFT}${SSN_KEYWORD}${WORD_RIGHT}${CONTEXT_GAP}(?<value>\d{9})${NUM_RIGHT}`;

/* ------------------------------ DATE OF BIRTH ----------------------------- */

const KW_SEP = String.raw`[ \t\u00A0_${HYPHEN_CHARS}]`;
const DOB_KEYWORD = [
  String.raw`date${KW_SEP}*of${KW_SEP}*birth`,
  String.raw`birth${KW_SEP}*(?:date|day)`,
  String.raw`d\.?o\.?b\.?`,
  'born',
].join('|');

const MONTH_NAME =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORDINAL = '(?:st|nd|rd|th)?';
const DATE_GAP = String.raw`(?:${SPACE}{1,3}|${SPACE}{0,2}${HYPHEN}${SPACE}{0,2})`;
const DATE_SEP_CLASS = `[/.${HYPHEN_CHARS}]`;

const DATE_VALUE = [
  String.raw`\d{4}(?<isoSep>${DATE_SEP_CLASS})\d{1,2}\k<isoSep>\d{1,2}`,
  String.raw`\d{1,2}(?<numSep>${DATE_SEP_CLASS})\d{1,2}\k<numSep>(?:\d{4}|\d{2})`,
  String.raw`${MONTH_NAME}\.?${DATE_GAP}\d{1,2}${ORDINAL},?${DATE_GAP}\d{4}`,
  String.raw`\d{1,2}${ORDINAL}${DATE_GAP}(?:of${SPACE}+)?${MONTH_NAME}\.?,?${DATE_GAP}\d{4}`,
].join('|');

/**
 * Dates are only treated as dates of birth when anchored to a DOB keyword. Redacting every
 * date would destroy appointment dates, timestamps etc. that are not birth dates.
 */
const DATE_OF_BIRTH = String.raw`${WORD_LEFT}(?:${DOB_KEYWORD})(?!${WORD_CHAR})${CONTEXT_GAP}(?<value>${DATE_VALUE})${NUM_RIGHT}`;

/* ------------------------------- CREDIT CARD ------------------------------ */

/** Contiguous 13-19 digits, or 4-digit-led groups with one consistent separator (4-4-4-4, 4-6-5, ...). */
const CREDIT_CARD = [
  NUM_LEFT,
  String.raw`(?:\d{13,19}|\d{4}(?<ccSep>${SPACE}|${HYPHEN})\d{4,6}(?:\k<ccSep>\d{3,6}){1,3})`,
  NUM_RIGHT,
].join('');

/* -------------------------------- IP ADDRESS ------------------------------- */

const IPV4 = String.raw`(?<!${WORD_CHAR}|\.)(?:\d{1,3}\.){3}\d{1,3}(?!${WORD_CHAR}|\.${WORD_CHAR})`;

/* ---------------------------------- Rules --------------------------------- */

export const DEFAULT_RULES: readonly DetectionRule[] = Object.freeze([
  {
    id: 'email',
    entityType: 'EMAIL',
    pattern: compile(EMAIL),
    validate: (value) => isValidEmail(value),
  },
  {
    id: 'phone-nanp',
    entityType: 'PHONE',
    pattern: compile(PHONE_NANP),
    validate: (value) => isValidNanpPhone(value),
  },
  {
    id: 'phone-international',
    entityType: 'PHONE',
    pattern: compile(PHONE_INTL),
    validate: (value) => isValidInternationalPhone(value),
  },
  {
    id: 'ssn-formatted',
    entityType: 'SSN',
    pattern: compile(SSN_FORMATTED),
    validate: (value) => isValidSsn(value),
  },
  {
    id: 'ssn-contextual',
    entityType: 'SSN',
    pattern: compile(SSN_CONTEXTUAL, 'i'),
    validate: (value) => isValidSsn(value),
  },
  {
    id: 'date-of-birth',
    entityType: 'DATE_OF_BIRTH',
    pattern: compile(DATE_OF_BIRTH, 'i'),
    validate: (value, context) => isPlausibleDateOfBirth(value, context.now),
  },
  {
    id: 'credit-card',
    entityType: 'CREDIT_CARD',
    pattern: compile(CREDIT_CARD),
    validate: (value) => isValidCreditCardNumber(value),
  },
  {
    id: 'ipv4',
    entityType: 'IP_ADDRESS',
    pattern: compile(IPV4),
    validate: (value) => isValidIPv4(value),
  },
]);
