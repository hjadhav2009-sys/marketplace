# Query Plan Review

`scripts/phase7-query-plan.ts` builds a fake migrated SQLite database and fails if reviewed exact queries use a table scan.

Observed plans use:

- Order AWB: unique account/AWB index.
- Order Tracking ID: `Order_tracking_account_idx`.
- Listing identifier: `MarketplaceListingIdentifier_type_value_account_idx`.
- Work queue: `WorkTask_account_source_stage_status_idx`.
- Assignment queue: `WorkTask_account_assignee_stage_status_idx`.
- Amazon snapshot FNSKU: `ConsignmentLine_accountId_fnskuSnapshot_idx`.

No new index was justified. SQLite and PostgreSQL schemas already contain the matching index declarations and remain aligned.
