# Flipkart Browser Manual Test Checklist

Use this checklist only for local sanitized testing. Do not commit `private-test-data/`, real or sanitized Excel files, database files, screenshots, labels, invoices, customer data, order IDs, Tracking IDs, addresses, phone numbers, `.env`, Supabase URLs, passwords, or secrets.

## Before Starting

Confirm the dry-run is clean:

```bash
npm.cmd run flipkart:dry-run -- private-test-data/flipkart-order.real.xlsx private-test-data/flipkart-listing.real.xlsx
```

Expected safe checks:

- Unknown order headers should be `none`.
- Missing expected order headers should be `none`.
- Unknown listing headers should be `none`.
- Missing expected listing headers should be `none`.
- Missing listing and missing image counts should be reviewed before browser import.

## Start The App

Use a local database and temporary local secrets. From the app folder, initialize the local SQLite database before starting the server:

```powershell
cd E:\marketplace1\marketplace
$env:DATABASE_URL="file:./dev.db"
$env:SESSION_SECRET="local-test-secret-change-me"
$env:NEXT_PUBLIC_APP_URL="http://localhost:3000"
$env:NEXT_PUBLIC_APP_NAME="Marketplace Pick & Pack"
npx.cmd prisma migrate deploy
npx.cmd prisma db seed
npm.cmd run dev -- --host 0.0.0.0
```

If you want to use the first-run setup page instead of the seeded demo users, run `npx.cmd prisma migrate deploy`, skip `npx.cmd prisma db seed`, then open `/setup`.

If a large upload shows `Unexpected end of form`, stop and restart the dev server so the configured `100mb` upload limits are loaded.

Open:

```text
http://localhost:3000
```

## Login

1. Login as owner.
2. If the database is fresh, complete setup and create the owner user.
3. Do not use production credentials for this local manual test.

## Import Listing Master

Go to:

```text
Owner -> SKU Images / Listings -> Flipkart Listings
```

Upload:

```text
private-test-data/flipkart-listing.real.xlsx
```

Confirm the listing import summary:

- Total rows
- Created
- Updated
- Unchanged
- Duplicate Seller SKU
- Missing SKU
- Missing image
- Inactive listings

Expected behavior:

- A live import bar appears after submitting the file. It shows that upload/import is running, but it does not show exact percent complete.
- Listing rows with duplicate Seller SKU are reviewed or skipped according to the import summary.
- Product image data is imported from Listing Master.
- No real URL values need to be copied into notes or screenshots.

## Import Daily Orders

Go to:

```text
Owner -> Upload -> Flipkart Orders
```

Upload:

```text
private-test-data/flipkart-order.real.xlsx
```

Confirm the order review:

- Valid rows
- Held rows
- Duplicate rows
- Missing listing warnings
- Missing image warnings
- Multi-item Tracking ID warning, if shown

Expected behavior:

- Bad or held rows are not auto-imported.
- Missing listing mapping warnings are clear and exportable if present.
- Missing image warnings are clear and exportable if present.
- Imported order rows use Flipkart duplicate-key priority: `ORDER ITEM ID`, then `Shipment ID + SKU`.

## Picker Page

Open the picker workflow and confirm:

- Product image appears from Listing Master.
- SKU is visible.
- Title is visible.
- Quantity is visible.
- Category or specification context is visible if available.
- Rows without listing data show a warning instead of silently hiding the issue.

## Packing Page

Open the packing workflow and test search/scan using a sanitized or fake Tracking ID such as:

```text
FMPC0000000000
```

Confirm:

- Tracking ID search finds Flipkart order rows.
- If the same Tracking ID has multiple SKUs, all ready items for that shipment appear together.
- Image, title, SKU, and quantity are visible.
- Confirm packed marks ready items as packed.
- Already packed items are skipped.
- Problem items remain problem.
- Problem order flow also works from Tracking ID search.

## Reports And Exports

Confirm these views or downloads if available:

- Pending orders
- Packed orders
- Problem orders
- Missing listing mappings CSV
- Missing image mappings CSV

## After Testing

Before committing any code or docs:

```bash
git status --short --ignored
```

Safe state:

- `private-test-data/` appears only as ignored.
- Local database files appear only as ignored.
- Screenshots are not staged.
- No private workbook, label, invoice, customer data, or `.env` file is staged.

If a bug is found, fix it with fake tests only. Do not copy real workbook rows, product names, customer details, order IDs, or Tracking IDs into tests.
