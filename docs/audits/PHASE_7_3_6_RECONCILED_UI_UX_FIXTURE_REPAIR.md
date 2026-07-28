# Phase 7.3.6 Reconciled UI/UX Fixture Repair

## Reason

Several historical screenshots were valid PNG files but did not visibly prove
their scenario names. This is an evidence-fixture defect, not proof of a
production workflow defect.

## Corrected synthetic states

| State | Correction |
|---|---|
| `MARK_COMPLETED` | Added an exact completed Consignment Mark task with completed quantity, actor and timestamp; route opens real task history. |
| `ASSEMBLY_COMPLETED` | Added an exact completed Consignment Assembly task with completed quantity, actor and timestamp; route opens real task history. |
| `PACK_ASSEMBLY_LOCKED` | Added a real Order plan with completed Pick, pending Assembly and locked Pack; route opens package Details and must hide Confirm packed. |
| `SCANNER_COMPLETED` | Corrected scanner routes from unsupported `code` to the production `q` parameter; the packed candidate is read-only. |
| `PROBLEM_OPEN` | Corrected the route to the real owner Order-problem page with a real open problem. |
| `PROBLEM_RESOLVED` | Corrected the route to the resolved Order-problem tab with a real resolved problem. |
| `OWNER_EMPTY_ACCOUNT` | Capture temporarily marks only synthetic accounts inactive, opens the production account chooser, asserts the owner-specific first-account state, then restores every original active flag. |
| Product image states | Added authenticated local synthetic PNGs; valid/gallery states no longer depend on unreachable external hosts. |
| One/multiple/Amazon file states | Added bounded synthetic files and real browser file-input selection before capture. |

## Evidence assertions

The browser capture now fails instead of creating a misleading screenshot when
required text or controls are absent. Assertions cover:

- completed Mark and Assembly history;
- pending Assembly Pack blocker and absence of Confirm packed;
- completed scanner result and read-only copy;
- open/resolved problem content;
- owner zero-account copy and Create First Seller Account action;
- exact selected-file counts;
- loaded local Product Inventory image.

## Automated verification

- `npm.cmd run staging:test`: passed, 66 assertions.
- `npm.cmd run stage4-5:test`: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `git diff --check`: passed.

Browser recapture is intentionally pending until this source is committed and
a matching production build ID exists. Historical screenshots are preserved.

## Safety

- Synthetic staging only.
- No real database or real storage access.
- No schema migration.
- No workflow service change.
- No mobile-app change.
- No push, merge or deployment.

