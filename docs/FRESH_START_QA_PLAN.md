# Fresh-start synthetic QA plan

## Isolation and data design

Real `prisma/dev.db` remains owner-only after an authorized reset. Full workflow QA belongs in ignored disposable databases under `.codex-tmp`. Synthetic identities must be visibly fake: owner, picker, marker, assembler, packer, view-all worker, and manager; synthetic Flipkart/Amazon accounts; fake listings and identifiers; fake orders, consignments, tasks, problems, and history. Never copy customer, account, SKU, order, AWB, image, session, or token data from private files.

The reset unit fixture applies every SQLite migration and creates synthetic owner/worker/account/assignment/session/reset/audit/listing rows. It verifies exact owner selection, refusal of missing/non-owner selection, transaction purge, unchanged password hash and migrations, cleared account/session/security state, zero operational counts, integrity, foreign keys, and real-command refusal without its confirmation flag.

## Automated command matrix

Run `prisma:validate`, `typecheck`, `lint`, validator tests, marking/consignment/workflow migration smokes, consignment, workflow, universal scan, assembly, Amazon consignment, product-inventory import, permission, security, concurrency, real-database safety, fresh-database safety, small performance/query-plan tests, history validation, audit, diff check, and a production build. All application suites must use synthetic or disposable data.

Customer workflow scenarios: Pick to Pack; Pick to Assembly to Pack; problem reporting and resolution; multi-item Flipkart shipment safety; duplicate action replay; assignment contention; completed history.

Consignment scenarios: Pick to Pack; Pick to Mark to Pack; missing optional default becomes Pick to Pack; assembly routes remain blocked; assignment, view-only, duplicate-action, and cross-account rules; Flipkart and Amazon imports.

Scanner scenarios: AWB, tracking ID, seller SKU, FSN, listing ID, ASIN, FNSKU, barcode, task ID, consignment number, identifiers duplicated across accounts, completed-only result, and no result.

Permission profiles: owner/manager administration; picker pick-only; marker mark-only; assembler assemble-only; packer pack-only; view-all read access without mutation; explicit account assignment; cross-account denial; problem-report capability; library/rule/consignment permissions.

Concurrency reporting must remain precise: request levels 2/5/10/20 stress duplicate quantity increments for one mutation and one action log. Other action families retain targeted or two-request contention coverage. Do not generalize the 20-request result to every action.

## Performance and release gates

Run only the small full-resolver preset and representative query-plan checks on the owner PC. Medium, large, and full generators exist, but a medium-or-larger run on stronger hardware remains mandatory for production. Do not invent timing or query-plan coverage beyond executed checks.

Manual responsive browser checks remain required at 360, 390, 430, 768, 1024, and 1440 pixels. Sanitized warehouse testing must cover Pick, Mark, Assembly, Pack, problems, assignment contention, scanner devices, file downloads, empty states, and recovery. Backup/restore rehearsal and deliberate migration state review are production gates.

Phase 7.2B is not implemented on this checkpoint branch. Phase 7.2C is not implemented. Native React Native/Expo work waits for browser and warehouse QA approval; it must be fully native with no WebView. Expo testing precedes APK/AAB work.
