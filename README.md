# Marketplace Pick & Pack

Multi-marketplace warehouse pick-and-pack app cloned from the working Meesho foundation.

Current focus: Flipkart Pick & Pack.

Future support: Meesho, Amazon, Myntra, and WooCommerce.

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

`src/lib/marketplaces/flipkart/parser.ts` parses sanitized Flipkart Order Excel and Listing Excel rows into the shared marketplace model. Owner uploads now include Flipkart Orders, and SKU image/listing imports include Flipkart Listings. Tracking ID is stored separately from the internal unique key so packing can search the scanned Flipkart label barcode.

### Import Flipkart Listings

Open `Owner -> SKU Images / Listings -> Flipkart Listings` and upload a sanitized Flipkart Listing `.xlsx` export.

The importer matches `Seller SKU Id` to order `SKU`. Product images use this priority: `Image 1 1366 URL`, `Image URL 1`, `Image 2 1366 URL`, `Image URL 2`, and so on. `Generated Direct Product URL` is stored as a product page URL only; it is not treated as an image.

### Import Flipkart Orders

Open `Owner -> Upload -> Flipkart Orders` and upload a sanitized Flipkart Order `.xlsx` export.

Duplicate safety uses `ORDER ITEM ID` first. If it is missing, the importer falls back to `Shipment ID + SKU`. Rows missing both `ORDER ITEM ID` and `Shipment ID` are held for review and are not imported automatically.

### Review Missing Mappings

After a Flipkart Order import, open the batch review page. It shows valid imported rows, duplicate rows, held rows, rows missing required fields, and missing listing/image warnings.

Warnings use clear messages:

```text
Missing Flipkart listing mapping for SKU: <sku>
Listing found but image missing for SKU: <sku>
```

The review page can download CSVs for missing listing mappings and missing image mappings.

### Tracking ID Scan

Packing scans use Flipkart `Tracking ID` / AWB from the label barcode, for example fake fixture values like `FMPC0000000001`.

If multiple ready SKUs share one Tracking ID, the packing result page shows the ready shipment items together. Confirm packed marks ready items for that Tracking ID as packed. Already packed items are skipped, and problem items stay in problem status.

### Fake Fixtures

Sanitized fake Flipkart Excel fixtures live in:

```text
tests/fixtures/flipkart/
```

They are safe for tests only and contain masked names, masked addresses, PIN `000000`, and fake `FMPC0000000000` style Tracking IDs. Never upload real Flipkart exports, order files, customer data, invoices, labels, phone numbers, addresses, Tracking IDs, passwords, Supabase URLs, or `.env` files to GitHub.

The next development step is to run a manual import using a sanitized copy of a real Flipkart export and refine any column edge cases found in that masked file.

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
