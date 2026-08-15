# Phase 7.4C1A.1 — Interaction Truth Closure

## Boundary and identity

- Starting final HEAD: `6b3724e305955c12d167f72d594f58de8fe7b4fb`
- Starting browser-tested runtime: `aa21bf90a0bcaaeff2ad8e39a6b8b00638c65146`
- Starting BUILD_ID: `fZtN7_qir5U_s7xXJY1FU`
- Branch: `phase-7.4c1a1-interaction-truth-closure`
- Runtime commit: `47cdfd1af7a33a1dec87ee6f95c581976a031ed2`
- Final exact-build BUILD_ID: `MS3b0xcDGISJbZMWDPHWc`
- Final branch HEAD: recorded in the final handoff because a commit cannot contain its own SHA
- Push result: recorded in the final handoff after the remote operation completes

The runtime diff remains inside the authorized worker interaction family. No Dashboard, Product Inventory, import, authentication, Packing service, Prisma, migration, dependency, or mobile-app files changed.

## Findings closed

### Actual flow and saved default

The card read path previously passed the saved product route everywhere. A saved `PICK_PACK` default could therefore masquerade as the actual `PICK_MARK_ASSEMBLE_PACK` route after a worker choice. It also caused route-irrelevant missing-instruction warnings.

`src/lib/workflow/work-route-presentation.ts` now provides a pure, server-compatible presentation resolver. It safely parses length-bounded, allowlisted route data and resolves in this order:

1. explicit actual selection;
2. explicit actual process route;
3. a complete supported actual-stage chain;
4. current metadata route;
5. saved product default;
6. Pick-to-Pack system fallback.

The task's real `currentStage` remains authoritative. Snapshot current-stage data cannot override it. Malformed, oversized, unknown, duplicate, or ambiguous partial route evidence degrades safely rather than inventing a stage.

Compact cards and Quick Details now use the actual presentation route. The Process Flow chooser retains the separate saved default for recommendation and route-reason policy. When actual and saved differ, the overlay labels them as `Current work flow` and `Saved product default`.

`WorkProcessFlow` no longer maps a missing stage index to Pick. A legacy mismatch displays the true current stage and announces that it is not represented in the flow; no node is falsely marked current or completed.

### Route choices and instruction truth

- Mark-to-Pack displays `Pick → Mark → Pack`.
- Mark-to-Assembly displays `Pick → Mark → Assembly → Pack`.
- Compact-card and Details warnings use only missing Mark/Assembly instructions required by the current actual route.
- Direct Pack therefore has no irrelevant Mark/Assembly warning.
- The chooser still receives all optional missing-stage information, so selecting Mark or Assembly retains the existing acknowledgement.
- Instruction/note copy and a required missing-instruction warning render independently; one can no longer hide the other.

### Partial Quantity and Pick completion safety

The bypass was reproduced before the guard: individual `SET_PROGRESS`/`INCREMENT` could target the required Pick quantity, mark Pick complete, and unlock downstream work without Process Flow.

Active callers were inventoried. No approved active caller requires non-`COMPLETE` Pick progress to reach the exact required quantity. The only protected-service change is one guard in `task-store.ts`, after exact replay handling and before mutation:

```ts
if (task.stage === "PICK" && requestKind !== "COMPLETE" && targetQuantity === task.requiredQuantity) {
  throw new Error("Use Complete Pick and choose a processing flow to finish picking.");
}
```

Over-range submissions retain the established range error. Mark, Assembly, Pack, legitimate Pick partials, explicit Pick completion, and idempotent replay behavior are unchanged.

The individual Partial control is now available only when more than one unit remains. Its range is `completed + 1` through `required - 1`, with `completed + 1` as the default.

### Mutation IDs and individual Mark

Individual quick actions no longer use React `useId()` as the mutation identity. `WorkTaskCardView` creates a server-rendered base from task ID, task version, and `randomUUID()`, then uses stable `:partial`, `:problem`, and `:route` suffixes for the displayed forms.

`app/work/quick-route-actions.ts` is a thin MARK-only server-action adapter. It delegates to the existing protected `completeStageAndChooseNext()` service and preserves account authorization, task/version/quantity, destination, saved-route reason, Other reason, note, missing-instruction acknowledgement, request ID, and return path.

The existing protected service rejects destinations already present in modern full planned-stage snapshots. The UI therefore exposes the Mark chooser only when more than one currently service-compatible forward choice remains. Modern full-plan Mark tasks retain their existing completion action; compatible visited-prefix tasks receive Process Flow parity. No transition service or business route was changed.

### Image keyboard

Multi-image preview mounts one local `window` key listener while the preview exists. ArrowLeft and ArrowRight work from the initially focused dialog title, close button, or preview controls. The listener is not installed for single-image preview and is removed on unmount. Escape, Tab, Shift+Tab, focus return, history cleanup, inert background, and overlay exclusivity remain owned by the existing overlay foundation.

## Synthetic evidence

Private synthetic fixtures cover:

- Case A: saved Pick-to-Pack, actual Pick-to-Mark-to-Assembly-to-Pack, current Mark;
- Case B: system fallback Pick-to-Pack, actual Pick-to-Mark-to-Pack;
- Case C: Direct Pack with both optional instruction snapshots absent and no card/Details warning;
- Case D: actual Mark flow with required Mark instructions absent and a visible warning;
- a three-image worker gallery for title-focused arrow-key proof.

The fixtures use the real immutable route-provenance shape. No real data or production storage was accessed.

## Mutation proof

The isolated SQLite suite actually executed and verified:

- valid Pick partial progress;
- rejected exact-full Pick `SET_PROGRESS`;
- rejected exact-full Pick `INCREMENT`;
- downstream Pack remained locked after both rejected bypasses;
- explicit saved-route override created the existing override decision and reason;
- system fallback route selection required no override reason;
- compatible individual Mark-to-Assembly completion;
- exact replay returned idempotently with one downstream task and one action log;
- stale task version rejection;
- another worker's assignment protection;
- other-account task isolation.

## Browser evidence

Browser: installed Google Chrome via repository `playwright-core`.

Environment: `PRIVATE_SYNTHETIC_STAGING`, `127.0.0.1:3188`, runtime `47cdfd1af7a33a1dec87ee6f95c581976a031ed2`, BUILD_ID `MS3b0xcDGISJbZMWDPHWc`.

Final results:

- inherited C1A matrix: 81/81 passed;
- focused C1A.1 matrix: 33/33 passed;
- widths: 360×800, 390×844, 430×932, 768×1024, 1024×768, 1440×900;
- 200% reflow: retained green through the inherited shared card/overlay matrix;
- horizontal overflow: 0;
- undersized enabled operational controls: 0;
- raw route codes: 0;
- duplicate disclosures: 0;
- console errors: 0;
- page errors: 0;
- unexpected failed requests: 0;
- unexpected HTTP errors: 0.

The focused browser gate verified actual route order, saved/fallback separation, Direct Pack warning filtering, required Mark warning visibility, Process Flow, Details, Partial bounds, Problem, initial title focus, ArrowRight advance, ArrowLeft return, Escape close, and trigger focus return.

Fresh ignored screenshots are under `.codex-tmp/phase-7-4c1a1/owner-review/`: nine 390px states and four 1440px states. Stale C1A Details evidence was not reused.

Two pre-final evidence runs failed closed: the first found the prior synthetic database had not been reseeded; the next found line-wrap-sensitive text assertions and lightweight fixture provenance. The database was reset only inside private synthetic staging, the fixtures were upgraded to immutable provenance, assertions were made layout-independent, and both final gates then passed. No application-runtime correction followed the runtime commit.

## Validation

Green commands:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; warnings are pre-existing Impeccable tool-source warnings
- `npm.cmd run phase7.4c1:test`
- `npm.cmd run phase7.4c1a:test`
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run stage4-ui:test`
- `npm.cmd run stage4-6a:test`
- `npm.cmd run stage4-6:test`
- `npm.cmd run grouped-details:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `git diff --check`

The focused source suite also locks protected hashes, exact route mappings, malformed/oversized input behavior, degraded current-stage behavior, warning filtering, partial bounds, operation-safe request IDs, image listener cleanup, and delegation to the existing Mark transition service.

## Scoped design review

Impeccable was run only on the changed worker interaction surfaces. Its initial deterministic scan returned four `gray-on-color` warnings. One was confirmed: the recommended teal route card forced its secondary line to slate; that override was removed. The remaining three are false positives caused by the detector combining mutually exclusive ternary class branches (`teal/white` and `pink/white`). Browser inspection confirms the active branches use the intended readable foregrounds.

| Review | Before | After | Why |
| --- | --- | --- | --- |
| Emil — route truth | Saved default could be displayed as current work | Actual flow is primary; differing saved default is secondary | A worker must understand the work already selected without weakening saved-default policy |
| Emil — focus/keyboard | Image arrows depended on focus inside preview content | Scoped mounted listener works from title, close, and controls | Preserves initial title focus and avoids a second focus trap or double advance |
| Emil — motion | Existing restrained overlay motion | No new motion | High-frequency warehouse actions do not benefit from decorative animation |
| Taste — anti-generic | Risk of adding another state/card vocabulary | Existing WorkCard, overlay, B1 colors, and action hierarchy reused | The closure stays operational and product-specific instead of becoming a parallel UI system |

Audit health for the changed scope: Accessibility 4/4, Performance 4/4, Responsive 4/4, Theming 4/4, Implementation Integrity 4/4 — 20/20. No P0–P3 issue remains in C1A.1.

## Protected boundary and shutdown

- `route-decision-policy.ts`: unchanged
- `route-selection.ts`: unchanged
- `grouped-transition.ts`: unchanged
- `grouped-progress.ts`: unchanged
- `stage-transition.ts`: unchanged
- `order-pack-scope.ts`: unchanged
- `order-problems.ts`: unchanged
- `task-store.ts`: only the verified one-line exact-full Pick guard
- Prisma schema and migrations: unchanged
- dependencies: none added
- mobile-app: unchanged
- real data: untouched
- staging stopped: yes
- port 3188 closed: yes; no listening socket (post-browser `TIME_WAIT` connections only)
- final worktree: recorded after the documentation commit and push

## Result

`PHASE_7_4C1A1_INTERACTION_TRUTH_CLOSED`

C2 was not started.
