# Manual Production Smoke Test

Run this checklist on the Windows server PC before using Meesho Pick & Pack for daily work.

## Server Startup

1. Double-click `scripts\windows\start-meesho-app.bat`.
2. Confirm the launcher prints the masked database URL, selected Prisma schema, local URL, mobile URL, and Cloudflare URL.
3. Confirm `npm run check:production-readiness` passes.
4. Open `http://localhost:3000` on the server PC.

## Owner Setup

1. Log in as the owner.
2. Open **Owner -> Accounts**.
3. Create a second Meesho account.
4. Switch between accounts from **Switch account**.
5. Confirm the selected account name is visible on upload, SKU image, picker, packing, and report pages.

## SKU Images

1. Open **Owner -> SKU Images** for the selected account.
2. Download the simple SKU + image URL template.
3. Import at least one SKU/image URL row.
4. Confirm full export includes product metadata and cache status.
5. Confirm not-cached and broken image exports download correctly.

## PDF Import

1. Open **Owner -> Upload**.
2. Upload a Meesho label PDF and manifest/picklist PDF.
3. Confirm the review page separates problem rows, order rows, and picklist summary rows.
4. Confirm missing AWB/SKU or low-confidence rows are held for review.
5. Click **Confirm import**.
6. Confirm the import result shows attempted, created, updated, duplicate skipped, held/missing image, and error counts.
7. Click **Prepare today's product images**.
8. Confirm the image preparation report shows total SKUs, already cached, newly cached, failed, no mapping, and no image URL.

## Repeated Imports

1. Upload the same PDF again.
2. Confirm no duplicate orders are created.
3. Upload a later PDF containing old orders plus at least one new AWB.
4. Confirm only new AWBs are created and unchanged duplicates are skipped.
5. Confirm existing packed/problem orders do not return to READY.

## Picker

1. Log in as a picker assigned to the selected account.
2. Open **Pick**.
3. Confirm compact mode loads first and only shows the selected account's orders.
4. Switch to image cards.
5. Confirm cached images show quickly and missing images show a clean placeholder.
6. Mark one SKU group picked.
7. Confirm **Load more** preserves filters.

## Packing

1. Log in as a packer assigned to the selected account.
2. Open **Pack**.
3. Type a full AWB and open the order.
4. Type only the last 5 to 8 AWB characters and confirm suggestions rank exact, suffix, then contains matches.
5. Use the camera scanner on the HTTPS Cloudflare URL.
6. Confirm the scanner stops and shows **Opening order...** after a valid AWB.
7. Confirm the packing result page shows SKU, quantity, color, courier, AWB, and cached image or placeholder.
8. Confirm packed.
9. Repeat confirm on the same order and verify it is safely treated as already packed.
10. Mark one order as a problem and verify it cannot be packed accidentally.

## Exports And Backup

1. Open **Owner -> System**.
2. Export orders, packed orders, pending orders, problem orders, scan logs, SKU mappings, and upload batches.
3. Store `.env` in the owner's secure backup location.
4. Confirm `storage/product-images/` is not committed to Git and can be regenerated from SKU image URLs.

## Cleanup

1. Open **Owner -> Cleanup**.
2. Confirm image cache cleanup shows only images unused for 30+ days.
3. Confirm cleanup requires the exact confirmation text before deleting files.
