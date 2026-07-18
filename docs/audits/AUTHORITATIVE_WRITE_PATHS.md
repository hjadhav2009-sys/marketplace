# Authoritative Write Paths

- Pick routing: `route-selection.ts` or the shared grouped/stage transition engine.
- Order Mark/Assembly: reviewed Order route services with snapshots, projections, events and action logs.
- Customer package Pack: `order-pack-scope.ts`.
- Consignment Pack: `completeConsignmentPackTasksInTransaction()` through its authenticated receipt-backed wrapper.
- Stage-aware Order problems: `order-problems.ts`.
- Consignment task problems: `task-store.ts`.
- Product Inventory: `product-inventory/merge.ts` through a lease-owning runner.
- Flipkart Orders: `marketplaces/flipkart/import.ts`, with active-work identity conflict checks.

`tests/authoritative-write-paths.test.ts` inventories sensitive mutation files. A new direct write requires explicit review of account scope, transactions, idempotency, history, projections and live events.

Legacy `/picker` actions and mobile SKU-group mutations are retired. Import-status GET and import progress pages are read-only.

Worker reads never repair all projections. `refreshAffectedWorkGroups()` is the bounded mutation-time path; `work-projection:repair` and the confirmation-gated rebuild command are administrative paths. Account marketplace changes and deactivation go through `account-lifecycle.ts`. Login/setup/reset throttles go through database-backed `security-throttle.ts`.
