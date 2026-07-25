# Phase 7.3.6 Synthetic Complete Click Paths

All paths below use the canonical private synthetic seed. Destructive-looking
actions must operate only on the synthetic database and storage.

## Session and account paths

1. Login → invalid credentials → neutral error → valid synthetic owner login.
2. Login → disabled synthetic worker → controlled denial.
3. Account menu → switch among synthetic Flipkart, Amazon and isolation accounts.
4. Account menu → inactive account is unavailable.
5. Change Password → blank, mismatch, invalid-current and success/relogin states.
6. Logout → session-ended behavior → protected route redirects.

## Owner administration paths

1. Accounts → create form validation → edit empty account → marketplace lock
   behavior on populated account → deactivate warning → cancel.
2. Users → create/edit → permission combinations → disable/enable → account
   assignment → stale or removed access.
3. Data Management → Files, Imports, Operational, Catalog, Trash, History and
   Reset tabs → preview-only synthetic operations → typed confirmation cancel.
4. System/Cleanup → inspect counts → dry-run → validation failure → cancel.

## Product Inventory paths

1. Inventory list → search/filter/status → active/inactive/archived/error rows.
2. List → product details → empty fields toggle → gallery fallback → broken image.
3. Details → edit → stale-version validation → save/cancel.
4. New listing → required fields → invalid price/URL → valid synthetic create.
5. Refresh → choose synthetic fixture → preview/import status.
6. Process Rules → Direct Pack, Mark, Assembly, Mark then Assembly and fallback.
7. Missing Listings → issue details → Link Existing / Minimal / Full → cancel,
   validation, replay and controlled stale state.
8. SKU mappings → create/edit/delete/import/export with synthetic identifiers.

## Import paths

1. Imports → each lifecycle row: queued, mapping, running, completed,
   completed-with-warnings, failed and cancelled.
2. Job Details → status-specific buttons and progress.
3. Issues → warning/blocking filters and safe export.
4. Mapping → required mapping validation and retained-file retry.
5. Upload New → purpose/marketplace/file validation.
6. Upload Review → exact duplicate, conflicting identity, missing listing and
   activation-blocked states.

## Consignment paths

1. List → DRAFT, REVIEW_REQUIRED, READY_TO_ACTIVATE, ACTIVE and COMPLETED.
2. New → Flipkart/Amazon purpose, file validation and cancellation.
3. Batch → lines/files/assignments → safe action availability by status.
4. Review → matched/unmatched rows → blocking issue prevents activation.
5. Issues → zero quantity informational, invalid quantity blocking and missing listing.
6. Missing listing → Link Existing / Minimal / Full; quantity remains unchanged.
7. Explicit activation only after blocking issues are resolved.

## Work paths

For Orders and Consignments:

1. Work Hub → source/stage counters → stage queue.
2. Queue → group Details → member paging/search/history.
3. Claim → duplicate claimant → controlled stale/busy state.
4. Pick → choose each of four routes.
5. Saved-route override → reason required; Other → bounded text.
6. Missing Mark/Assembly instructions → warning → Cancel / Continue + optional note.
7. Mark and Assembly → exact progress/completion/problem/resolution.
8. Pack → prerequisite blocked / problem blocked / authoritative success.
9. Exact selection → bounded selection → generated nonce → retry once.
10. Scanner → lookup only → active exact / multiple / completed / no-result /
    unauthorized account → explicit action.
11. Problems → report at Pick/Mark/Assembly/Pack → resolve exact interrupted stage.
12. Permission/account removed while form is open → backend denial.

## Responsive execution matrix

Every reachable path must be exercised at:

| Width | Height |
|---:|---:|
| 360 | 800 |
| 390 | 844 |
| 430 | 932 |
| 768 | 1024 |
| 1024 | 768 |
| 1440 | 900 |

For every interaction record target, expected result, actual result, console
errors, failed requests, overflow, focus return, touch size and screenshot ID.
Current status: `BROWSER_PENDING`.

