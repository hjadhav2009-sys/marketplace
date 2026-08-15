# Phase 7.4C3B Professional Mark Experience Implementation Report

## Result

`PHASE_7_4C3_PROFESSIONAL_MARK_EXPERIENCE_COMPLETE`

C3B delivers the dedicated Mark worker experience and stops before C4 Assembly.

## Boundary and identity

- Required starting branch: `phase-7.4c3a2-preselected-mark-route-integrity`
- Starting final HEAD: `45b050249f157471943ff60074f38024dda3b7bc`
- Starting browser-tested runtime: `b1fedb5da9647653f2ad4cfcddf179c17c90b735`
- Starting BUILD_ID: `E3V5X-7vq_ocqLwhMCDHd`
- Implementation branch: `phase-7.4c3b-professional-mark-experience`
- C3B runtime commit: `e6861588c9302b2bd98071b5c05e295e5fa11820` (`Build the professional Mark work experience`)
- Exact final browser BUILD_ID: `iS5PbnvHDoD1UcU8HCofP`
- QA evidence commit before this report: `13288ed52defc82dcb7add0897a9cf68c1b07ddc`
- The final documentation commit containing this report is content-addressed and is therefore recorded in the push handoff and branch history rather than inside itself.

The starting boundary was clean. The required runtime was an ancestor of the required final HEAD, and the runtime-to-final change contained only `docs/ui/PHASE_7_4C3A2_PRESELECTED_MARK_ROUTE_INTEGRITY.md`. Staging was stopped, port 3188 was closed, and Prisma/mobile-app were clean before branching.

The final production build was generated from runtime commit `e6861588...`. The only later source change is a QA-only, case-insensitive assertion for visibly uppercase `POWER` and `SPEED` labels; it does not enter the application bundle. Earlier build attempts and receipts were discarded before the final synthetic reset/build, so only BUILD_ID `iS5PbnvHDoD1UcU8HCofP` is authoritative.

## Changed files

| File | Classification and purpose |
|---|---|
| `app/work/mark/page.tsx` | Replaces the generic Mark route wrapper with the dedicated Mark workspace. |
| `app/work/mark/MarkWorkspace.tsx` | Server component for permission-safe Mark page anatomy, summary metrics, source resolution, feedback, pagination, empty state, and projection-failure state. |
| `app/work/mark/MarkSourceSelector.tsx` | Small client component for the live two-source chooser; this is the only new client boundary. |
| `components/work-card/MarkingGuidance.tsx` | Server-compatible saved/manual/missing Mark guidance presentation. |
| `src/lib/workflow/mark-workspace.ts` | Pure source resolution, source labels, and existing-summary metric composition. |
| `src/lib/workflow/marking-guidance.ts` | Pure bounded guidance extraction and manual-route presentation mapping. |
| `src/lib/workflow/grouped-work.ts` | Adds presentation data needed by Mark cards and existing route-eligibility truth; does not create a completion engine. |
| `app/work/GroupedWorkCard.tsx` | Adopts Mark guidance and existing deterministic/unresolved route eligibility in the shared card adapter. |
| `app/work/WorkTaskCardView.tsx` | Adopts the same guidance and Mark action grammar for individual tasks. |
| `components/work-card/GroupedQuickActions.tsx` | Carries full Mark guidance into the existing Details overlay. |
| `components/work-card/WorkTaskQuickActions.tsx` | Carries full Mark guidance into the existing individual Details overlay. |
| `scripts/staging/seed.ts` | Adds genuine synthetic Mark states, designs/settings, manual guidance, long content, and image fixtures. |
| `scripts/qa/phase-7-4c3-browser.mjs` | Exact-build Chrome QA for the six widths and required interaction/state matrix. |
| `tests/phase-7-4c3-mark-experience.test.tsx` | Focused Mark page, guidance, route-choice, semantics, and protected-source tests. |
| `tests/phase-7-4c1a-worker-interaction-surfaces.test.tsx` | Updates only the expected hash for the already-approved current `task-store` safety implementation. |
| `package.json` | Adds `phase7.4c3:test` and `phase7.4c3:browser`; no dependency changes. |

Runtime scope is 16 files, 683 insertions, and 39 deletions. No Prisma, migration, authentication, import, report, Account, User, Pick redesign, Assembly page, or mobile-app file changed.

## Mark page anatomy

The route now presents the worker-specific title `Marking` and the instruction: `Review the product, marking instructions and quantity, then record completed work.` It retains marketplace/account context and uses the existing summary truth for four compact metrics:

- Open work
- Required quantity
- Problems
- Assigned to me

No database aggregate or new data source was introduced. `MarkWorkspace` stays a Server Component and continues to enforce existing Mark/view-all capability and selected-account checks before rendering work.

Success, error, empty, and projection states reuse `FeedbackBanner`, `EmptyState`, `Metric`, `buttonStyles`, and the existing shell primitives. Worker-facing failures do not expose raw Prisma or server diagnostics.

## Source selection

The existing marketplace/source capability remains authoritative. With only one populated source, the route resolves it directly. When both sources are active, two compact choices show:

- Customer Orders or Consignments
- open work
- required units
- problems
- assigned-to-me count
- oldest waiting time

The choices stack at mobile widths and form a restrained two-column region at larger widths. They are navigation choices, not nested dashboard cards. Live summary updates continue through the existing `work-summary-change` event.

## Card guidance and information hierarchy

C3B extends the established C1/C1A shared WorkCard; it does not rebuild it. Both grouped Order cards and individual Consignment cards retain context/status, bounded product image, title/SKU/reference, actual process flow, quantity/progress/assignment, state, actions, and disclosure.

The new Marking block exposes immediate operational facts when available:

- master design identifier and design/asset name
- material
- position
- dimensions
- power
- speed
- frequency
- passes
- one bounded instruction preview

Values are allowlisted, length-bounded, and rendered as worker-readable text. Private paths, storage paths, raw JSON, fingerprints, and internal workflow IDs are not rendered. Unknown values remain absent or explicitly `Not set`; no machine setting is fabricated.

The guidance resolver uses presentation-only precedence: immutable task metadata, immutable route snapshot facts, then the already-active legacy marking asset. It does not write or reinterpret workflow state.

## Actual process flow and completion behavior

Actual work flow remains primary. A saved product default remains quiet secondary context only when it differs. Raw route enum values are absent from worker-visible output.

- Unresolved `Pick -> Mark` work exposes the existing Process Flow overlay with `Send to Pack` and `Send to Assembly`.
- Preselected Assembly work shows `Pick -> Mark -> Assembly -> Pack` and submits normal deterministic completion to the existing service. No alternate Pack chooser is shown.
- Preselected Pack work shows `Pick -> Mark -> Pack` and submits normal deterministic completion. No alternate Assembly chooser is shown.
- The card derives selectable next stages from the existing `resolveForwardStageEligibility` result. Presentation does not infer or replace an authoritative next stage.
- Deterministic completion uses the existing `useRecommended=1` payload and authoritative server transition. Unresolved completion continues through the existing destination/reason/missing-instruction controls.

No server action, stage-transition service, route-decision policy, idempotency mechanism, or form-field contract changed.

## Missing and manual marking instructions

When Mark genuinely requires saved instructions but none are available, the card shows the blocking message `Saved marking instructions unavailable` and explains that approved manual guidance is required. Power, speed, frequency, position, dimensions, and passes are never invented.

For manual routes, the card shows a warning, a deterministic routed time, and the worker note when present. The presentation says `authorized worker` instead of leaking an internal user ID when no safe display name is available. Long manual notes preserve whitespace and wrap inside the card and Details overlay.

## Action and state grammar

- Ready/in-progress: `Marking Completed`, `Partial Quantity` when eligible, `Problem`, and `Details`.
- Unresolved completion: opens the existing Process Flow choice overlay.
- Deterministic completion: submits through the existing normal completion path without an alternate chooser.
- Problem: `Open Problem` and `Details`; no normal completion mutation.
- Read-only: `Details` plus a capability-derived explanation; work facts remain visible.
- Completed: receipt/details access only; no active completion controls return.

Partial Quantity still permits only `completed + 1` through `required - 1`. It never accepts the final unit. The existing overlay, version/idempotency inputs, post-update live refresh, focus behavior, and downstream lock rules remain intact.

## Details and images

The existing mobile full-height sheet and desktop right drawer now include the full Marking section alongside product, actual process flow, quantity, assignment, marketplace/source references, problems, prior stages, and existing history. Compact cards retain only high-value guidance; deep metadata remains in Details, with `Open full details` preserved.

The existing `WorkImageGallery`/`ProductImage` viewer is reused unchanged. Synthetic browser coverage confirms compact thumbnails, missing and broken image fallbacks, multiple images, retry behavior, mobile sheet/desktop dialog behavior, Escape, keyboard navigation, 44px controls, and trigger focus return. No image loader was added.

## Accessibility, responsive behavior, and interaction review

The final browser inspection found zero enabled controls below 44x44 CSS pixels and zero horizontal-overflow records. Existing semantic buttons/links, visible focus system, dialog labels, non-colour state text, focus containment, Escape handling, and trigger focus return were preserved. No decorative motion or animation dependency was introduced.

All six required viewports passed:

| Viewport | Records | Result |
|---|---:|---|
| 360x800 | 3 | Pass |
| 390x844 | 13 | Pass |
| 430x932 | 3 | Pass |
| 768x1024 | 3 | Pass |
| 1024x768 | 3 | Pass |
| 1440x900 | 3 | Pass |

Mobile keeps source choices stacked, product identity compact, flow and long guidance wrapping, and the approved 2x2 action grammar. Desktop retains the shared stable image/identity/quantity-guidance/action anatomy without turning settings into a large table.

The timestamp formatter is deterministic (`en-IN`, `Asia/Kolkata`) on server and client. This removed the only hydration mismatch found during browser QA; the runtime was rebuilt and the entire authoritative browser suite was rerun afterward.

## Design-skill review

- Impeccable was scoped only to the Mark route and changed shared-card surfaces. Context validation completed and the deterministic detectors returned `[]`; no broad auto-polish or source-writing tool was used.
- Taste was used only as an anti-generic critic. The result remains a subject-specific warehouse marking recipe rather than a generic dashboard: no gradients, glass, decorative cards, fake analytics, marketing composition, or motion entered C3B.
- Emil was used only for focus, overlay, and motion judgment. Existing immediate feedback, Escape/focus-return behavior, native controls, and reduced-motion posture remain; no new motion was added.

## Synthetic fixtures and browser matrix

The private synthetic seed now provides:

1. Order ready with saved instructions
2. Consignment ready with saved instructions
3. Mark in progress
4. unresolved Pack/Assembly destination
5. preselected Pack
6. preselected Assembly
7. missing instructions/manual route
8. problem
9. read-only role
10. completed receipt
11. long title/SKU/reference
12. missing and broken images
13. multi-image viewer
14. long manual note
15. assigned-to-another-worker state

The reset used only `PRIVATE_SYNTHETIC_STAGING` and reported 5 accounts, 14 users, 15 listings, 15 orders, 10 batches, 22 lines, 48 WorkTasks, 34 projections, database integrity `ok`, and `productionPathsReferenced: false`.

The final Chrome report contains 28 records and zero failures. It covers the source chooser, Order and Consignment work, saved guidance, manual/missing guidance, partial/details overlays, unresolved flow, deterministic Assembly, deterministic Pack content in the core card matrix, problem, images, read-only, completed synthetic content, marker role, no-Mark permission, empty, projection unavailable, long content, and all six widths.

Final browser diagnostics:

```text
console errors             0
page errors                0
failed requests            0
HTTP failure responses     0
horizontal overflow        0
undersized enabled targets 0
login contamination        0
```

Rapid scripted navigation can leave the existing live-update stream with a server-side aborted-stream cleanup message after the browser has moved on. It produced no browser console/page/request/HTTP failure and is not a Mark mutation or C3B runtime regression.

## Mutation safety and source validation

Passed on the final source:

- `npm.cmd run typecheck`
- `npm.cmd run lint` - 0 errors; 152 pre-existing warnings confined to checked-in Impeccable tooling
- `npm.cmd run phase7.4c1:test`
- `npm.cmd run phase7.4c1a:test`
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run phase7.4c2:test`
- `npm.cmd run phase7.4c3a:test`
- `npm.cmd run phase7.4c3a1:test`
- `npm.cmd run phase7.4c3a2:test`
- `npm.cmd run phase7.4c3:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run grouped-details:test`
- `npm.cmd run stage4-6a:test`
- `npm.cmd run stage4-6:test`
- `git diff --check`

The matrix preserves unresolved Mark to Pack/Assembly, deterministic Assembly/Pack completion, crafted preselected reroute rejection, exact-full Set/Increment rejection, valid partial progress, idempotent replay, stale-state rejection, assignment/account isolation, stage permissions, view-only/owner compatibility, Pick safeguards, and Pack prerequisites.

One attempted parallel rerun collided because C3 and C3A.1 use the same disposable SQLite filename. After the short-lived test processes exited, every suite was rerun sequentially and passed. This was fixture ownership during test orchestration, not an application failure.

## Performance and protected boundaries

- Dependencies added: none.
- New client modules: one (`MarkSourceSelector`) for live source-summary updates. `MarkWorkspace`, `MarkingGuidance`, and both new workflow helpers remain server-compatible.
- Existing shared client cards/overlays received presentation data only; `AppShell` and permission computation remain server-authoritative.
- No new form, state, component, icon, animation, or image package.
- No new completion engine or client-side business decision.
- Server actions and workflow transition services are unchanged.
- Authentication, authorization, selected-account behavior, route destinations, quantities, idempotency, problems, imports, reports, and packing behavior are unchanged.
- Prisma schema, migrations, and configuration are unchanged.
- PostgreSQL was not accessed or migrated.
- `mobile-app` is unchanged.
- No real data or production path was accessed.

## Final lifecycle and disposition

- Exact browser-tested runtime SHA: `e6861588c9302b2bd98071b5c05e295e5fa11820`
- Exact BUILD_ID: `iS5PbnvHDoD1UcU8HCofP`
- Route count: `123`
- Database identity: `SYNTHETIC_ONLY`
- Browser engine: installed Google Chrome with repository `playwright-core`
- Host: `127.0.0.1:3188`; no tunnel
- Final staging state: `STOPPED`, PID `null`, `portOpen: false`
- Port 3188 listeners: `0`
- Worktree: clean before this report; the final handoff records the clean post-report state
- Push: final handoff records the exact remote branch SHA
- PR: not created
- Merge/deployment: not performed
- C4 Assembly: not started

C3B is complete and stops here.
