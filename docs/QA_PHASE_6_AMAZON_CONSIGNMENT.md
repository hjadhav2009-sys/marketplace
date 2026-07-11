# Phase 6 Amazon Consignment QA

## Automated

- Parser/classification: CSV, TSV, XLSX, XLSM cached values, corrupt/oversize files, ZIP controls.
- Matching: priority, conflicts, duplicates, account and marketplace isolation, no title matching.
- Integration: listing sync, catalog enrichment, draft has zero tasks, explicit activation, task plan, immutable snapshot, activation replay.
- Migration: fresh and existing-style SQLite databases; both Prisma schemas validate.
- Regression: Flipkart consignment, workflow, scanner, customer Assembly, and safe customer packing suites.

## Manual Browser QA

Test at 360, 390, 430, 768, 1024, and 1440 px:

1. Amazon account shows Amazon file guidance and accepts multiple reports.
2. Preview shows shipment identity, Seller SKU, FNSKU, ASIN, title/image, route, and issues without horizontal overflow.
3. Ambiguous/conflicting rows cannot activate until reviewed.
4. Pick-Mark-Pack transitions through the shared worker queues.
5. Mark cards show operational settings and catalog details, with no file-download controls.
6. Universal scanner finds Amazon FNSKU/ASIN and keeps accounts as separate cards.
7. Flipkart import and worker flow remain unchanged.

Use synthetic/sanitized files only. Do not commit reports, screenshots, databases, or storage.
