# Work Task Assignment

Workers may act only in active assigned accounts and only on permitted stages. Unassigned READY work is visible to eligible workers; the first progress action claims it atomically. A simultaneous second claimant receives a taken-work response and cannot add progress.

Assigned work is mutable by its assignee or an owner. Managers can assign, unassign, and reassign current or locked future stages only to active account users with the required permission. A preassigned locked task keeps that assignment when unlocked; otherwise the next stage remains unassigned. Every administrative assignment change is written to `WorkActionLog`.

All progress requests carry the expected quantity and may carry a unique client request ID. Stale quantities are rejected and repeated IDs return the original result without applying a second increment.
