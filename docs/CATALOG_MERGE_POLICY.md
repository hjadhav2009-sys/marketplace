# Catalog Merge Policy

Merges are account and marketplace scoped. Creation requires Seller SKU. Exact FSN, Listing ID, ASIN, FNSKU and external/barcode identifiers support enrichment and conflict checks.

Blanks never erase values. Nonblank values fill blanks. Conflicts preserve existing values and produce warnings. Title similarity is forbidden. Identifiers cannot move silently. Gallery URLs must be HTTP/HTTPS and are capped at ten.
