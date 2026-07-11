# Flipkart Consignment Import

## Accepted input

Upload either the main Flipkart Consignment Details CSV or one ZIP containing it and optional references. Detection uses CSV headers, not the filename. Required logical headers are Product Name, FSN, SKU Id, and Quantity Sent. Safe casing and spacing aliases are accepted.

Quantity Sent is required work quantity. It is not stock. Quantity Received, Inwarded to Store, and QC columns do not create inventory, receiving, or QC records.

## ZIP references

Labels.csv is stored as a label-requirement reference. Quality_Check_*.csv is stored as a QC reference even when it contains headers only. README and unknown safe CSV/TXT entries are also references. They never create tasks or barcode identifiers.

ZIP limits cover compressed bytes, extracted bytes, entry count, entry name length, encryption, symlinks, traversal, nested archives, and unsafe file types. Files are stored privately under ignored storage/consignment-imports/.

## Matching

Matches are selected-account only:

1. Exact Seller SKU.
2. Exact FSN.
3. Trusted Listing ID in a future supporting parser.
4. Explicit owner choice.

SKU and FSN selecting different listings is an identifier conflict. Multiple exact results remain ambiguous. Titles are manual-search assistance only and are never auto-matched.

## Routes

An active Product Process Rule proposes the line route. Phase 2 activation permits Ready-made (PICK_PACK) and Marking (PICK_MARK_PACK). Marking requires an active linked MarkingAsset with an active MARKING_FILE version. Assembly routes remain stored by the foundation but are not activated for Flipkart consignments in this phase.

## Owner flow

Open Consignments, upload a file, review paginated lines and issues, resolve listing/route problems, and click Activate Consignment. No WorkTask exists before that explicit activation. Duplicate account/marketplace/consignment-number or source-hash uploads are blocked and linked by their existing batch identifier.

Never commit source exports or managed files.
