# Marketplace Pick & Pack

Multi-marketplace warehouse pick-and-pack app cloned from the working Meesho foundation.

This application manages worker Pick / Mark / Assemble / Pack workflows. It is not inventory-management or ERP software and does not track physical available stock, valuation, receiving, QC, or marketplace stock updates.

Current focus: Flipkart and Amazon Product Inventory, consignment, and pick-and-pack workflows.

Product Inventory is the account-scoped marketplace catalog, not physical stock. Periodic multi-file refresh is available at `/owner/product-inventory/refresh`; daily orders and shipment/consignment quantity uploads remain separate. Processing defaults are optional and no rule means Direct to Pack.

Future support: Myntra and WooCommerce; native Expo/APK work remains postponed.

The first marketplace version keeps the stable owner, picker, packer, account, SKU image, upload review, AWB search, scanner, and cleanup foundation. The new marketplace parser namespace lives under `src/lib/marketplaces/`, with Flipkart enabled first and the old Meesho parser preserved for later migration.

## Local Setup

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful validation commands:

```bash
npm run typecheck
npm run lint
npm run test:validators
npm run build
```

Optional local production checks:

```bash
npm run check:env
npm run check:production-readiness
```

## Safety

Do not commit `.env`, database passwords, Supabase URLs, customer data, Flipkart private data, real order PDFs, shipping labels, invoices, or real personal information.

Do not commit real Meesho PDFs or real Flipkart order exports. Use sanitized sample files and masked fixtures only.

Back up `.env` securely outside Git because it contains database connection and signing secrets.

The repo ignores real PDF files, local SQLite databases, `node_modules`, `.next`, and `storage/product-images/`.

## Marking And Workflow Foundation

Owners can manage marking designs at `/owner/marking-library` and account-scoped product routes at `/owner/process-rules`. Files remain in ignored managed owner-PC storage, replacements create immutable versions, and one design can link explicitly to listings across multiple seller accounts. Exact identifiers are used before title fallback and ambiguous matches require owner choice.

Phase 1 adds a dormant `WorkTask` foundation only. Existing order Picker and Packing behavior remains unchanged. See `docs/MARKING_LIBRARY.md`, `docs/WORKFLOW_ROADMAP.md`, `docs/MARKING_WORKER_FILE_DELIVERY.md`, and `docs/UNIVERSAL_WORK_SCAN_CONTRACT.md`.

## Flipkart Consignment Preview And Activation

Owners can open `/owner/consignments` to upload a Flipkart Consignment Details CSV or a bounded ZIP containing the main CSV and optional Labels, Quality Check reference, and README files. Files are detected by headers/content and stored privately under ignored managed storage.

`Quantity Sent` means required worker processing quantity, never physical stock. The preview matches Seller SKU and FSN against the selected account, requires explicit resolution for conflicts or ambiguity, proposes Product Process Rules, and creates no tasks until an authorized owner or manager clicks **Activate Consignment**.

Phase 2 activates only Ready-made (`PICK_PACK`) and Marking (`PICK_MARK_PACK`) routes. Existing customer Order Picker and Packing remain unchanged. See [Flipkart consignment import](docs/FLIPKART_CONSIGNMENT_IMPORT.md) and [task activation](docs/CONSINGMENT_TASK_ACTIVATION.md).

## Universal Work Scanner

Workers can use `/work/scan` or the Universal Scan section of `/packing` to find exact active customer-order and consignment Pick/Mark/Pack work across every authorized seller account. Owners search all active accounts; workers search assigned active accounts plus their compatible legacy primary account. Scanning is lookup-only, multiple matches stay separate, and each explicit action is re-authorized without switching the selected account.

See [scanner workflow](docs/UNIVERSAL_WORK_SCANNER.md), [authorization](docs/CROSS_ACCOUNT_WORK_AUTHORIZATION.md), [performance](docs/UNIVERSAL_SCANNER_PERFORMANCE.md), and [QA](docs/QA_PHASE_4_UNIVERSAL_SCANNER.md). This remains a workflow system, not inventory or ERP software.

## Marketplace Structure

```text
src/lib/marketplaces/common/
src/lib/marketplaces/flipkart/
src/lib/marketplaces/meesho/
```

Shared order fields include `marketplace`, `orderId`, `shipmentId`, `trackingId`, `awb`, `sku`, `fsn`, `quantity`, `color`, `size`, `courier`, `paymentType`, and `productDescription`.

Enabled now:

```text
FLIPKART
```

Prepared for later:

```text
MEESHO
```

## Flipkart Importer

`src/lib/marketplaces/flipkart/parser.ts` parses sanitized Flipkart Order Excel/CSV and Listing Excel rows into the shared marketplace model. Owner uploads include daily Flipkart Orders, and SKU image/listing imports update the permanent Flipkart Listing Master. Tracking ID is stored separately from the internal unique key so packing can search the scanned Flipkart label barcode.

Large Flipkart Excel uploads now run through an Import Progress job:

```text
Upload file -> save ignored local copy -> create ImportJob -> process rows in 500-row chunks -> poll progress -> open review
```

Open `Owner -> Imports -> Import Progress` to watch total rows, processed rows, created, updated, unchanged, duplicates, warnings, errors, missing listings, missing images, elapsed time, and rows/sec. Keep the owner PC and Node app running while a job is `RUNNING`.

Flipkart Listing Excel can contain 30,000+ products. Do not import it every day. Import/update it only when new listings are added or product title, image, price, listing status, or scraped product data changes.

For sanitized real-export testing, keep files local under `private-test-data/` or `local-test-data/`. These folders and `*.real.xlsx`, `*.real.csv`, `*.seller.xlsx`, and `*.seller.csv` are ignored by Git. Never commit private Flipkart files, customer names, addresses, phone numbers, invoices, labels, Tracking IDs, `.env`, Supabase URLs, passwords, or secrets.

### Import Flipkart Listings

Open `Owner -> SKU Images / Listings -> Flipkart Listings` and upload a sanitized Flipkart Listing `.xlsx` export.

After upload, the app redirects to the import progress page. When the job completes, open the review/result page from the progress screen. The listing result page shows summary counts and only the first 50 issue rows in the browser; download error CSVs for bulk review.

The importer upserts `MarketplaceListing` rows by `accountId + marketplace + Seller SKU Id`. Product images use this priority: `Image 1 1366 URL`, `Image URL 1`, `Image 2 1366 URL`, `Image URL 2`, and so on. `Generated Direct Product URL` is stored as a product page URL only; it is not treated as an image.

Listing Master stores product/listing fields such as title, FSN, listing ID, status, prices, category, scraped title/brand/category, highlights, description, specifications, all image URLs, selected main image URL, scrape status, and scrape error. It reports created, updated, unchanged, missing image, and inactive listing counts.

### Import Flipkart Orders

Open `Owner -> Upload -> Flipkart Orders` and upload a sanitized Flipkart Order `.xlsx` or `.csv` export.

After upload, the app redirects to the import progress page. The review page renders summary counts first and caps each visible row section to 50 rows so large daily files do not freeze the browser.

Daily workers should upload only the Flipkart Order Excel/CSV. Order SKU matches Listing Master `Seller SKU Id`. Duplicate safety uses `ORDER ITEM ID` first. If it is missing, the importer falls back to `Shipment ID + SKU`. Rows missing both `ORDER ITEM ID` and `Shipment ID` are held for review and are not imported automatically.

Orders store order-specific fields only: marketplace, shipment/order item/tracking IDs, SKU, FSN, order product title when present, quantity, city/state when present, and pick/pack/problem state. Full listing descriptions, specifications, and all image URLs stay in Listing Master.

### Review Missing Mappings

After a Flipkart Order import, open the batch review page. It shows valid imported rows, duplicate rows, held rows, rows missing required fields, and missing listing/image warnings.

Warnings use clear messages:

```text
Missing Flipkart listing mapping for SKU: <sku>
Listing found but image missing for SKU: <sku>
```

The review page can download CSVs for missing listing mappings and missing image mappings.

### Image Cache Scope

Do not cache all Listing Master images. When preparing product images for a daily Flipkart order batch, the app collects unique SKUs from that order batch, finds matching Listing Master rows, creates/updates small `SkuImageMapping` cache records only for those SKUs, and caches only those needed images.

### Tracking ID Scan

Packing scans use Flipkart `Tracking ID` / AWB from the label barcode, for example fake fixture values like `FMPC0000000001`.

If multiple ready SKUs share one Tracking ID, the packing result page shows the ready shipment items together. Confirm packed marks ready items for that Tracking ID as packed. Already packed items are skipped, and problem items stay in problem status.

Picker and packer screens join order SKU to Listing Master so workers see the listing image, title, SKU, quantity, FSN, listing ID, category, brand, and useful listing details when available.

### Fake Fixtures

Sanitized fake Flipkart Excel fixtures live in:

```text
tests/fixtures/flipkart/
```

They are safe for tests only and contain masked names, masked addresses, PIN `000000`, and fake `FMPC0000000000` style Tracking IDs. Never upload real Flipkart exports, order files, customer data, invoices, labels, phone numbers, addresses, Tracking IDs, passwords, Supabase URLs, or `.env` files to GitHub.

The next development step is to run a manual import using a sanitized copy of a real Flipkart export and refine any column edge cases found in that masked file.

For performance testing, generate large fake files locally into ignored storage:

```bash
npm.cmd run flipkart:generate-performance-fixtures
npm.cmd run flipkart:perf-test
```

Generated files go under `local-test-data/performance/` and must not be committed.

### Real Export Dry Run

Follow [docs/flipkart-real-test-guide.md](docs/flipkart-real-test-guide.md) before using real-like data.

Run the database-free dry run before importing through the browser:

```bash
npm.cmd run flipkart:dry-run -- private-test-data/flipkart-order.real.xlsx private-test-data/flipkart-listing.real.xlsx
```

The dry run reports listing/order row counts, duplicate rows, held rows, missing SKU/listing/image counts, unique order SKUs, unique Tracking IDs, multi-item Tracking IDs, unknown headers, and missing expected headers.

## Preserved Foundation Notes

The old Meesho parser remains in `lib/parsers/meesho` and is re-exported from `src/lib/marketplaces/meesho` for future multi-marketplace support.

Account-wise SKU image database support remains. You only need SKU + image URL for daily SKU image imports. Existing alternate headers such as `meesho_image_url` and `product_image_url` are still accepted while marketplace-neutral naming is added later.

Product image cache files are local and ignored by Git. Existing cache layout documentation still applies to the inherited foundation:

```text
storage/product-images/meesho/<accountId>/<safeSku>
```

Meesho image URLs are external and can be slow, expired, or blocked. Flipkart image handling should follow the same safe local-cache pattern.

For local HTTP testing, use:

```env
SESSION_COOKIE_SECURE=false
```

SQLite requires a `file:` URL for development databases:

```env
DATABASE_URL="file:./dev.db"
```

If a PDF upload fails with `Body exceeded 1 MB limit`, check `next.config.ts`; this app keeps the Server Action body limit at `100mb`.

Vercel is still not recommended here for heavy PDF parsing; a Windows PC, VPS, or other long-running Node.js host is safer for large local parse jobs.

Free-first daily setup: Windows PC + Supabase + Cloudflare Tunnel remains a valid deployment pattern for the foundation. The compatibility launcher still exists:

```text
scripts\windows\start-meesho-app.bat
```

## Consignment Worker Flow

Activated Flipkart consignments are processed from `/work`: Consignment Pick, optional Marking, and Consignment Pack. Work is selected-account scoped, claimed atomically, quantity guarded, retry-idempotent, and recorded in `WorkActionLog`. Final PACK completion reconciles line and batch completion. See [Consignment Picking](docs/CONSIGNMENT_PICKING.md), [Marking Workflow](docs/MARKING_WORKFLOW.md), [Consignment Packing](docs/CONSIGNMENT_PACKING.md), [Assignment](docs/WORK_TASK_ASSIGNMENT.md), and [Problems](docs/WORK_TASK_PROBLEMS.md).

Consignment quantities are workflow quantities only. No inventory balance, reservation, deduction, receiving, valuation, or marketplace stock update is introduced. The universal scanner and authenticated Worker Agent remain later phases.

## Customer Order Assembly

Ready-made orders continue through Pick then Pack. Listings configured as `PICK_ASSEMBLE_PACK` create one selected-account Assembly task after Pick; packing is blocked until that task is completed or owner-skipped. Packers can also divert a picked exceptional order with explicit manual instructions. Open `/work/assembly` for the worker queue and see [Customer Order Assembly](docs/CUSTOMER_ORDER_ASSEMBLY.md) and [Packing Gate](docs/ORDER_ASSEMBLY_PACKING_GATE.md).

Assembly is intentionally simple workflow tracking. It does not add BOM, parts stock, manufacturing operations, stock deductions, QC, costing, or ERP behavior. Phase 5 does not modify the Android/mobile app.

## Amazon Consignments

Amazon seller accounts can import bounded CSV, TSV/TXT, XLSX, XLSM, or ZIP shipment/listing/catalog reports through the existing owner consignment pages. The app classifies content from headers, enriches the account-scoped listing master, matches FNSKU then Seller SKU, ASIN, External ID, and barcodes, and requires explicit owner activation before creating shared Pick/Mark/Pack tasks. See [Amazon Import](docs/AMAZON_CONSIGNMENT_IMPORT.md), [Matching](docs/AMAZON_LISTING_MATCHING.md), [Catalog Enrichment](docs/AMAZON_CATALOG_ENRICHMENT.md), and [Activation](docs/AMAZON_CONSIGNMENT_ACTIVATION.md).

Worker marking cards now focus on product/design identity, instructions, settings, and quantity progress. Worker file download/open automation is postponed; the private owner marking library remains preserved. Never commit real Amazon reports, extracted catalog archives, private images, databases, or managed storage.

## Phase 7 Performance And QA

Phase 7 adds safe local scale presets, complete universal-resolver timing, SQLite query-plan checks, controlled duplicate concurrency tests, a permission matrix, and Amazon stored-reparse aggregate limits. Generated databases live only in ignored `.codex-tmp/`.

```powershell
npm.cmd run performance:test
npm.cmd run concurrency:test
npm.cmd run permission:test
npm.cmd run security:test
```

See [Performance plan](docs/PHASE_7_PERFORMANCE_AND_QA_PLAN.md), [benchmarks](docs/PERFORMANCE_BENCHMARKS.md), [query plans](docs/QUERY_PLAN_REVIEW.md), [security QA](docs/SECURITY_QA.md), and [production readiness](docs/PRODUCTION_READINESS.md). Browser and warehouse checklists remain required before real rollout. Phase 8 is native Expo without WebView; a signed APK remains the final deployment step.

## Safe Real SQLite Migration

Before reviewing current warehouse data on the latest schema, stop every app writer and run the guarded Phase 7.1 workflow:

```powershell
npm.cmd run real-db:inspect
npm.cmd run real-db:backup
npm.cmd run real-db:test-migrations
npm.cmd run real-db:verify
```

Only after reviewing those results may the owner run `npm.cmd run real-db:migrate -- --confirm-real-migration` and type the exact database filename. Backups and QA copies are private and Git-ignored. After migration, `/owner/manual-review` provides owner-only links, safe counts, and empty-state guidance without mutating business data. See [backup and migration](docs/REAL_DATABASE_BACKUP_AND_MIGRATION.md) and [desktop review](docs/REAL_DATA_DESKTOP_REVIEW.md).
