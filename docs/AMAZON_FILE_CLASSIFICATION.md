# Amazon File Classification

Classification is signature-based:

- `AMAZON_SHIPMENT`: shipment reference, positive quantity, and at least one exact product identifier.
- `AMAZON_ALL_LISTINGS`: Seller SKU plus ASIN/FNSKU and listing status.
- `AMAZON_CATEGORY_CATALOG`: product identity, title, category, and enrichment fields.
- `AMAZON_PRODUCT_CATALOG`: product identity, title, and enrichment fields.
- `AMAZON_SUPPORTING`: useful identifiers/enrichment without a stronger profile.
- `UNKNOWN_SUPPORTING`: safe fallback that cannot generate work.

Aliases normalize case, spacing, underscores, dots, and hyphens. A filename or a lone generic `SKU` header cannot make a file a shipment report.
