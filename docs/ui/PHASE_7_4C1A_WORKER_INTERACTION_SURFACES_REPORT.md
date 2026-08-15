# Phase 7.4C1A — Worker Interaction Surfaces Report

Result: `PHASE_7_4C1A_WORKER_INTERACTION_SURFACES_COMPLETE`

## Identity and scope

- Starting branch: `phase-7.4c1-professional-work-card-foundation`
- Starting HEAD: `6103623ca16f97c337fc39e7b179f2857f77ee2b`
- Starting browser-tested runtime: `c50790bef97dea76d6788444e639463cb68dce5f`
- Starting BUILD_ID: `Kn1p4O8QVNBcHwRayMxJT`
- Implementation branch: `phase-7.4c1a-worker-interaction-surfaces`
- Runtime commits: `81cb6e3 Add shared worker interaction surfaces`; `0129c35 Close worker overlay focus regression`; `aa21bf9 Complete worker details truth states`
- Final browser-tested runtime: `aa21bf9f3b52b8bec71b7bc02d5285e7fbe0522e`
- Final BUILD_ID: `fZtN7_qir5U_s7xXJY1FU`
- Final branch HEAD: the documentation-only closure commit containing this report; the runtime identity above is unchanged by it.

This checkpoint changed only shared worker-card interaction infrastructure, bounded quick-read presentation, representative grouped/task adapters, focused tests, and browser QA. It did not begin C2 or redesign any stage page.

## Owner evidence and independent reviews

The seven supplied C1 screenshots showed a sound card grammar with four remaining shared interaction issues: tall quantity treatment, machine route codes, route/details/problem navigation friction, and duplicated secondary disclosures. Three bounded pre-implementation reviewers independently mapped visual hierarchy, overlay/accessibility behavior, and business/action parity. Their shared direction was to retain C1 topology, use one overlay owner, preserve every hidden field/action, and adapt grouped Order problem reporting to the existing authoritative service rather than inventing group mutation behavior.

A fresh post-browser reviewer inspected all nine retained C1A screenshots and returned PASS. It confirmed meaningful density gain, human Process Flow, correct mobile/desktop spatial models, removal of the duplicate disclosure, restrained motion, and product-specific warehouse hierarchy. Its P2 request to show known missing instructions in quick Details was corrected before the final runtime. Its evidence-only request for direct Partial Quantity and Problem checks at desktop was also closed in the final 81-record browser run. The extreme synthetic long-title layout remains intentionally verbose but wraps safely; stage-specific copy density can be reconsidered only in the later authorized stage phases.

## Skills and design authority

- Impeccable: primary Operate-mode hierarchy, responsive, accessibility, and finish guard.
- Emil design engineering: overlay focus, interruption, motion, and interaction judgment.
- Frontend Design / Taste / GPT-Taste: anti-generic review only, subordinate to product truth, accessibility, and worker speed.
- Web Interface Guidelines: current accessibility and interaction review criteria.

No image generation, broad auto-polish, landing-page rules, GSAP treatment, or source-writing design tool was used.

## Runtime files

Changed adapters/integration: `app/work/GroupedWorkCard.tsx`, `app/work/SmartStagePage.tsx`, `app/work/WorkTaskCardView.tsx`, `components/AppShell.tsx`, `components/MobileOverlayCoordinator.tsx`, `components/WorkImageGallery.tsx`, `components/work-card/WorkCard.tsx`, `components/work-card/WorkCardQuantity.tsx`, and `components/work-card/index.ts`.

New primitives/islands: `components/worker-overlay/WorkerOverlay.tsx`, `components/work-card/WorkProcessFlow.tsx`, `components/work-card/WorkRouteDialogC1A.tsx`, `components/work-card/GroupedQuickActions.tsx`, and `components/work-card/WorkTaskQuickActions.tsx`.

Bounded adapters: `app/api/work/groups/[stage]/[groupKey]/route.ts` adds an authorized 25-member/5-history quick projection; `app/work/stage-actions.ts` delegates exact grouped problem reports to the existing Consignment or Order problem service and accepts a strictly internal `/work/` progress return path. No mutation service was created.

## Interaction architecture

`WorkerOverlayProvider` owns exactly one of IMAGE, PROCESS_FLOW, PARTIAL_QUANTITY, PROBLEM, or DETAILS. It portals outside the inert application root, uses a semantic modal dialog, labels it from the heading, focuses the title, contains Tab and Shift+Tab, closes on Escape/backdrop/Back, restores the exact trigger or the safe main-content fallback after live replacement, locks body scrolling, and always removes inertness on close/unmount. Custom events preserve exclusivity with the existing mobile navigation/account overlay coordinator.

Below 768px the surface is a bottom sheet with a 90dvh ceiling and internal scrolling. At 768px and above, Process Flow/Partial/Problem are compact dialogs, Details is a flush right drawer, and image preview is a restrained lightbox. No nested overlays or swipe affordance is implied.

No animation dependency or decorative motion was added. Existing focus-visible behavior remains authoritative. New client modules are limited to the overlay provider and the small Process Flow/grouped/task quick-action islands; AppShell remains a Server Component and passes server-rendered children through the provider.

## Process Flow and routing parity

Worker-facing labels are `Pick → Pack`, `Pick → Mark → Pack`, `Pick → Assembly → Pack`, and `Pick → Mark → Assembly → Pack`; raw codes are not primary UI. Earlier/current/future stage treatment is shared across Pick, Mark, Assembly, and Pack. Pack is read-only. Only current valid forward choices are exposed.

The same existing completion actions and fields remain in use. True explicit-route overrides show the existing `ROUTE_CHANGE_REASONS` as one-tap choices in the same surface; only Other reveals bounded text. System fallback needs no reason. Missing-instruction acknowledgement, optional worker note, group/task identity, version/quantity, route, next stage, request ID, and exact mutation labels remain intact. No request/approval wording was introduced and `ownerApprovalRequired = false` semantics remain untouched.

## Quantity, image, Details, and Problem

Quantity now uses one compact required/completed/remaining line, a thin progress rule, and one assignment line. Assignment was removed from competing compact identity metadata. Package mode and invalid-quantity blocking remain unchanged.

Partial Quantity opens in the shared surface and submits to the existing `setGroupedProgressAction` or byte-identical `setTaskProgressAction` with the existing IDs, expected values, versions, request IDs, and return semantics. Browser QA opened but did not submit mutations.

Compact images retain the C1 unavailable-image behavior and now open responsive preview. The preview supports Previous/Next and ArrowLeft/ArrowRight when multiple sources exist, Escape, focus return, and 44px controls. No large media is eagerly fetched merely to render the card.

Details opens without queue navigation, contains Product, human Process Flow, Quantity/assignment, ordered identifiers, truthful Instructions or the known missing-instruction warning, current Problem, bounded recent history, and `Open full details` to the unchanged deep link. The permanent `Identifiers and work context` competitor was removed.

Problem opens only authorized existing fields and never mutates on open. Multi-member groups require an exact actionable task selection. Order and Consignment submissions delegate to their existing authoritative services. Open Problem is read-focused and includes reason, affected reference/stage, progress, assignment, reporter, and reported time when available; it does not expose Resolve/Reassign.

## Density evidence

C1 owner evidence at 390px recorded approximately 598px ready, 618px in-progress, 546px problem, and 144px for the old quantity block. Final C1A Order cards at 390px measured 554.3px ready, 554.3px in-progress, 502.3px problem, and 94px quantity; action regions were 96px ready/in-progress and 44px problem, with 96px media. The long-content Consignment problem stress card measured 682.3px because its deliberately extreme title/reference remains fully visible; it had the same 94px quantity and no overflow. At 1440px representative Order cards measured 385px.

The goal was meaningful density reduction without hiding truth, not a fixed height. Required/completed/remaining, assignment, flow, state, instructions, and actions remain visible.

## Browser evidence

- Engine: installed Google Chrome through repository `playwright-core`.
- Environment: `PRIVATE_SYNTHETIC_STAGING`, `http://127.0.0.1:3188` only.
- Exact identity: runtime `aa21bf9f3b52b8bec71b7bc02d5285e7fbe0522e`, BUILD_ID `fZtN7_qir5U_s7xXJY1FU`.
- Final records: 81 passed, 0 failed.
- Widths: 360×800, 390×844, 430×932, 768×1024, 1024×768, 1440×900.
- 200% equivalents: 390, 768, 1024, and 1440 classes all passed.
- States: grouped Pick/Mark/Assembly/Pack, individual Mark/Assembly/Pack, Consignment ready/problem/read-only, Process Flow and Details at every width, Partial Quantity and Problem at 390/1440, and image preview at 390.
- Operational controls below 44×44: 0.
- Document/overlay horizontal overflow failures: 0.
- Raw route codes in primary UI: 0.
- Duplicate identifier disclosures: 0.
- Console errors: 0; page errors: 0; failed requests: 0; HTTP responses ≥400: 0.
- Keyboard: initial focus, Tab, Shift+Tab, Escape, focus return/fallback, background inertness, and inert cleanup passed. Source coverage additionally preserves browser Back cleanup and one-overlay ownership.
- Synthetic forms were inspected but destructive/problem/progress actions were not submitted.

Ignored owner-review screenshots are retained in `.codex-tmp/phase-7-4c1a/owner-review/`: 390 Pick Ready, Process Flow, Partial Quantity, Problem, Details, Image Preview; and 1440 Pick, Process Flow, Details.

## Impeccable, Taste, and Emil

The scoped Impeccable detector returned four `gray-on-color` warnings in conditional class expressions in `WorkRouteDialogC1A.tsx`. Three combine colors from mutually exclusive branches. The remaining `text-slate-600` on `bg-teal-50` computes to 7.27:1 and is visibly strong in browser evidence. All four were verified false positives; the palette was not changed to silence the detector. Technical audit: Accessibility 4, Performance 4, Responsive 4, Theming 3, Implementation Integrity 4 = 19/20 (Excellent).

Taste found a restrained warehouse operations hierarchy rather than a generic dashboard: context, product, flow, quantity, blockers, and mutation actions dominate; no gradients, glass, decorative pills, giant typography, or fake data visualization entered. Emil confirmed no entrance choreography, springs, hover scaling, or route transitions; interaction remains immediate and interruptible.

## Validation and safety ledger

Passed: `typecheck`; lint with 0 errors (152 pre-existing warnings only in checked-in Impeccable tooling); `phase7.4b1a:test`; `phase7.4b1b:test`; `phase7.4b2:test`; `phase7.4b3:test`; `phase7.4c1:test`; `phase7.4c1a:test`; `stage4-ui:test`; `stage4-6a:test`; `stage4-6:test`; `grouped-details:test`; `direct-stage-actions:test`; `workflow:test`; production/staging build; final Chrome matrix; and `git diff --check`.

Protected hashes for route-decision policy, route selection, grouped transition/progress, task store, pack safety, worker access, Prisma schema, and individual task actions remain exact. Permissions, account isolation, assignments, quantities, idempotency, route prerequisites, packing safety, imports, projections, and database behavior are unchanged.

- Dependencies added: none; `package-lock.json` unchanged.
- Prisma/schema/migrations/configuration: unchanged.
- `mobile-app`: unchanged.
- Real/production data and storage: untouched; only the private synthetic SQLite/storage fixture was used.
- Staging: stopped after validation.
- Port 3188: closed (only transient `TIME_WAIT` entries may remain; no listener).
- Push result: branch pushed to `origin/phase-7.4c1a-worker-interaction-surfaces`; no PR, merge, deployment, or C2 work.
- Worktree: clean after the documentation commit.

## Final result

`PHASE_7_4C1A_WORKER_INTERACTION_SURFACES_COMPLETE`

C1A stops here. C2 is not started.
