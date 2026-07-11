# Amazon Catalog Enrichment

All Listings supplies listing identity and status. Category/product catalogs enrich title, brand, category, subcategory, material, color, size, model, description, bullet points, and safe images. Blank incoming values never erase existing listing data.

At activation, worker-facing fields are copied into `ConsignmentCatalogSnapshotV1`. The snapshot is bounded, versioned, safe-URL validated, and immutable. It contains source record IDs for audit provenance, never managed paths or raw workbook rows.
