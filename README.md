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

## Flipkart Parser Next Step

`src/lib/marketplaces/flipkart/parser.ts` is a placeholder. The next development step is to collect sanitized Flipkart CSV headers and sample PDF text, then map them into the shared `MarketplaceOrderLine` type. Start with CSV because Flipkart exports usually have more reliable columns than PDFs.

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

SQLite development databases must use a `file:` URL:

```env
DATABASE_URL="file:./dev.db"
```

If a PDF upload fails with `Body exceeded 1 MB limit`, check `next.config.ts`; this app keeps the Server Action body limit at `100mb`.

Vercel is still not recommended here for heavy PDF parsing; a Windows PC, VPS, or other long-running Node.js host is safer for large local parse jobs.

Free-first daily setup: Windows PC + Supabase + Cloudflare Tunnel remains a valid deployment pattern for the foundation. The compatibility launcher still exists:

```text
scripts\windows\start-meesho-app.bat
```
