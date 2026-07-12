# Amazon Catalog Enrichment

All Listings supplies listing identity and status. Category/product catalogs enrich title, brand, category, subcategory, material, color, size, model, description, bullet points, and safe images. Blank incoming values never erase existing listing data.

At activation, worker-facing fields are copied into `ConsignmentCatalogSnapshotV1`. The snapshot is bounded, versioned, safe-URL validated, and immutable. It contains source record IDs for audit provenance, never managed paths or raw workbook rows.

`syncAmazonListings` also returns a typed enrichment result keyed by listing ID. Snapshots use listing identity first, then authoritative operational catalog values, then shipment-row fallback. Material, color, size, model, descriptions, bullets, and secondary images therefore remain available to marking workers without reopening a workbook. Galleries combine listing and catalog images, deduplicate them, and remain capped at ten.

Sheets classified as `REFERENCE` (Instructions, Data Definitions, Valid Values, Images, Examples, Dropdowns, Read Me, Help, and Guide) remain private stored references but never update listings, create identifiers, or supply shipment quantities.
