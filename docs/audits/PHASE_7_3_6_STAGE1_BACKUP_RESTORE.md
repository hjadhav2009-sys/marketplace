# Phase 7.3.6 Stage 1 backup/restore audit

## Scope and safety

Stage 1 implements a synthetic-only SQLite WAL-aware backup and separate-target restore rehearsal. Work began from RC1 commit `f4b36c1a6e3df7d272b2d87999cc12478b196314` on local branch `phase-7.3.6-stage1-backup-restore`.

The implementation does not read an environment file, enumerate the repository private-storage root, or open/copy/hash/migrate/reset the real SQLite database. It refuses those exact paths and refuses all inputs outside `.codex-tmp/stage1-backup/`. No mobile application, deployment or production database command is in scope.

## Design result

- Consistency model: all application/background writers quiesced for the database plus durable-file capture window.
- Database capture: Node SQLite online backup API, producing a standalone SQLite image that includes committed WAL state.
- Private files: deterministic create-only copy with per-file SHA-256 and safe relative paths.
- Atomic publication: unique partial sibling directory, full verification, then rename; failures remove the partial directory.
- Restore: new empty separate directory only; backup generation remains immutable.
- Manifest: `ReleaseBackupManifestV1` with application commit, timestamps, journal mode, migrations, tables/counts, database/file sizes and hashes, scope version and canonical self-check.
- Verification result: `ReleaseRestoreVerificationV1` with explicit pass/failure fields.

## Synthetic evidence

The fixture applies every tracked SQLite migration to a disposable database and records the migration names/checksums. It inserts only fake users, account, listing/identifier, Order, Consignment batch/line, WorkTasks, ImportJob and AuditLog. Fake storage covers an import file, marking asset, image placeholder, zero-byte file, Unicode filename and long safe path.

The rehearsal deliberately pins an older WAL reader, commits the synthetic business rows, and proves that a main-file-only copy is incomplete. The online backup contains the committed rows. The standalone restore passes:

- SQLite integrity `ok`;
- zero foreign-key violations;
- exact migration history, required table inventory and table counts;
- selected fake business-record checks;
- exact private-file count and hashes;
- read-only Prisma model counts;
- source/destination separation and unchanged source checks.

The focused safety test runs two independent restores and repeated verification, and exercises 32 negative outcomes. Coverage includes missing confirmation/quiescence, missing source/archive/manifest/database/storage, malformed/unsupported/tampered manifest, database corruption, database/storage size and same-size hash changes, foreign-key damage, unexpected files, existing targets, collisions, traversal, outside-root paths, interrupted backup/restore cleanup, real-path refusal, invalid paths and symlink/junction escape.

Required validation passed: SQLite Prisma schema validation, TypeScript, ESLint with zero warnings, security tests, production-audit hardening including authoritative write paths, and the complete validator suite. One production build passed and reported 78 application routes. `npm audit --omit=dev` reached the advisory service and reported zero vulnerabilities.

## Commands

```text
npm.cmd run release-backup:test
npm.cmd run release-backup:synthetic-rehearsal
```

The complete branch validation and safety audit results are recorded in the final Stage 1 handoff after execution.

## Findings and limitations

No Stage 1 synthetic correctness blocker remains after the focused rehearsal. Production support is intentionally absent. A copied-real-data rehearsal, actual quiescence enforcement, secret backup, storage-root finalization, capacity measurement, encryption/key custody, offsite retention, real rollback timing and production operator approval remain later gates.

`storage/uploads/` is explicitly `UNKNOWN_REQUIRES_STAGE2_CONFIRMATION`; it must be classified before any real backup scope can be approved. Product images are regenerable but are included in the conservative initial design until cache-reference invalidation is implemented and tested.

## Decision boundary

Passing this audit means only that the synthetic design and fail-closed mechanics passed. It is not production readiness, deployment approval, real migration approval or native-app approval.

The real database and repository private storage were not opened, enumerated, copied, hashed, migrated, reset or modified. Copied-real-database rehearsal, real private-storage rehearsal, production rollback rehearsal, browser QA, two-worker QA, production-hardware performance and production deployment were not run and are not passed.
