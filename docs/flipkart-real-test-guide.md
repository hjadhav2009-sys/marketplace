# Flipkart Real Export Test Guide

Use this guide only for local sanitized testing. Do not commit real Flipkart files, customer data, labels, invoices, Tracking IDs, addresses, phone numbers, `.env`, Supabase URLs, passwords, or secrets.

Put local test files in `private-test-data/` or `local-test-data/`. These folders are ignored by Git.

## Listing Excel

For the first real-like Listing Master test:

- Keep only 50 to 100 product rows.
- Keep `Seller SKU Id` exactly the same as the Order Excel `SKU` when you want matching to work.
- Product image URLs can remain only if they are public Flipkart image URLs.
- Replace `Manufacturer Details`, `Importer Details`, and `Packer Details` with `TEST BUSINESS`.
- Remove private seller notes or any internal/private operational fields if present.
- Save the file locally with a name such as `private-test-data/flipkart-listing.real.xlsx`.

Listing Excel is master data. Import it only when new listings are added or product title, image, price, listing status, or scraped product details change.

## Order Excel

For the first real-like daily Order Excel test:

- Keep only 10 to 20 order rows.
- Replace `Buyer name` with `Test Buyer`.
- Replace `Ship to name` with `Test Receiver`.
- Replace `Address Line 1` and `Address Line 2` with `MASKED ADDRESS`.
- Replace `PIN Code` with `000000`.
- Replace `Order Id` with fake values such as `TESTORDER0001`.
- Replace `ORDER ITEM ID` with fake values such as `TESTITEM0001`.
- Replace `Shipment ID` with fake values such as `TESTSHIP0001`.
- Replace `Tracking ID` with fake values such as `FMPC0000000001`.
- Keep SKU real only when matching Listing Master, or replace it consistently in both files.
- Save the file locally with a name such as `private-test-data/flipkart-order.real.xlsx`.

Daily workers should upload only Flipkart Order Excel after Listing Master is already imported.

## Dry Run

Run this before importing in the browser:

```bash
npm.cmd run flipkart:dry-run -- private-test-data/flipkart-order.real.xlsx private-test-data/flipkart-listing.real.xlsx
```

The dry run does not require a database. It prints row counts, duplicate counts, missing required fields, missing listing/image warnings, unique SKUs, unique Tracking IDs, multi-item Tracking IDs, unknown headers, and missing expected headers.

## Manual Test Order

1. Put sanitized Listing Excel in `private-test-data/`.
2. Put sanitized Order Excel in `private-test-data/`.
3. Run the dry-run command.
4. Fix header mismatch or masking mistakes if any.
5. Import Listing Master in the browser.
6. Import daily Order Excel in the browser.
7. Scan a fake Tracking ID such as `FMPC0000000001`.
8. Confirm image, title, category, specs, SKU, and quantity show from Listing Master.
