# Marketplace Catalog Refresh

Refresh now records field authority/provenance. Same-authority newer nonblank values and higher-authority values may replace automated values; manual locks win, blanks do not erase, and a main-image change marks cached image state stale.

Run Product Inventory Refresh periodically when listings change. It accepts multiple files or ZIP, enriches in place, preserves manual/nonblank data, and never deletes a product absent from one upload.

Refresh is separate from Daily Orders and New Consignment. A shipment normally needs only its quantity file because matching uses existing Product Inventory.
