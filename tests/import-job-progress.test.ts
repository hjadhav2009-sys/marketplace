import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMPORT_JOB_PAGE_SIZE,
  importJobElapsedSeconds,
  importJobPageWindow,
  importJobProgressPercent,
  importJobRowsPerSecond
} from "../src/lib/import-jobs/progress";
import { chunkFlipkartListingRows } from "../src/lib/marketplaces/flipkart";

assert.equal(importJobProgressPercent({ processedRows: 0, totalRows: 0 }), 0, "Empty job starts at 0%");
assert.equal(importJobProgressPercent({ processedRows: 250, totalRows: 1000 }), 25, "Progress percent is rounded from processed rows");
assert.equal(importJobProgressPercent({ processedRows: 1200, totalRows: 1000 }), 100, "Progress percent is capped at 100%");

const startedAt = new Date("2026-07-06T00:00:00.000Z");
const now = new Date("2026-07-06T00:01:40.000Z");
assert.equal(importJobElapsedSeconds({ processedRows: 500, totalRows: 1000, startedAt }, now), 100, "Elapsed seconds use start time");
assert.equal(importJobRowsPerSecond({ processedRows: 500, totalRows: 1000, startedAt }, now), 5, "Rows per second is derived from processed rows");

assert.deepEqual(
  importJobPageWindow(126, 3, IMPORT_JOB_PAGE_SIZE),
  {
    page: 3,
    pageSize: 50,
    totalPages: 3,
    skip: 100,
    take: 50,
    from: 101,
    to: 126
  },
  "Review pagination returns one bounded page window"
);
assert.equal(importJobPageWindow(126, "99").page, 3, "Review pagination clamps high page numbers");
assert.equal(importJobPageWindow(0, "bad").from, 0, "Review pagination handles empty results");
assert.deepEqual(chunkFlipkartListingRows(Array.from({ length: 1200 }, (_, index) => index), 500).map((chunk) => chunk.length), [500, 500, 200], "Listing chunks stay at the 500-row import target");

const importSource = readFileSync(join(process.cwd(), "src", "lib", "marketplaces", "flipkart", "import.ts"), "utf8");
const listingPageSource = readFileSync(join(process.cwd(), "app", "owner", "sku-mappings", "import", "page.tsx"), "utf8");
const uploadReviewSource = readFileSync(join(process.cwd(), "app", "owner", "uploads", "[batchId]", "review", "page.tsx"), "utf8");
const runnerSource = readFileSync(join(process.cwd(), "src", "lib", "import-jobs", "runner.ts"), "utf8");

assert.match(importSource, /updateImportJobProgress/g, "Flipkart imports update ImportJob progress");
assert.match(importSource, /processedRows % 500 === 0/, "Flipkart order import updates progress during large daily files");
assert.match(importSource, /chunkFlipkartListingRows\(listingDrafts\)/, "Flipkart listing import keeps 500-row chunks");
assert.match(listingPageSource, /take: 50/, "Listing import review limits issue rows");
assert.match(uploadReviewSource, /const REVIEW_PAGE_SIZE = 50/, "Order review page caps rendered rows");
assert.match(runnerSource, /storage", "import-jobs"/, "Uploaded job files are saved into ignored import-job storage");

console.log("Import job progress tests passed.");
