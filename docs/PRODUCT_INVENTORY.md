# Product Inventory

Product Inventory is a refresh lifecycle, not enrichment-once. Field provenance, manual locks, durable runner leases and retained per-entry merge checkpoints are part of the production contract.

Product Inventory is a marketplace product catalog, not a stock system. `MarketplaceListing` is canonical; identifiers stay in `MarketplaceListingIdentifier`, optional defaults in `ProductProcessRule`, and marking designs in `MarkingAsset`.

Use `/owner/product-inventory` to search the selected seller account by SKU, FSN, Listing ID, ASIN, FNSKU, barcode, title, or category. Results load 50 at a time. With no saved processing default, the product remains valid and Direct to Pack is preselected.

Use `/owner/product-inventory/refresh` for periodic multi-file catalog refresh. Refresh never deletes absent products or overwrites useful nonblank values with blanks. New consignments remain separate per-shipment work.

Use `/owner/product-inventory/new` for an owner-created local draft and `/owner/catalog/missing` for retained Daily Order rows whose stable Seller SKU/marketplace identifiers do not match a unique account listing. Descriptive fields are optional; identity remains required and protected. A resolved unstarted Order receives one immutable Pick task and an affected-group projection refresh. Started work snapshots are never silently rewritten.

`MarketplaceListingAttribute` stores only entered category/template values. Amazon technical keys are stable attribute identities while human labels drive the form. The recognized Flipkart main listing report maps its common 75-column family without using stock, procurement, SLA, or minimum-order columns as workflow quantities. Owner-entered nonblank fields use manual provenance and are locked by default.
