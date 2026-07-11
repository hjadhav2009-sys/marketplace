# Amazon Listing Matching

Matches are exact and limited to the selected account plus `AMAZON` marketplace. Priority is:

1. FNSKU
2. Seller SKU
3. ASIN
4. External ID
5. EAN, UPC, or GTIN

One unique result is selected. If identifiers point to different listings, the row is `IDENTIFIER_CONFLICT`. If the highest-priority identifier maps to multiple listings, it is `EXACT_MULTIPLE`. Missing identifiers remain `NOT_FOUND`. Titles are display data only and are never automatic match keys.
