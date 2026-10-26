# PII De-identification Service

A rule-based text de-identification HTTP service built with Node.js, TypeScript and Express.
It finds personally identifiable information (PII) in free text with hand-written regular
expressions plus structural validation, and replaces each match with an entity placeholder.

All processing is local and deterministic. The service makes no external API calls and uses
no third-party PII-detection libraries or ML models.

```text
In : Jane (DOB 03/14/1985) jane@example.com, +1 (555) 123-4567, SSN 123-45-6789, card 4111-1111-1111-1111, ip 203.0.113.9
Out: Jane (DOB [DATE_OF_BIRTH]) [EMAIL], [PHONE], SSN [SSN], card [CREDIT_CARD], ip [IP_ADDRESS]
```

## Contents

- [Supported entities](#supported-entities)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API](#api)
- [How detection works](#how-detection-works)
- [Detection rules in detail](#detection-rules-in-detail)
- [Design decisions](#design-decisions)
- [Security measures](#security-measures)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Limitations](#limitations)

## Supported entities

| Entity          | Placeholder       | Example input                             |
| --------------- | ----------------- | ----------------------------------------- |
| `EMAIL`         | `[EMAIL]`         | `jane.doe+news@mail.example.co.uk`        |
| `PHONE`         | `[PHONE]`         | `(555) 123-4567`, `+44 20 7946 0958`      |
| `SSN`           | `[SSN]`           | `123-45-6789`, `SSN: 123456789`           |
| `DATE_OF_BIRTH` | `[DATE_OF_BIRTH]` | `DOB: 01/15/1990`, `born on 5 March 1985` |
| `CREDIT_CARD`   | `[CREDIT_CARD]`   | `4111 1111 1111 1111`                     |
| `IP_ADDRESS`    | `[IP_ADDRESS]`    | `192.168.1.1` (IPv4 only)                 |

## Quick start

Requirements: Node.js **20.11+** (22 LTS or 24 recommended; Node 20 reached end-of-life in
April 2026) and a recent npm 10 (see [development notes](#development-notes)).

```bash
npm ci                 # install exact locked dependencies
npm run dev            # run from source with auto-reload (tsx) on http://localhost:3000
```

Production build:

```bash
npm run build          # compile TypeScript to dist/
npm start              # node dist/server.js
# or, with a .env file (see .env.example):
npm run start:env
```

Try it:

```bash
curl -s -X POST http://localhost:3000/deidentify \
  -H 'Content-Type: application/json' \
  -d '{"text":"Email jane@example.com or call 555-123-4567"}'
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/deidentify `
  -ContentType 'application/json' `
  -Body '{"text":"Email jane@example.com or call 555-123-4567"}'
```

### All scripts

| Script                  | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | Run `src/server.ts` with reload                            |
| `npm run build`         | Compile to `dist/` (`tsconfig.build.json`)                 |
| `npm start`             | Run the compiled server                                    |
| `npm run start:env`     | Run the compiled server with `--env-file=.env`             |
| `npm run lint`          | ESLint (`typescript-eslint` strict, type-checked rules)    |
| `npm run typecheck`     | `tsc --noEmit` over sources and tests                      |
| `npm test`              | Run all tests once                                         |
| `npm run test:coverage` | Tests plus coverage thresholds (90% lines, 85% branches)   |
| `npm run check`         | lint, then typecheck, then coverage tests, then build      |

## Configuration

Everything is configured through environment variables. All of them are optional. Invalid
values make the process exit at startup with a clear error rather than fall back silently.

| Variable               | Default   | Description                                                                         |
| ---------------------- | --------- | ----------------------------------------------------------------------------------- |
| `PORT`                 | `3000`    | Listen port                                                                         |
| `HOST`                 | `0.0.0.0` | Listen address                                                                      |
| `BODY_LIMIT`           | `256kb`   | Max JSON body size (`<n>b`, `<n>kb`, `<n>mb`; max 10mb). Measured after decompression |
| `MAX_TEXT_LENGTH`      | `100000`  | Max length of `text` in UTF-16 code units (JavaScript `string.length`)              |

Both limits apply, and whichever is reached first wins. With the defaults, 100,000 ASCII
characters fit within 256 KB, but non-ASCII text (up to 3 bytes per character in UTF-8, or 6
when JSON-escaped) usually hits `BODY_LIMIT` first and gets a 413. Raise both together if you
need longer texts.
| `RATE_LIMIT_WINDOW_MS` | `60000`   | Rate-limit window                                                                   |
| `RATE_LIMIT_MAX`       | `120`     | Requests per window per client IP on `POST /deidentify`; `0` disables              |
| `TRUST_PROXY`          | `false`   | Express `trust proxy` (`true`, hop count, or subnet list). Only set this behind a proxy you control |
| `LOG_LEVEL`            | `info`    | `debug`, `info`, `warn`, `error`, `silent`                                          |

## API

### `POST /deidentify`

Request headers: `Content-Type: application/json` (UTF-8). A compressed body
(`Content-Encoding: gzip`, `deflate` or `br`, plus `zstd` on Node versions whose zlib
supports it) is accepted, and `BODY_LIMIT` applies to the decompressed size. Any other
encoding gets a 415.

| Field      | Type       | Required | Description                                                                          |
| ---------- | ---------- | -------- | ------------------------------------------------------------------------------------ |
| `text`     | `string`   | yes      | Text to de-identify. An empty string is allowed.                                     |
| `entities` | `string[]` | no       | Entity types to redact. Defaults to all. Must be non-empty, values are case-sensitive and duplicates are ignored. |

Unknown top-level fields are rejected, so typos such as `entity` don't silently fall back to
the defaults.

**Response `200`**

```json
{
  "deidentifiedText": "Email [EMAIL] or call [PHONE]",
  "entityCounts": {
    "EMAIL": 1,
    "PHONE": 1,
    "SSN": 0,
    "DATE_OF_BIRTH": 0,
    "CREDIT_CARD": 0,
    "IP_ADDRESS": 0
  },
  "totalEntities": 2
}
```

`entityCounts` contains one key for every **selected** entity type, including those with a
count of zero, in the canonical order above. The response never includes the original values
or their offsets.

**Entity selection example**

```bash
curl -s -X POST http://localhost:3000/deidentify \
  -H 'Content-Type: application/json' \
  -d '{"text":"a@b.co and c@d.io from 10.0.0.1","entities":["EMAIL"]}'
```

```json
{
  "deidentifiedText": "[EMAIL] and [EMAIL] from 10.0.0.1",
  "entityCounts": { "EMAIL": 2 },
  "totalEntities": 2
}
```

### `GET /health`

Returns `200 {"status":"ok"}`. This endpoint isn't rate-limited.

### Error format

Every error uses the same shape. `requestId` matches the `X-Request-Id` response header.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "17269bdd-0fc2-4bdb-8143-e7697c00b823",
    "details": [
      {
        "field": "entities[0]",
        "message": "Unsupported entity type; allowed values are: EMAIL, PHONE, SSN, DATE_OF_BIRTH, CREDIT_CARD, IP_ADDRESS"
      }
    ]
  }
}
```

| Status | `code`                   | When                                                                                     |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`       | Body isn't an object, `text` is missing or not a string or too long, `entities` is invalid, or there are unknown fields |
| 400    | `MALFORMED_JSON`         | Body isn't valid JSON, or is a top-level JSON primitive                                  |
| 400    | `BAD_REQUEST`            | Other unreadable bodies (e.g. corrupt gzip)                                              |
| 404    | `NOT_FOUND`              | Unknown route                                                                            |
| 405    | `METHOD_NOT_ALLOWED`     | Wrong method (an `Allow` header is set)                                                  |
| 413    | `PAYLOAD_TOO_LARGE`      | Body exceeds `BODY_LIMIT`                                                                |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | Content-Type isn't JSON, or the charset or Content-Encoding is unsupported               |
| 429    | `RATE_LIMITED`           | Rate limit exceeded (`RateLimit`, `RateLimit-Policy` and `Retry-After` headers are set)  |
| 500    | `INTERNAL_ERROR`         | Unexpected failure. The response is generic and never includes the error details        |

Error messages never echo submitted values. Body-parser messages, which can quote the raw
body, are replaced with fixed text.

## How detection works

```text
text ──► detectCandidates ──► resolveOverlaps ──► filter(selected) ──► replaceSpans ──► result
          (regex rules +       (longest wins,                            (single pass,
           validators)          then priority)                            placeholders)
```

1. **Detect.** Each rule in `src/detection/rules.ts` is a regex that generates candidates and
   has a paired validator (`src/validation/*`). A regex match only becomes a candidate if its
   validator accepts it. When validation fails, scanning resumes one code point after the
   match start rather than at the match end, so an overlapping valid candidate isn't lost.
2. **Resolve overlaps.** Candidates from all rules are ranked longest first, then by entity
   priority (`EMAIL > CREDIT_CARD > SSN > DATE_OF_BIRTH > PHONE > IP_ADDRESS`), then by
   position. Each one is accepted only if it doesn't overlap an already accepted span.
   Duplicates from different rules (e.g. `+1 555 123 4567` matched by both phone rules)
   collapse into one.
3. **Filter.** The requested `entities` selection is applied *after* overlap resolution. See
   [design decisions](#design-decisions).
4. **Replace.** The text is rebuilt in a single pass. Everything outside the spans, including
   punctuation, emoji, combining marks, `\r\n` and tabs, is copied through byte for byte.
   Placeholders are never re-scanned, so the operation is idempotent.

### Project structure

```text
src/
  domain/entities.ts          entity types, placeholders, priority
  detection/patterns.ts       shared Unicode-aware boundary fragments
  detection/rules.ts          regex rules (one per format) paired with validators
  detection/detector.ts       runs rules, applies validators, collects candidates
  detection/overlap.ts        non-overlapping span selection
  validation/*.ts             pure validators: Luhn/IIN, SSA rules, calendar, octets, E.164, RFC lengths
  replacement/replacer.ts     span-to-placeholder replacement
  service/deidentify.ts       orchestration and entity counts (no HTTP concerns)
  api/                        Express app, routes, request validation, errors, middleware
  logging/logger.ts           JSON-lines logger with primitive-only fields
  config.ts                   strict environment parsing
  server.ts                   process entry: listen, timeouts, graceful shutdown
tests/
  unit/                       validators, detection, overlap/replacement, service, config/logging, ReDoS
  api/                        HTTP-level tests with supertest
```

Detection, validation, replacement and the API are separate layers. Validators have no
knowledge of regexes, the service has no knowledge of HTTP, and the API layer only validates
input and shapes output.

## Detection rules in detail

**Boundaries.** JavaScript's `\b` is ASCII-only, so the rules use custom look-arounds. A match
can't start or end inside a word, so `ID555-123-4567` doesn't match. It also can't continue a
longer digit group, so `1.2.3.4.5` and `555-123-4567-89` don't match. Letters from scripts
written without spaces (Han, Hiragana, Katakana, Hangul, Thai, Lao, Khmer, Myanmar) are *not*
treated as word characters, so `电话555-123-4567` and `邮箱john@example.com谢谢` are still
detected. Separators never include line breaks, so entities can't span lines.

| Entity | Detected | Validation | Deliberately not detected |
| --- | --- | --- | --- |
| EMAIL | `local@domain.tld`. The local part allows letters (including non-ASCII Latin, Cyrillic etc.), digits and `. _ % + -`. IDN domains like `münchen.de` and `xn--` TLDs are supported | ≤254 chars total, local part ≤64, labels 1–63 chars with no leading or trailing `-`, TLD not numeric | `user@localhost`, single-letter TLDs, quoted local parts, IP-literal domains, rarely used RFC 5322 characters (`! # $ & ' * / = ? ^ { } \| ~`) |
| PHONE | NANP `555-123-4567`, `(555) 123-4567`, `555.123.4567`, `555 123 4567`, optional `+1`/`1` prefix. International `+CC …` with space, dot, hyphen or `(0)` grouping, or contiguous E.164. Extensions (`x89`, ` ext. 89`, ` #89`) are included in the match. Unicode dashes and no-break spaces count as separators | NANP: 10 digits, or 11 starting with `1`. International: 8–15 digits (E.164), country code not starting with 0 | Bare 10-digit runs (`5551234567`), 7-digit local numbers, national formats without `+` (`020 7946 0958`) |
| SSN | `123-45-6789`, `123 45 6789` (consistent separator). Bare `123456789` only right after an SSN keyword (`SSN`, `SS#`, `Social Security Number`) | SSA structural rules: area ≠ 000, 666, 900–999; group ≠ 00; serial ≠ 0000 | Bare 9-digit numbers without a keyword, mixed separators |
| DATE_OF_BIRTH | A date within 30 characters after a DOB keyword (`DOB`, `D.O.B.`, `date of birth`, `birth date`, `birthdate`, `birthday`, `born`). Formats: `MM/DD/YYYY`, `DD/MM/YYYY`, `MM-DD-YY`, `YYYY-MM-DD`, `YYYY/MM/DD`, dotted variants, `January 15th, 1990`, `Jan. 15 1990`, `15 March 1990`, `15th of March, 1990`, `15-Jan-1990`. Only the date is replaced; the keyword stays | Real calendar date (leap years included) under either the month-first or day-first reading, year ≥ 1900, not in the future | Dates without a DOB keyword (appointments, timestamps), and context windows broken by a digit, a line break or a sentence end (`. ! ? ;`) |
| CREDIT_CARD | 13–19 contiguous digits, or groups led by 4 digits with one consistent space or hyphen separator (`4-4-4-4`, `4-6-5`, `4-6-4`, `4-4-4-4-3`) | Luhn checksum **and** a known IIN prefix/length (Visa, Mastercard incl. 2-series, Amex, Discover, JCB, Diners, UnionPay, Maestro, Mir). Rejects repeated single digits | Luhn-valid numbers with unknown prefixes, mixed separators, numbers inside longer digit runs |
| IP_ADDRESS | Dotted-quad IPv4, including `ip:port` and CIDR (only the address is replaced) | 4 octets 0–255, no leading zeros (ambiguous octal) | IPv6, addresses followed by `.<digit>` or `.<letter>` (versions or hostnames), `v1.2.3.4` |

## Design decisions

- **Regex finds candidates; validators decide.** Regexes stay readable and only express
  shape. Semantic checks (Luhn, calendar math, octet range, SSA rules) live in pure functions
  that can be unit-tested on their own.
- **Precision-leaning rules, with recall where a miss is costly.** Ambiguous shapes need
  context or structure: a bare 9-digit number needs an SSN keyword, and a date needs a DOB
  keyword. Conversely, NANP area and exchange code rules (such as "must start with 2–9") are
  **not** enforced. Placeholder numbers like `555-123-4567` and `123-456-7890` appear in real
  text, and leaving a phone number unredacted is the worse error.
- **DOB requires context.** Redacting every date would destroy clinically or operationally
  useful dates. Only dates anchored to a birth keyword count as `DATE_OF_BIRTH`.
- **Longest match wins overlaps.** The longest reading is the most specific one. For example,
  `555-123-4567@example.com` is an email, not a phone number followed by junk.
- **Selection is applied after overlap resolution.** With `entities: ["PHONE"]`, the
  phone-shaped local part of `555-123-4567@example.com` is left alone, because that text
  belongs to an email that the caller chose not to redact. Labelling part of it `[PHONE]`
  would be a misclassification.
- **Per-call regex instances.** Global regexes carry `lastIndex` state, so the detector clones
  each rule's regex on every call. This makes detection safe to reuse and re-enter.
- **Linear-time patterns.** Alternatives inside quantifiers are mutually exclusive, digit
  groups need explicit separators, and keyword windows and gaps are bounded. The ReDoS test
  suite runs 13 adversarial 100,000-character inputs against every rule. During development
  it caught a real exponential-backtracking bug in the email pattern, which is now fixed.
- **Strict input contract.** Unknown fields, empty `entities` and wrongly cased entity names
  are rejected rather than guessed at.

## Security measures

- **No PII in logs.** The access log records method, the *matched route pattern* (never the
  raw URL or query string), status, duration, body size and request ID. Logger fields only
  accept primitive values, so whole objects can't be logged by accident. Logged errors carry
  the error name, code and stack frames **without the message**, because messages such as JSON
  parse errors can quote the body. Tests assert that emails, SSNs, card numbers and IPs sent
  in the body, query string, URL path and malformed JSON never reach the log output.
- **No PII in responses** beyond the de-identified text. Error messages never echo input, and
  500 responses are generic.
- **Request size limits.** `BODY_LIMIT` is enforced by the JSON parser on the decompressed
  body, so it is zip-bomb safe (tested for gzip, deflate and Brotli). The limit is parsed strictly at startup, because
  body-parser has historically treated an invalid limit as no limit (GHSA-v422-hmwv-36x6).
  `MAX_TEXT_LENGTH` is enforced on `text` separately.
- **Content-Type enforcement.** Non-JSON bodies get a 415. Strict JSON parsing rejects
  top-level primitives.
- **Security headers** via `helmet` (CSP, HSTS, `nosniff`, frame options, and so on).
  `X-Powered-By` and ETags are disabled, and `Cache-Control: no-store` is set on every
  response.
- **Rate limiting** per client IP on `POST /deidentify` (`express-rate-limit`, IETF draft-7
  headers). It runs before body parsing so limited clients cost almost nothing.
- **Slow-client protection.** `headersTimeout` is 10 s, `requestTimeout` 15 s and
  `keepAliveTimeout` 5 s. Shutdown on `SIGTERM`/`SIGINT` is graceful.
- **Request IDs.** A well-formed incoming `X-Request-Id` (`[A-Za-z0-9._-]{1,128}`) is
  propagated. Anything else is replaced with a UUID, which prevents log injection through the
  header.
- **Supply chain.** There are 3 runtime dependencies (`express`, `helmet`,
  `express-rate-limit`). `npm audit` reported 0 vulnerabilities at the time of writing, and CI
  audits production dependencies.
- **Not included (deployment concerns):** TLS termination, authentication and authorization,
  and CORS. CORS is not enabled, so browsers on other origins can't call the API. Run the
  service behind a TLS-terminating proxy or gateway that handles authentication, and set
  `TRUST_PROXY` accordingly so rate limiting sees real client IPs.

## Testing

```bash
npm test                 # all tests
npm run test:coverage    # with coverage thresholds (fails below 90% lines / 85% branches)
npm run check            # lint, then typecheck, then coverage tests, then build (same as CI)
```

The suite (Vitest and supertest) covers:

- **Validators:** Luhn, IIN ranges, SSA rules, leap years and ambiguous dates, octets,
  E.164 lengths, email lengths and labels.
- **Detection:** positive and negative tables per entity covering punctuation, brackets and
  quotes, Unicode (accents, IDN, CJK adjacency, emoji, Unicode dashes and no-break spaces),
  line breaks, adjacency and documented known false positives and misses.
- **Overlap and replacement:** longest-wins, priority ties, chains, duplicates, adjacency,
  and invalid span guards.
- **Service:** counts, selection, overlap ownership, CRLF preservation, idempotency.
- **API:** success, selection, every error code, gzip, deflate and Brotli bodies and the decompressed size limit,
  405 with `Allow`, rate limiting, security headers, request IDs, generic 500s, and log
  redaction.
- **ReDoS:** 13 adversarial 100,000-character inputs, each with a 2-second budget.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests, across Node 20, 22
and 24. The steps are:

1. `npm ci`
2. Lint
3. Typecheck
4. Tests with coverage thresholds
5. Build
6. A smoke test of `dist/server.js`. It waits for `/health` (and fails with the server log if
   the server never becomes healthy), checks that a de-identification response contains the
   expected placeholders, checks that malformed JSON returns 400, and fails if the submitted
   PII appears in the server's debug-level log.
7. `npm audit --omit=dev --audit-level=high`

The workflow runs with read-only `contents` permission and cancels superseded runs. It only
runs on GitHub; the local equivalent of steps 2–5 is `npm run check`.

## Limitations

- **Rule-based by design.** Names, street addresses, medical record numbers, passport and
  driver's licence numbers, and other free-form PII are not detected. Only the six entity
  types above are supported.
- **English-centric context.** DOB and SSN keywords are English only. Phone rules cover NANP
  and `+`-prefixed international numbers; national formats without `+` (e.g. UK
  `020 7946 0958`) and bare 10-digit runs are not detected.
- **ASCII digits only.** Full-width (`５５５`) and other non-ASCII digits are not detected.
  Text isn't Unicode-normalised, because normalising would shift offsets and alter the output.
- **Known false positives.** Phone-shaped identifiers (`Invoice 100-200-3000`), four-part
  version numbers (`Release 1.2.3.4`), and Luhn-valid numbers with a real IIN prefix are
  redacted. These are covered by tests so any change in behaviour is deliberate. A `#` right
  after a phone number is read as an extension, so in `555-123-4567 #2 in the queue` the `#2`
  is redacted along with the number.
- **Date of birth.** A date is only detected within 30 characters after a keyword, on the same
  line and in the same sentence. Of several dates after one keyword, only the first is
  redacted. Two-digit years are accepted when either the 19xx or 20xx reading is plausible.
- **IPv4 only.** IPv6 is out of scope. Leading-zero octets (`010.0.0.1`) are not detected.
- **Email.** Quoted local parts, IP-literal domains (`user@[10.0.0.1]`) and rare RFC 5322
  characters aren't supported. A missing space after a sentence (`a@b.com.Next`) can extend
  the match into the next word.
- **Lengths** are measured in UTF-16 code units, so an emoji counts as 2 toward
  `MAX_TEXT_LENGTH`.
- **Rate limiting** uses in-memory storage per process. Use a shared store (e.g. Redis) when
  running multiple instances. Clients are keyed by their full IP address, so an IPv6 client
  that controls a whole prefix can rotate addresses to get around the limit. Enforce limits at
  the gateway as well.

### Development notes

- npm 10.2.4 (bundled with Node 20.11) failed while resolving this dependency tree with
  `Cannot read properties of null (reading 'edgesOut')`; npm 10.9.9 succeeded. If you hit that
  error, upgrade npm (`npm i -g npm@10`) or run `npx npm@10 ci`.
- Behind a TLS-inspecting corporate proxy, point Node at your organisation's root CA with
  `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`. Don't disable `strict-ssl`.
