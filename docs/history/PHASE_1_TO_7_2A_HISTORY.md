# Phase 1 through Phase 7.2A history

This history is reconstructed from Git commits, diffs, migrations, source, tests, and repository documentation. It does not reproduce private chats and does not claim decisions unsupported by repository evidence.

| Phase | Commit | Evidence-backed result | Readiness at checkpoint |
|---|---|---|---|
| 1 | `bfcc40e56de1e2807e156da58a5e0688dc182b50` | Marking library, identifier registry, optional process rules, worker capabilities, and workflow foundation | Foundation; further workflow work required |
| 2 | `307937b335c026191c4fcb35563eddc3e882cc90` | Flipkart consignment parsing, review, matching, activation, and task creation | Import/activation implemented |
| 3 | `fa855aed78d24f63c21fe439ce3f946397ebb57e` | Consignment worker Pick/Mark/Pack execution | Worker workflow implemented |
| 3.1 | `a4e8948b4f5e1cc99b57646f3b18f359fd638663` | Permission and idempotency hardening, request isolation, problem/assignment controls | Hardened automated checkpoint |
| 4 | `02879e8302804eb805f985eb3e70817763982043` | Universal cross-account work scanner | Scanner foundation |
| 4.1 | `70f40376d4051cb23530f9d9339cc8a04a8ed840` | Shipment-safety and scanner/workflow corrections | Blocking safety corrections applied |
| 4.2 | `b2d6fb31daf3e0b37171beb31a8b6a1810fd1b3b` | Unified customer-order packing safety | Packing checks aligned |
| 5 | `c31d6b413b155818b5af38618ef5cadfa2c381af` | Customer-order assembly workflow | Assembly supported for customer work |
| 6 | `e630f29e3250e154248cc90484af33ab1eff2cd1` | Amazon consignments and richer marking cards | Amazon foundation implemented |
| 6 corrections | `78b6750...`, `20e3b66...` | Amazon catalog parsing, snapshot scanning, and snapshot enrichment corrections | Phase 6 automated checkpoint complete |
| 7 | `0c0d9d380db288c4cb095f1c429bc56b27e5e3b8` | Performance presets, full resolver benchmark harness, query-plan tests, security/permission/concurrency QA, replay hardening | Automated/code review approved; manual gates remain |
| 7.1 | `3b000eb1a8aaacac33a0577e82850480db260232` | Safe real-database inspect/backup/copied-migration/verify workflow and manual review | Deliberate real-data review tooling |
| 7.2 foundation | `34f4e7953b02c59e6ccd5b501f60ec2711520021` | Product Inventory and optional processing defaults | Catalog foundation |
| 7.2A correction | `2981db0187c02e9c02174d1f12d0a5c4509359de` | Unsupported consignment assembly activation blocked | Approved requested base |

## Per-phase concerns

Phase 1 introduced account-scoped marking/catalog/workflow models and permissions without replacing existing order pick/pack truth. Owner flows manage marking assets and optional rules; workers consume authorized tasks and files. Additive SQLite/PostgreSQL migrations and marking migration smoke tests protect existing data.

Phase 2 added Flipkart consignment batch, line, file, and issue data; parse/review/match/activate owner flows; immutable activation snapshots; and task creation. Imports are account-scoped and activation requires reviewed valid lines. Parser, foundation, integration, and migration tests cover the path.

Phase 3 exposed staged consignment work for authorized workers. Assignment, claim, progress, marking access, completion, and problems became operational. Phase 3.1 added explicit request kind/ID isolation, permission matrices, replay rules, competing claimant tests, duplicate problem/resolution behavior, and assignment controls.

Phase 4 unified exact scanning across accounts and work sources. Phase 4.1 corrected shipment aggregation and safe transitions. Phase 4.2 ensured customer packing uses the same shipment-safety rule instead of a weaker isolated check. Authorization remains server-side and result categories distinguish active/completed/none.

Phase 5 added Assembly for customer orders, ordered route transitions, assembly capability checks, and dedicated tests. Consignment assembly was not proven and later became an explicit blocked route.

Phase 6 extended consignments to Amazon, catalog/snapshot identifiers (ASIN, FNSKU, external ID, barcode), stored source candidates, archive safety, and rich marking data. Corrections centralized worksheet candidate policy, revalidated selections server-side, and completed snapshot scanning evidence.

Phase 7 added small/medium/large/full synthetic presets, including 800,000-listing configurations. Only the small full-resolver benchmark was reported. Six representative exact query plans were checked. Duplicate quantity increments received 2/5/10/20 contention coverage; other action families retained narrower tests. Quantity mutation gained bounded retries and replay recovery, while some older claim/problem/reassignment callbacks retain transaction-based reads.

Phase 7.1 introduced safe handling for the private SQLite database: inspect, consistent hash-verified backup, copied migration test, unchanged-source verification, explicit migration confirmation, post-checks, and a read-only manual review page. It avoids reset/push/seed operations against real data.

Phase 7.2 established MarketplaceListing as Product Inventory and ProductProcessRule as optional defaults. Phase 7.2A prevents activation of unsupported consignment assembly routes. Product Inventory remains catalog data, not stock.

## Status boundary

This checkpoint is based directly on `2981db0187c02e9c02174d1f12d0a5c4509359de`. Phase 7.2B is not implemented on this branch, and Phase 7.2C is not implemented. Later-branch routes, migrations, services, tests, documents, and claims are excluded.

Production remains gated by manual browser widths, sanitized warehouse QA, backup/migration/reset review, and medium-or-larger performance on stronger hardware. Native Expo and APK work remain later gates.

## Consolidated evidence count

The requested target was 50,000 lines. The clean-base evidence-backed result is 18,924 lines in `PROJECT_HISTORY_PHASE_1_TO_7_2A_18924_LINES.txt`. The repository at `2981db0` plus the clean reset checkpoint contains only enough distinct verified evidence for 18,924 useful nonduplicated lines. Padding and later-branch evidence were rejected; accuracy and branch purity take priority over requested size.
