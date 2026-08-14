# Phase 7.5 PostgreSQL roadmap

## Status

Planning only. Phase 7.4A does not change the datasource, generate migrations, touch data, connect to Supabase, or authorize production cutover.

## Baseline parity

`prisma/schema.prisma` (SQLite) and `prisma/schema.postgres.prisma` (PostgreSQL) contain the same domain model: 37 models, 25 enums, 128 declared indexes, 25 unique declarations, 107 relations, and 97 DateTime fields. There are no Prisma `Json` fields; JSON-shaped domain data is stored in string fields such as `progressJson`, metadata/snapshot JSON fields, and safe issue context.

The schema diff has only two intended differences:

1. datasource provider: `sqlite` vs `postgresql`;
2. the mapped name of the long `WorkGroupProjection` composite index, shortened to PostgreSQL's 63-byte physical identifier.

This is strong schema-shape parity, not proof of runtime, migration-history, or data parity.

Both histories currently contain 32 `migration.sql` files. Their folders are not one-to-one: the PostgreSQL track consolidates the earliest SQLite safety/parser work into its initial migration and splits some later consignment/workflow migrations into provider-specific backfill/isolation steps. Equal file count is therefore incidental.

## Read-only classification

| Area | Classification | Evidence / required follow-up |
| --- | --- | --- |
| Prisma models, enums, fields, relations, uniques, defaults | PARITY | Schemas differ only by provider and one mapped index name; prove generated catalogs from migrations |
| Datasource provider and PostgreSQL 63-byte index name | EXPECTED_DATABASE_DIFFERENCE | `sqlite` vs `postgresql`; explicit shortened WorkGroupProjection map |
| Migration folder chronology/splitting | EXPECTED_DATABASE_DIFFERENCE | 32 each, but early consolidation and consignment/workflow splits differ |
| Empty-database catalog equivalence from both histories | MIGRATION_GAP | No current generated catalog-diff receipt in this audit |
| Existing SQLite data conversion and invariant manifest | MIGRATION_GAP | No authorized conversion harness/run yet |
| JSON-shaped strings | PERFORMANCE_REVIEW_REQUIRED | No Prisma Json fields; keep text for initial parity, profile before any jsonb proposal |
| Queue/scanner/projection/import indexes | PERFORMANCE_REVIEW_REQUIRED | 128 declared indexes need PostgreSQL plan/scale evidence |
| Transaction conflicts/retries/idempotency | PERFORMANCE_REVIEW_REQUIRED | Mixed SQLite lock text and Prisma conflict codes need PostgreSQL concurrency tests |
| Date/time, collation, exact-match semantics | PERFORMANCE_REVIEW_REQUIRED | Provider behavior differs despite schema shape |
| PostgreSQL backup/restore and cutover | MIGRATION_GAP | Existing release-backup tooling is SQLite-specific |

## Main migration risks

### Independent migration histories

SQLite migrations live under `prisma/migrations`; PostgreSQL SQL migrations live under `prisma/migrations-postgres`. They must be reconciled by semantic object inventory, not assumed equivalent from folder count or names. Build a machine-readable matrix of tables, columns, types, nullability, defaults, enums/check constraints, PKs, unique constraints, FKs/actions, and indexes from a fresh database created by each history.

### Concurrency and transaction behavior

Workflow code already uses Prisma transactions, idempotency receipts, optimistic state checks, and retries. Several transient classifiers contain both SQLite text (`database is locked`) and PostgreSQL-relevant Prisma codes such as P2034/write conflict. PostgreSQL changes locking, isolation, deadlock, timeout, and unique-conflict behavior; broad retry regexes are not sufficient proof.

Review at minimum:

- claim/complete/quantity mutations;
- route selection and downstream task replacement/unlock;
- work-group projection refresh and pagination;
- scanner candidate mutation;
- packing and problem resolution/reassignment;
- import job state transitions;
- account/user/admin changes;
- destructive data-management jobs;
- security throttle races;
- action-receipt idempotent replay.

Define transaction isolation deliberately where invariants need it. Keep retries bounded with jitter/backoff and retry only classified transient conflicts; never retry validation/authorization/business failures.

### JSON stored as text

Because the Prisma schemas declare no `Json`, snapshot/progress/metadata/safe-data strings will remain text unless a later, separately reviewed migration changes them. Before considering `jsonb`, inventory producers/consumers, malformed legacy handling, ordering/canonicalization assumptions, size, query needs, privacy rules, and export/backup compatibility. Text-to-jsonb conversion is not part of the initial parity cutover unless it has an independent proof and rollback.

### Date/time and defaults

Validate every DateTime/default/update trigger behavior against UTC storage and application formatting. Compare Prisma-generated defaults, SQL defaults, `@updatedAt`, nullability, import timestamps, retention deadlines, problem/workflow timestamps, and cursor ordering. Run boundary tests around timezone display, same-timestamp pagination, and retention cutoffs.

### Identifier and collation behavior

SQLite and PostgreSQL differ in case sensitivity, collation, text comparison, LIKE behavior, and index use. Test login/email normalization, marketplace identifiers, seller SKUs, AWBs/tracking IDs, filenames/fingerprints, account names, exact scanner matching, and uniqueness under case/Unicode variants. Do not silently change product matching semantics.

### Index effectiveness

The 128 declared indexes require workload validation, especially the long WorkGroupProjection indexes, queue ordering, scanner exact lookup, import/job state, account scoping, audit/action history, and deletion retention. Use `EXPLAIN (ANALYZE, BUFFERS)` only against synthetic/staging data. Confirm the shortened mapped index name exactly matches migration SQL and Prisma expectations.

## Proposed phases

### 7.5A — inventory and parity harness

- Pin PostgreSQL/Supabase-compatible engine version and Prisma version.
- Generate empty SQLite and PostgreSQL databases solely from their respective migration histories.
- Export catalog metadata and diff semantic structure.
- Map every schema difference to expected/provider-only or defect.
- Inventory raw SQL/provider assumptions and JSON-as-text fields.
- Define sanitized scale fixtures and acceptance thresholds.

Exit: zero unexplained schema objects/differences; no production connection required.

### 7.5B — data-conversion design

- Define ordered table export/import by FK graph.
- Preserve stable IDs, enum strings, timestamps, nullable values, audit history, action receipts, snapshots, and retained-file references.
- Define escaping/encoding and large-text handling.
- Build count/hash/invariant manifests without raw private values.
- Specify sequences/identity reseeding even if current IDs are strings.
- Specify failure cleanup and rerun idempotency.

Exit: reviewed dry-run procedure and rollback, with no production mutation.

### 7.5C — synthetic migration rehearsal

- Create representative synthetic datasets including long identifiers, Unicode/case collisions, null/empty distinctions, every enum/state, duplicate/idempotent action attempts, problem histories, imports, and deletion jobs.
- Run migration end to end into disposable PostgreSQL.
- Compare table counts, key aggregates, FK/orphan checks, unique constraints, snapshot parse rates, timestamps, and selected row hashes.
- Run application typecheck/tests and focused workflow concurrency tests against PostgreSQL.

Exit: repeatable green migration and parity report.

### 7.5D — scale, concurrency, and failure rehearsal

- Use sanitized synthetic scale volumes representative of owner inventory/import/work history.
- Measure queue/scanner/dashboard/report queries and index plans.
- Inject deadlocks, serialization conflicts, connection loss, partial importer failure, and rerun attempts.
- Prove action receipt/idempotency behavior and no partial workflow transitions.
- Establish pool size, statement/transaction timeout, connection budget, and observability.

Exit: agreed performance/error budgets and green concurrency invariants.

### 7.5E — backup, restore, and cutover rehearsal

- Replace SQLite-specific backup assumptions with PostgreSQL-native logical/managed backups while separately preserving retained file storage and a signed/hash manifest.
- Prove point-in-time/managed recovery options in the selected environment.
- Rehearse full restore into a new environment and application verification.
- Define read-only/quiescence window, final delta handling, DNS/secret/config switch, smoke checks, rollback threshold, and responsibility matrix.

Exit: timed rehearsal, verified restore, explicit go/no-go checklist.

### 7.5F — production cutover (separately authorized)

Requires explicit owner approval, verified backup, change window, monitoring, rollback authority, and no unrelated release changes. Freeze writes, take final source manifest/backup, transfer, verify invariants, switch configuration, run read-only then mutation smoke tests, monitor, and retain the source database unchanged until the rollback window closes.

## Data parity checklist

- Row counts per table and account-scoped aggregate counts.
- PK uniqueness; no orphan FKs; relation delete/update actions match.
- Enum/state distribution and illegal-value absence.
- Unique business identifiers and case/Unicode collision report.
- Min/max/null counts for timestamps and numeric quantities.
- Work required/completed quantities and stage/status invariants.
- Order/consignment/task/problem relationships and completion consistency.
- Assignment/capability/account membership integrity.
- Import jobs/issues/mappings/profiles and retained artifact references.
- Marking assets/files/listing links and active-version rules.
- Workflow receipts/action logs/change events and replay uniqueness.
- JSON-string parse success, size distribution, and selected canonical hashes.
- Deletion/quarantine jobs, retention timestamps, and file-manifest linkage.
- Auth/session/reset/throttle data reviewed under security retention policy.

## PostgreSQL test matrix

- Migration deploy from empty database and from each supported checkpoint.
- Prisma client generation and CRUD for every model family.
- Parallel claim/quantity/complete/route/problem/pack requests.
- Duplicate client request IDs with same and different fingerprints.
- Exact scanner matching and ambiguous/missing/completed results.
- Import job concurrency, retry, cancellation, and mapping/file-role transitions.
- Long-running projection refresh and queue pagination under writes.
- Unique/case/Unicode boundaries.
- Timezone/retention boundaries.
- Connection exhaustion, timeout, deadlock, and transaction retry classification.
- Backup/restore plus application verification.
- Production checks reject SQLite in production and reject unsafe configuration.

## Security and privacy

Use synthetic data for development/rehearsal. Migration manifests contain counts/hashes and safe identifiers only, not customer/order documents or credentials. Secrets belong in the target secret manager, never scripts/docs/logs. Apply least-privilege database roles, encrypted transport, managed backups, retention policy, audit logging, and access review. Validate exports and error logs do not expose raw customer/order data.

## Rollback principles

Rollback is a planned state transition, not “point the app back” after dual writes. Prefer a quiesced cutover with an immutable SQLite source snapshot and no write divergence. If PostgreSQL accepts production writes, rollback requires a reviewed reverse-delta strategy or a decision to restore PostgreSQL forward; never discard acknowledged warehouse work. Define exact abort thresholds before the window.

## Explicit non-goals

No PostgreSQL implementation, Supabase project creation, production credentials, schema redesign, jsonb conversion, dual-write system, live data copy, deployment, or cutover is authorized by this roadmap.
