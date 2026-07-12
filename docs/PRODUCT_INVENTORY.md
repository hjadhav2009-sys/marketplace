# Product Inventory

Product Inventory is a marketplace product catalog, not a stock system. `MarketplaceListing` is canonical; identifiers stay in `MarketplaceListingIdentifier`, optional defaults in `ProductProcessRule`, and marking designs in `MarkingAsset`.

Use `/owner/product-inventory` to search the selected seller account by SKU, FSN, Listing ID, ASIN, FNSKU, barcode, title, or category. Results load 50 at a time. With no saved processing default, the product remains valid and Direct to Pack is preselected.
