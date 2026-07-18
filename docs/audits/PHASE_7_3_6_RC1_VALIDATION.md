# Phase 7.3.6 RC1 validation

Status: **LOCAL AUTOMATED RELEASE-CANDIDATE VALIDATION COMPLETE - NO PUSH AUTHORIZED**

This report covers the complete PR diff from `origin/main` plus the local RC1 repair tree. It does not approve a push, merge, deployment, real-database operation, browser gate, two-worker gate, or native application work.

## Starting evidence

- Branch: `phase-7.3.6-projection-idempotent-import-manual-catalog`.
- Starting local and remote branch SHA: `072db2abc73ff5a9061e379ed9a4ae252a3a188f`.
- `origin/main` and merge base: `2981db0187c02e9c02174d1f12d0a5c4509359de`.
- Starting worktree: clean; `git diff --check` passed.
- PR #1: open, Draft, unmerged, base `main`, exact starting head SHA above.
- Starting PR merge-test SHA: `8b67cf2879a6bb0f8689b1006feeed524dd96257` (starting head only).
- Starting PR diff: 284 files, 29,323 additions, 2,043 deletions.

GitHub run `29640433586` (`Phase 7.3.4 audit`, run number 3) completed successfully for the starting SHA. Its single `synthetic-audit` job passed checkout, Node setup, locked root/mobile dependency installation, SQLite Prisma validation/generation, typecheck, lint, production hardening, grouped Pack safety, direct-stage actions, grouped Details, Product Inventory, import recovery, permission, security, and adaptive-import steps. The run published no artifacts. The repository contained one workflow and that workflow contained no deployment step; this proves no deployment workflow ran for the commit, but it is not a claim about infrastructure outside this repository.

## CI coverage repair

The starting workflow did not run the Phase 7.3.6 projection, rolling-import/privacy, manual-listing, missing-listing, dynamic-form, production-flow, recovery, migration-smoke, build, dependency-advisory, Consignment Assembly-route, legacy-review, or server-action-boundary gates.

The repaired PR-only workflow retains its historical filename but is named `Phase 7.3.6 Release Candidate`. It uses read-only repository permissions, Node 22, a disposable workspace SQLite database, locked root/mobile installs, SQLite and PostgreSQL schema validation, Prisma generation, the RC suites, all four disposable migration smokes, one build, and `npm audit --omit=dev`. It has a 60-minute timeout, no artifact upload, no production secret, and no deployment step.

The new workflow has not run because the local repair commit has not been pushed. The old successful run is not evidence for the local tree.

## Independent source-audit findings

Every confirmed application-code Blocker/High below was repaired and received focused regression coverage before the final matrix. The separate production backup/restore blocker remains open.

| Severity at discovery | Finding | Current status |
| --- | --- | --- |
| HIGH | All-PROBLEM task groups could disappear from projections. | Repaired and covered by projection tests. |
| RELEASE-BLOCKING MEDIUM | A bounded refresh could clear durable DIRTY/FAILED/REBUILDING projection state. | Repaired and covered by projection tests. |
| HIGH | Invalid Flipkart Order quantities could be defaulted, truncated, or accepted. | Repaired and covered by parser/import tests. |
| HIGH | Legacy generic/PDF Order paths could bypass modern tasks and snapshots. | Retired to review-only; focused policy passes. |
| HIGH | Old-pending problem mutation could corrupt every Order stage. | Routed through the stage-aware service. |
| BLOCKER | Ambiguous held Orders had no owner resolution path. | Repaired with versioned owner selection and release tests. |
| HIGH | Legacy Consignment link/clear lacked receipts, version checks, and atomic issue lifecycle. | Repaired with concurrency/rollback tests. |
| BLOCKER | Invalid Consignment source rows could be marked reviewed and a partial batch activated. | Activation now fails closed; real integration tests pass. |
| HIGH | Missing-listing SKU normalization collapsed meaningful punctuation. | Repaired; punctuation-preserving tests pass. |
| HIGH | Amazon technical templates were detected but not persisted into usable profiles. | Repaired; real Product Inventory profile integration passes. |
| HIGH | Legacy null-form profiles were reused instead of upgraded. | Repaired with profile-version tests. |
| HIGH | Fallback package identity changes could create duplicate Order work. | Repaired with stable primary/fallback identity tests. |
| HIGH | Concurrent rolling imports could race into raw uniqueness failures or partial work. | Serializable bounded transactions and concurrency tests pass. |
| HIGH | Retention cleanup accepted forged backup proof. | Backup existence/hash/ownership checks and tests pass. |
| HIGH | Live-work unfiltered endpoints could expose unauthorized stage/source summaries. | Capability and revocation checks pass. |
| HIGH | Role labels could force permissions or redirect disabled users into loops/forbidden legacy routes. | Explicit capability resolver is authoritative; permission tests pass. |
| HIGH | Product Inventory jobs lacked an owner-visible failed/stale lease recovery path. | Failed/expired RUNNING jobs are conditionally reclaimable; active leases are protected. |
| HIGH | Public ImportJob payloads/errors could expose paths and runner internals. | Explicit DTO and public-error sanitization tests pass. |
| HIGH | Consignment Assembly routes were supported downstream but blocked by real imports/UI. | All four Flipkart/Amazon routes now pass real import-to-activation tests. |
| BLOCKER | Missing Consignment listings were auto-created as placeholders, bypassing owner review. | Auto-placeholder removed; real Flipkart/Amazon hold, resolve, and explicit activation tests pass. |
| HIGH | Successful server-action redirects were caught as errors. | Success redirects moved after `try/catch`; AST policy passes across all 28 action modules. |
| HIGH | Owner URLs and durable import/activation records could store raw filesystem/database errors. | Action-specific/shared sanitizers applied; injected activation AuditLog test passes. |
| RELEASE-BLOCKING MEDIUM | Marketplace locking omitted legacy UploadBatch and SKU-image mapping data. | Both relations now lock marketplace changes; disposable DB tests pass. |
| RELEASE-BLOCKING MEDIUM | Prisma index declarations drifted from applied paired migrations. | Schema declarations aligned without rewriting migration history. |
| TEST GAP | Safe reimport rollback test expected failure without an active failure injector. | Added deterministic SQLite trigger; proves Order/task transaction rollback. |
| TEST GAP | Write-path inventory tried to read an intentionally deleted indexed file. | It now excludes only nonexistent working-tree paths and still scans all existing tracked/untracked source. |
| RELEASE-BLOCKING BUILD | A named `ListingForm` export made the Next.js page module contract invalid. | The shared form moved to a non-route component; focused type/lint/service checks and the production build pass. |
| RELEASE-BLOCKING CI | Integrity receipts hashed Windows worktree line endings, which could not be reproduced from LF-normalized Git content on Linux CI. | Text receipts now use explicit `LF_NORMALIZED_TEXT`; recognized binaries use `RAW_BYTES`; the validator enforces the policy and a line-ending regression. |
| HIGH - OPERATIONS | Raw main-file rollback did not cover SQLite sidecars and matching private storage. | Unsafe commands removed. Production staging/migration remains blocked pending a reviewed tool/procedure and disposable restore rehearsal. |

The integrity manifest is explicitly a path/range/byte/SHA-256 inventory, not proof that every line received semantic human review. Semantic evidence is the reconciled source passes, exact write-path policy, and production-service tests.

The Codex Security product deep-repository scan was not installed or available in this session and is not claimed. Independent source/security passes, exact mutation policies, privacy tests, and service-level regressions are the available security evidence.

## Local release matrix

Durations are wall-clock times from the final clean-install run. An initial sandbox-only npm-cache `EPERM` and an initial network-blocked Prisma binary request are recorded as environment attempts; each exact command then passed with the required access. Expected Prisma error logs in rollback-injection tests are not suite failures.

| Exact command or documented alias | Duration | Result |
| --- | ---: | --- |
| `npm.cmd ci` | 184.7 s | PASS; 505 packages, 0 vulnerabilities. |
| `npm.cmd run prisma:validate` | 15.6 s | PASS - SQLite schema. |
| `npx.cmd prisma validate --schema prisma/schema.postgres.prisma` | 27.6 s | PASS - schema only; no PostgreSQL runtime. |
| `npx.cmd prisma generate --schema prisma/schema.prisma` | 40.3 s | PASS after pinned binary download access. |
| `npm.cmd run typecheck` | 43.4 s | PASS. |
| `npm.cmd run lint` | 122.9 s | PASS. |
| `npm.cmd run test:validators` | 90.6 s | PASS. |
| `npm.cmd run projection-lifecycle:test` | 13.4 s | PASS. |
| `npm.cmd run rolling-order-import:test` | 20.4 s | PASS. |
| `npm.cmd run import-privacy:test` | same suite | PASS through the exact `rolling-order-import.test.ts` invocation above; not repeated. |
| `npm.cmd run manual-listing:test` | 15.5 s | PASS. |
| `npm.cmd run missing-listing-resolution:test` | 47.4 s | PASS. |
| `npm.cmd run dynamic-catalog-form:test` | 6.5 s | PASS. |
| `npm.cmd run production-flow:test` | 28.3 s | PASS after deterministic rollback-test repair. |
| `npm.cmd run recovery-correctness:test` | 74.2 s | PASS on the post-repair tree; final staged manifest validation is recorded separately below. |
| `npm.cmd run grouped-pack-safety:test` | 13.1 s | PASS. |
| `npm.cmd run direct-stage-actions:test` | 22.5 s | PASS. |
| `npm.cmd run grouped-details:test` | 32.4 s | PASS. |
| `npm.cmd run product-inventory-import:test` | 30.6 s | PASS. |
| `npm.cmd run import-recovery:test` | 19.7 s | PASS. |
| `npm.cmd run permission:test` | 42.2 s | PASS, including live-work load and account lifecycle. |
| `npm.cmd run security:test` | 20.7 s | PASS. |
| `npm.cmd run adaptive-import:test` | 11.7 s | PASS. |
| `npm.cmd run legacy-order-review:test` | 11.3 s | PASS. |
| `npm.cmd run consignment-assembly-routes:test` | 26.0 s | PASS. |
| `npm.cmd run production-audit-hardening:test` | 32.9 s | PASS; 376 exact ORM and 5 raw-SQL call sites across 61 reviewed files. |
| `npm.cmd run server-action-boundaries:test` | 9.0 s | PASS across 28 action modules. |
| `npm.cmd run marking:migration-smoke` | 11.1 s | PASS - fresh/existing-style SQLite. |
| `npm.cmd run consignment:migration-smoke` | 16.5 s | PASS - fresh/existing-style SQLite. |
| `npm.cmd run workflow:migration-smoke` | 14.4 s | PASS. |
| `npm.cmd run final-workflow:migration-smoke` | 22.7 s | PASS - fresh/existing-style SQLite plus static paired SQL parity; no PostgreSQL runtime. |
| `npm.cmd run build` | 299.8 s | PASS; an initial 197.5 s run exposed the invalid page export, which was repaired before this successful run. |
| `npm.cmd audit --omit=dev` | 4.6 s | PASS; 0 vulnerabilities after the sandbox-only advisory/cache attempt was retried with approved network/cache access. |
| `npx.cmd tsx tests/phase-7-3-5-audit-manifest.test.ts` | 5.6 s | PASS; canonical integrity receipts match 717/717 files in the staged candidate. |
| `git diff --check` | 1.7 s | PASS on the final candidate before the self-report/manifest refresh; repeated after refresh before commit. |

After extracting the shared Product Inventory form, focused revalidation passed: typecheck (54.8 s), lint (61.2 s), manual-listing transaction/concurrency (36.7 s), and server-action boundaries across 28 action modules (20.7 s).

The staged-candidate audit covered 120 changed paths: zero matched the private/generated-file denylist, zero were under `mobile-app`, and no private database was tracked. Ignored local database, dependency, build, and temporary-audit material remained outside the index. A high-confidence secret-pattern scan found no credential material. The final canonical manifest has one integrity receipt for each of 717 tracked files; this remains integrity evidence, not a claim of per-line semantic review.

## Evidence boundaries and open gates

- New pushed-commit GitHub CI: **PENDING** because no push is authorized yet.
- PR #1 and its successful CI run still refer to the unchanged starting remote head; the local commit will not be represented remotely until a separate push approval is given.
- Browser QA at 360, 390, 430, 768, 1024, and 1440: **PENDING**.
- Sanitized two-worker QA for every Order and Consignment route: **PENDING**.
- Copied-real-database migration rehearsal: **PENDING** and not executed in RC1 validation.
- Sidecar-aware SQLite database plus matching private-storage backup/restore procedure and disposable restore rehearsal: **BLOCKED / NOT IMPLEMENTED**.
- Production-computer medium-or-larger performance verification: **PENDING**.
- PostgreSQL schema/static paired-SQL inspection: **PASS**; disposable PostgreSQL runtime: **NOT TESTED**.
- Backend/API contract freeze and native Expo work: **NOT AUTHORIZED**.
- No push, merge, deployment, real-database mutation, Expo, Android, APK/AAB, or `mobile-app` source change is authorized by this report.
