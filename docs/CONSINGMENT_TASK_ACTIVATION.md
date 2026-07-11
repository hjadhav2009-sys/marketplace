# Consignment Task Activation

Activation is an explicit owner or canManageConsignments operation. The server claims only a READY_TO_ACTIVATE selected-account batch, then validates and writes everything in one transaction.

Validation requires positive whole required quantities, one resolved listing, account consistency, an active supported process rule, and required marking data. Activation writes title/image/SKU/FSN/listing snapshots so later Listing Master edits do not rewrite history.

For PICK_PACK, activation creates PICK READY then PACK LOCKED. For PICK_MARK_PACK, it creates PICK READY, MARK LOCKED, then PACK LOCKED. Every task carries the same required work quantity. Unique source-stage and source-sequence indexes plus the guarded status claim make double-click and stale activation idempotent.

The transition core uses expected status and completed quantity in guarded updates. It rejects LOCKED/PROBLEM tasks, negative/non-integer/over-limit values, and cross-account or unauthorized mutations. Completion unlocks only the next sequence. Scanning alone never mutates a task.

Existing customer Orders receive no tasks. Phase 3 will add consignment worker pages and invoke the transition service.
