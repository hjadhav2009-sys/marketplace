# Phase 7.4C2 Pick Experience Report

Result: `PHASE_7_4C2_PROFESSIONAL_PICK_EXPERIENCE_COMPLETE`

## Boundary and identity

- Starting completed branch: `phase-7.4c1a1-interaction-truth-closure`
- Starting final HEAD: `95d622a8dd0bee25dd08c91cb49068b6b0447cfe`
- Starting browser-tested runtime: `47cdfd1af7a33a1dec87ee6f95c581976a031ed2`
- Starting BUILD_ID: `MS3b0xcDGISJbZMWDPHWc`
- Implementation branch: `phase-7.4c2-professional-pick-experience`
- Exact final browser-tested runtime: `065b9519e3a1aa74b7d9c064dfdc3d09a7eb12e6`
- Exact final BUILD_ID: `1EGWkxn4chvBfr-67uYA-`
- Runtime commit: `065b9519e3a1aa74b7d9c064dfdc3d09a7eb12e6` (`Refine the professional Pick worker experience`)
- Final branch HEAD: the later QA/documentation commit containing this report; the pushed SHA is recorded in the completion output because a commit cannot contain its own hash.
- C1A.1 documentation correction: the historical C1A browser runtime now reads `aa21bf9f3b52b8bec71b7bc02d5285e7fbe0522e`; the C1A.1 runtime and BUILD_ID were not changed.

## Changed runtime and presentation files

- `app/work/pick/page.tsx`: delegates Pick to its bounded workspace.
- `app/work/pick/PickWorkspace.tsx`: server-authoritative page topology, capability filtering, feedback, empty/failure states, queue context, and pagination.
- `app/work/pick/PickSourceSelector.tsx`: the only new client module; preserves live summary updates and normal link behavior.
- `src/lib/workflow/pick-workspace.ts`: pure supported/active/requested source resolution.
- `app/work/GroupedWorkCard.tsx`: Pick-only identity, quantity, state copy, and odd-action balancing hooks on the approved shared card.
- `components/work-card/WorkCardSections.tsx`: optional class extension for the existing shared action grid.
- `app/work/consignments/pick/page.tsx`: canonical redirect plus narrow search/history compatibility.
- `lib/app-navigation.ts`: one canonical Pick entry for owners and authorized workers.
- `lib/dashboard.ts`: Pick entry no longer hard-codes Daily Orders, so a Consignment-only marketplace reaches the valid workspace.
- `app/owner/consignments/[batchId]/page.tsx` and `app/owner/manual-review/page.tsx`: safe canonical Consignment Pick destinations.

No shared card anatomy, overlay implementation, Details surface, image viewer, Partial Quantity form, Problem service, or Process Flow service was replaced.

## Canonical route and legacy compatibility

`/work/pick` is the canonical workspace. It accepts the unchanged internal source values:

- `/work/pick?source=ORDER`
- `/work/pick?source=CONSIGNMENT`

Owner and worker navigation now expose one `Pick` link to `/work/pick`. The worker permission model remains server-created; no possible-route list was moved to the client.

The normal active `/work/consignments/pick` queue redirects to `/work/pick?source=CONSIGNMENT`, preserving `page`, `success`, and `error` when present. Exact search (`q`) and non-active problem/completed status views retain the individual-task queue as a narrow compatibility route because those workflows are not represented by grouped active-queue pagination. Permanent individual Details URLs and return-path validation remain unchanged. No normal navigation exposes the compatibility queue.

## Marketplace capability and source selection

The page uses `marketplaceCapabilities()` before card counts. Supported sources and active sources are separate concepts.

- One supported source opens directly, including a truthful source-specific empty state.
- With two supported sources and one active source, the active source opens and the compact selector keeps the other supported source inspectable.
- With both active, Customer Orders is the stable initial source and both remain switchable inside the workspace.
- With no active source and no explicit supported request, one true Pick empty state is shown.
- An explicitly requested supported empty source shows that source's empty state.
- An unsupported request is never exposed and falls back to a supported source when one exists.

Synthetic results:

- Flipkart: Customer Orders and Consignments both render and switch without leaving `/work/pick`; selected account, identity, permissions, and query source remain intact.
- Amazon: only Consignments render; an explicit `source=ORDER` request safely resolves to Consignments and no `Customer Orders 0` control appears.
- Marketplace with no supported Pick source: a truthful unavailable empty state, with no invented action.

## Page composition and worker copy

The top region is PageHeader, live connection status, one compact source selector when needed, then queue context and the first actionable card. The old `LiveStageSummary` plus large `SourceCard` choice is not used by Pick.

- Eyebrow: marketplace and seller account.
- Title: Pick.
- Description: exact item/quantity instruction and the Process Flow completion consequence.
- Selector: human labels, items, units, problems only when non-zero, and assigned-to-me only when useful.
- Queue: source heading, item/unit context, page number, then the approved WorkCards.
- Pagination: server-side Previous/Next links preserve source and maintain 44px targets.

Pick cards use `PICK QUANTITY` with required, done, and remaining values. Pick-only states are `Ready to pick`, `Picking in progress`, `Work paused`, and `Read-only Pick view`. A partially picked card with missing instructions keeps `Picking in progress` as the headline while retaining the exact warning and acknowledgement requirement.

Customer Order identity prioritizes product, Seller SKU, Order Item, and tracking/package reference. Consignment identity prioritizes product, Seller SKU, external Consignment reference, and an operational barcode only when distinct. Internal ConsignmentLine IDs are not the dominant Pick identity.

## Actions, Process Flow, Details, Problems, and image

The shared action matrix remains authoritative:

- Remaining greater than one: Complete Pick, Partial Quantity, Problem, Details.
- Remaining one: Complete Pick, Problem, Details; the final odd action spans the action grid for a balanced 44px layout.
- Problem: Open Problem and Details; completion and Partial Quantity are suppressed.
- Read-only: Details, with Open Problem available only as read-only problem inspection on a problem card.
- Completed: existing read-only receipt/Details behavior.

Complete Pick still opens the C1A.1 Process Flow bottom sheet on mobile and compact dialog on desktop. It preserves all four valid human-readable flows, actual versus saved/default/fallback context, authoritative override reason policy, missing-instruction acknowledgement, optional note, and final explicit submit. No route codes render on the Pick page or overlay.

Partial Quantity reuses the C1A.1 surface and bounds: `completed + 1` through `required - 1`, only while remaining is greater than one. The protected backend guard against crafted exact-full generic Pick progress remains unchanged and was rerun.

Details remains a mobile sheet/desktop drawer with the permanent deep link. Problem truth, permissions, history, and image/lightbox keyboard behavior remain inherited from C1A.1.

## Feedback, empty, and fail-closed states

- Success uses `FeedbackBanner` with polite status semantics.
- Immediate action error uses `FeedbackBanner` with alert semantics and the authoritative query error.
- Projection failure uses the concise warning `Pick queue temporarily unavailable` and hides queue actions; it does not auto-rebuild or expose command-line repair copy to the worker.
- True empty uses `EmptyState`: `No Pick work right now`.
- Explicit empty source uses `No Customer Order Pick work` or `No Consignment Pick work`.

## Role and permission browser matrix

- OWNER: both supported Flipkart sources, account switching, all permitted actions.
- Picker with `canPick`: actionable assigned/unassigned visible work with Complete Pick/Partial/Problem/Details as applicable.
- View-all without `canPick`: read-only Pick state; no Complete, Partial, or report-Problem mutation action. Existing problem inspection remains available.
- Worker without Pick or view-all: redirected by the existing capability policy; no mutation controls render.

Authorization and account selection remain server-side and backend-authoritative.

## Synthetic mutation safety

The new isolated C2 mutation suite and inherited C1A.1 suite prove:

1. Order Pick to direct Pack creates one ready Pack task.
2. Order Pick to Mark creates ready Mark and locked Pack work.
3. Consignment partial progress persists an in-progress bounded quantity.
4. Consignment completion from system fallback creates ready Pack work and records fallback decision type.
5. Explicit saved-default override requires a reason and records `OVERRIDDEN_SAVED_ROUTE`.
6. Missing Mark instructions reject unconfirmed completion and pass only with the existing confirmation, with `MARK` recorded as missing.
7. Replayed completion is idempotent with one action log and one route decision.
8. A stale expected quantity is rejected.

The suite additionally checks one completion receipt/log per completed Pick, correct downstream lock state, and no cross-account effect. It runs on a temporary SQLite database created from the repository migrations and removes it afterward. The final unit is still forbidden through generic partial/increment paths by the inherited C1A.1 test.

## Browser evidence

- Environment: `PRIVATE_SYNTHETIC_STAGING`
- Host: `127.0.0.1:3188`
- Engine: installed Google Chrome through repository `playwright-core`
- Exact runtime: `065b9519e3a1aa74b7d9c064dfdc3d09a7eb12e6`
- BUILD_ID: `1EGWkxn4chvBfr-67uYA-`
- Final C2 records: 24/24 passed, including separately exercised read-only Order and Consignment Pick states.
- Six exact widths: 360x800, 390x844, 430x932, 768x1024, 1024x768, 1440x900.
- 200% reflow equivalents: 320, 384, 512, and 720 CSS-pixel layouts representing the requested 390, 768, 1024, and 1440 contexts.
- Horizontal overflow: 0 records.
- Undersized enabled Pick controls: 0.
- Raw route codes: 0.
- Console errors: 0.
- Page errors: 0.
- Unexpected failed requests: 0.
- Unexpected HTTP failures: 0.
- Normal-worker visible competing Pick queue links: 0.
- Source-switch keyboard activation: passed.
- Process Flow focus entry, Escape, and focus return: passed.
- Owner-review screenshots: ignored under `.codex-tmp/phase-7-4c2/owner-review/`; mobile Order, Consignment, selector, ready/in-progress/problem content, Process Flow, Amazon, true empty, and desktop Order/Consignment are represented.

The first browser run found one real copy issue: missing-instruction warning priority hid `Picking in progress`. The runtime was corrected and rebuilt. Other first-run failures were harness false negatives: the closed mobile drawer intentionally has no visible current link, and read-only Open Problem is inspection rather than mutation. The corrected final matrix is 24/24, with read-only Order and Consignment Pick states covered independently.

## Design review

- Impeccable primary review: scoped source detector returned zero findings on the Pick workspace, selector, Pick card adapter, action hook, and source resolver. Its URL scanner required an uninstalled Puppeteer package; no dependency was added. Equivalent rendered-page checks were completed with the repository's existing Playwright/Chrome path.
- Impeccable audit health: Accessibility 4/4, Performance 4/4, Responsive 4/4, Theming 4/4, Implementation integrity 4/4; total 20/20 for the bounded Pick scope.
- Emil review: actions remain adjacent to exact work; Process Flow remains an explicit interruption with correct focus entry/return; source switching is a normal link; no new decorative or blocking motion was introduced.
- Taste review: the source control is operational rather than dashboard-like; no gradients, glass, giant type, nested dashboard cards, hover scaling, generated imagery, or generic decorative metrics were introduced.
- False positives/limitations: closed mobile drawer yields zero visible `aria-current=page` until opened; read-only problem inspection legitimately includes Open Problem; Impeccable URL scan was unavailable without adding Puppeteer.

## Performance and dependencies

- New runtime dependencies: none.
- New animation, form, icon, or state library: none.
- New client modules: one small `PickSourceSelector` using the existing live summary custom event.
- Pick page, source resolution, permissions, data loading, and pagination remain server-side.
- No eager large-image loading was added.

## Validation

Passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint` (0 errors; existing Impeccable-tool warnings only)
- `npm.cmd run phase7.4c1:test`
- `npm.cmd run phase7.4c1a:test`
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run phase7.4c2:test`
- `npm.cmd run stage4-ui:test`
- `npm.cmd run stage4-6a:test`
- `npm.cmd run stage4-6:test`
- `npm.cmd run grouped-details:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `git diff --check`

Production build lifecycle note: an initial exact build succeeded, then the mandatory synthetic reset removed its staging receipt. The lifecycle guard correctly refused to start an unreceipted build, so the unchanged commit was rebuilt. The first browser pass then found the Pick progress-copy issue described above, producing the final amended runtime and final exact build. All final evidence is tied only to runtime `065b9519...` and BUILD_ID `1EGWkxn4chvBfr-67uYA-`.

## Protected boundaries and final state

Byte-identical protected files were asserted by SHA-256 in `phase7.4c2:test`:

- `route-decision-policy.ts`
- `route-selection.ts`
- `grouped-transition.ts`
- `grouped-progress.ts`
- `stage-transition.ts`
- `order-pack-scope.ts`
- `order-problems.ts`
- `task-store.ts`

Also unchanged:

- Prisma schemas and migrations.
- Packing services.
- Problem services.
- Authentication, sessions, permissions, assignment, quantity semantics, route policy, idempotency, and projection write logic.
- `mobile-app`.
- Runtime dependencies.

Only private synthetic staging data was prepared. No real data, production storage, public tunnel, PostgreSQL migration, merge, deployment, PR, C3, C4, or C5 work occurred.

Final shutdown:

- Staging: stopped.
- Port 3188: no listening process; only transient `TIME_WAIT` sockets remained immediately after shutdown.
- Push target: `phase-7.4c2-professional-pick-experience` only.
- Push result: successful; the local branch tracks `origin/phase-7.4c2-professional-pick-experience`. No PR was opened.
