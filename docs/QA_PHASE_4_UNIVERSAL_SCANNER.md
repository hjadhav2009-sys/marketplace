# Phase 4 Universal Scanner QA

## Automated

- Run Prisma validation, typecheck, lint, validator suite, marking/consignment/workflow migration smokes, consignment/workflow tests, universal scanner tests, audit, benchmark, build, and `git diff --check`.
- Confirm both database schemas contain the universal lookup indexes.
- Confirm `mobile-app/`, private data, databases, storage, APKs, keystores, dependencies, and build output are not staged.

## Manual Browser QA

1. Test `/work/scan` and `/packing` at 360, 390, 430, 768, 1024, and 1440 px.
2. Scan with an owner, a multi-account worker, and a single-account worker.
3. Verify identical SKUs show separate account/source/stage cards and no card is auto-selected.
4. Verify AWB, Tracking ID, Seller SKU, FSN, listing ID, barcode, and consignment/task codes.
5. Verify Pick, Mark, Pack, problem, completed-only, no-result, stale-card, and next-scan focus states.
6. Remove an account assignment after loading a card and confirm its action is rejected.
7. Confirm existing customer Picker, Customer Order Packing, consignment queues, and private marking-file download still work.

Manual browser QA remains required because automated tests do not validate hardware scanner timing, focus behavior, real viewport wrapping, or live worker ergonomics.
