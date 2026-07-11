# Consignment Picking

Flipkart and Amazon activated lines share this queue and the same guarded task mutation service. Amazon cards use immutable Seller SKU, ASIN, FNSKU, title/image, account, shipment, route, and exact-match data. Completing Pick unlocks Pack for `PICK_PACK` or Mark for `PICK_MARK_PACK`.

Open `/work/consignments/pick` in the selected seller account. The queue contains only active consignment PICK tasks that are unassigned or assigned to the current worker. Exact Seller SKU, internal SKU, FSN, listing ID, LID, EAN, UPC, GTIN, and barcode matches are tried before title or consignment text search.

`Start`, `+1`, `+5`, set quantity, and complete remaining are explicit actions. Search or scan never changes quantity. Required quantity is work quantity only; this feature has no stock balance, reservation, or deduction.

Completing PICK unlocks only the next stage: PACK for `PICK_PACK`, or MARK for `PICK_MARK_PACK`.
