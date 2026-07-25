# Phase 7.3.6 Synthetic State Data Catalog

Seed version: `phase-7.3.6-stage4.2-synthetic-ui-v2`.

## Accounts and users

- 4 accounts: Flipkart primary, Amazon primary, Flipkart isolation and inactive.
- 10 users: owner, import manager, two pickers, marker, assembler, two packers,
  view-all worker and disabled worker.
- Credentials are private under ignored staging storage and are not reproduced
  in this document.

## Product Inventory

- 14 listings across Flipkart primary, Amazon and account isolation.
- Route states: Direct Pack, Mark, Assembly, Mark then Assembly and no saved rule.
- Visual states: normal image, missing image, broken remote image and gallery.
- Catalog states: active, inactive, archived, refresh error and manually locked.
- Dynamic attributes: one Flipkart and one Amazon technical-key attribute.
- Identifier states: Seller SKU, FSN, Listing ID, ASIN and FNSKU, including
  cross-account same-SKU isolation.

## Orders and workflow

- 10 synthetic Orders and 10 Order tasks.
- Pick: ready, in progress and problem.
- Mark: ready and in progress.
- Assembly: ready, in progress and problem.
- Pack: ready and completed.
- One open and one resolved stage-aware problem.
- Scanner results: found active, found packed and no match.

## Consignments

- 5 batches: DRAFT, REVIEW_REQUIRED, READY_TO_ACTIVATE, ACTIVE and COMPLETED.
- 5 lines: all four routes plus held missing listing.
- Quantities: positive route quantities, zero informational issue and invalid
  blocking issue.
- Missing listing remains unactivated and creates no work.

## Imports and owner operations

- 7 Product Inventory jobs: queued, needs mapping, running, completed,
  completed with warnings, failed and cancelled.
- 1 upload batch requiring mapping.
- 2 upload issues: warning and blocking.
- 3 Consignment issues: missing listing, zero quantity and invalid quantity.
- 3 deletion-operation records: previewed, quarantined and completed.
- 2 audit records.

## Generated fixture coverage

- Flipkart 75-column-like Product Inventory.
- Flipkart 100-row and rolling 150-row Daily Orders.
- Exact/conflicting duplicate and missing-listing Orders.
- Flipkart Consignment positive/zero/invalid/missing quantities.
- Amazon All Listings-like inventory.
- Amazon technical-key category template.
- Amazon Consignment positive/zero/blank/negative/decimal/text quantities.

All identifiers, filenames and content are conspicuously synthetic.

