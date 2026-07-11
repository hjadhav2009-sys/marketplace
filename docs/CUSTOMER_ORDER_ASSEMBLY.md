# Customer Order Assembly

Open `/work/assembly` from the Work Hub. The queue is selected-account scoped, paginated to 50 tasks, and offers Ready/In progress, Assigned to me, Problems, and Completed today views.

Each card shows product and optional assembly images, SKU, quantity, AWB, Tracking ID, order/shipment references, immutable instructions, source, assignment, status, and current problem. Long instructions and identifiers wrap on small screens.

## Actions

1. **Start** atomically claims an unassigned task.
2. **Assembly Completed** completes the full order quantity. It does not pack the order.
3. **Report Problem** stores a controlled category and note while preserving assignment/progress.
4. Owners can resolve, reassign, unassign, or **Skip Assembly** with a required reason.

Two workers cannot claim the same task. Repeated completion requests are idempotent. Malformed metadata shows a safe fallback instead of crashing the queue.
