# Amazon File Classification

Classification is signature-based:

- `AMAZON_SHIPMENT`: shipment reference, positive quantity, and at least one exact product identifier.
- `AMAZON_ALL_LISTINGS`: Seller SKU plus ASIN/FNSKU and listing status.
- `AMAZON_CATEGORY_CATALOG`: product identity, title, category, and enrichment fields.
- `AMAZON_PRODUCT_CATALOG`: product identity, title, and enrichment fields.
- `AMAZON_SUPPORTING`: useful identifiers/enrichment without a stronger profile.
- `UNKNOWN_SUPPORTING`: safe fallback that cannot generate work.

Aliases normalize case, spacing, underscores, dots, and hyphens. A filename or a lone generic `SKU` header cannot make a file a shipment report.

For Amazon category templates, the parser reads `attributeRow`, `labelRow`, and `dataRow` metadata when present. Otherwise it scores the first 30 rows and prefers machine attribute names such as `item_sku`, `item_name`, `feed_product_type`, and `main_image_url`. Template, Upload, Product, and Inventory sheets outrank Instructions, Data Definitions, Valid Values, Images, Examples, and Dropdowns.
