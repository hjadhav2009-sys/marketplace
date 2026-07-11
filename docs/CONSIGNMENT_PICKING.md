# Consignment Picking

Open `/work/consignments/pick` in the selected seller account. The queue contains only active consignment PICK tasks that are unassigned or assigned to the current worker. Exact Seller SKU, internal SKU, FSN, listing ID, LID, EAN, UPC, GTIN, and barcode matches are tried before title or consignment text search.

`Start`, `+1`, `+5`, set quantity, and complete remaining are explicit actions. Search or scan never changes quantity. Required quantity is work quantity only; this feature has no stock balance, reservation, or deduction.

Completing PICK unlocks only the next stage: PACK for `PICK_PACK`, or MARK for `PICK_MARK_PACK`.
