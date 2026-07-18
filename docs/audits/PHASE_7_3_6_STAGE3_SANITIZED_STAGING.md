# Phase 7.3.6 Stage 3 sanitized staging

## Decision boundary

Stage 3 evidence is recorded here after validation. This phase permits only preparation for manual Stage 4 browser QA. It does not approve production migration, deployment, merge, public exposure, two-worker QA or native work.

## Owner decisions

- Synthetic staging confirmation: received exactly as required.
- Encryption and key custody policy: owner approved.
- Durable encrypted production-backup location: `PRODUCTION_DURABLE_BACKUP_LOCATION_PENDING`.
- Retention: `OWNER_APPROVED_RECOMMENDED_RETENTION`.

The pending durable-backup location blocks production deployment but not synthetic staging.

## Isolation architecture

The staging operator uses one ignored private root containing its SQLite database, storage roots, credentials, fixtures, sessions, logs, reports and runtime receipts. Environment creation uses an explicit operating-system variable allowlist; it does not inherit database URLs, application secrets, marketplace credentials, tunnel URLs or production domains. The server binds only to `127.0.0.1:3188`.

Operator commands are `staging:inspect`, `staging:prepare`, `staging:build`, `staging:start`, `staging:stop`, `staging:status`, `staging:reset-synthetic`, `staging:smoke` and `staging:cleanup`. Preparation, reset and cleanup require distinct exact phrases. Stop validates its private PID receipt and listener ownership, and deletion is bounded to the private staging root.

## Synthetic coverage

The canonical seed creates four obviously synthetic marketplace accounts and ten users with independent capability flags. It includes Flipkart and Amazon identifiers, dynamic attributes, manual locks, images/fallbacks, saved routes and system fallback. Synthetic Orders and Consignments cover ready, in-progress, problem, completed, assigned, cross-account, held missing-listing and all four route families. Fixtures cover a Listing Report-like catalog, rolling 100/150 Orders, duplicate/conflict cases, Consignment Quantity Sent, Amazon All Listings/category keys and positive/zero/invalid Shipped values.

Credentials are random and are written only to the ignored private credential index. Reset rotates all passwords and invalidates the prior synthetic database and sessions.

## Rollback artifact

The current `main` source was built from its own lockfiles in a detached worktree. Because that historical tree references mobile types, its own locked mobile dependencies were installed without changing source. The retained artifact contains the Next.js build, reproducible source archive, assets, package metadata, exact migration list and `PreviousExecutableArtifactManifestV1`. A synthetic database smoke on `127.0.0.1:3189` verified login, dashboard and database connectivity. No data backup is included.

## Automated staging smoke

Production-mode staging verifies the public login page plus authenticated owner, import-manager, picker, marker, assembler, packer and view-all routes. Disabled-user state, database integrity, projection availability, loopback binding and storage isolation are checked. Full workflows, six-width layout and two-worker contention remain deliberately unperformed.

## Recorded evidence

- Starting Stage 2: `phase-7.3.6-stage2-copied-data-rehearsal` at `4e020262c5a415a33bc2c74029481d18e987c5a8`.
- Local Stage 3 branch: `phase-7.3.6-stage3-sanitized-staging`.
- Current schema: 31 applied migrations; SQLite integrity `ok`.
- Canonical seed: 4 Accounts, 10 Users, 12 Marketplace Listings, 10 Orders, 5 Consignment batches, 5 Consignment lines, 14 Work Tasks and 12 Work Group projections.
- Current build: build ID `ZHsD8Ez9hhzGyL9lBJxtv`; 114 app paths from `.next/server/app-paths-manifest.json`.
- Current smoke: 15 authorized protected routes returned `200`; worker denial and foreign-session rejection returned controlled redirects; server stopped through the identity-matched PID receipt.
- Previous executable: source `2981db0187c02e9c02174d1f12d0a5c4509359de`; build ID `1XPfDtV3KRzz3k9klGWX8`; 21 migrations; 653 artifact files; aggregate SHA-256 `ac892d392d3aa2ab434a2a830139f6a83a9d249075c37a1117d4fc272a7141df`; synthetic login/dashboard smoke passed on loopback port 3189.
- The first unchanged previous-main build exposed its historical missing mobile type dependency. Installing that worktree's locked mobile dependencies fixed the build without changing old source.
- Stage 1 backup test: passed with 32 fail-closed cases.
- Copied rehearsal test: passed with 25 required scenarios and 26 fail-closed cases.
- Staging lifecycle test: passed with 31 assertions.
- Prisma validation, TypeScript, ESLint, security tests, permission tests, production-audit hardening, authoritative write-path policy and the validator suite passed.
- Production dependency audit: zero vulnerabilities.

Private credentials remain only in the ignored Stage 3 credential index. The retained executable artifact is under the ignored release-artifact root and contains no database, credentials or storage. Staging is prepared and stopped at the end of Stage 3.

## Stage 4 operator handoff

From the repository root, run `npm.cmd run staging:status`, then `npm.cmd run staging:start`. Open `http://127.0.0.1:3188` and use the private credential index under the ignored Stage 3 staging root. After QA, run `npm.cmd run staging:stop`. Do not start a public tunnel.

## Remaining gates

- Stage 4 real-browser checks at all six widths;
- Stage 5 sanitized two-worker warehouse QA;
- encrypted durable production-backup location and key-custody evidence;
- copied-database deployment rehearsal immediately before rollout;
- production-computer performance verification;
- merge/deployment authorization.

Final Stage 3 decision: `STAGE3_SANITIZED_STAGING_PREPARED`.
