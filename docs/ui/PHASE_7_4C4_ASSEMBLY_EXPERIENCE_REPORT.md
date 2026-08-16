# Phase 7.4C4 — Professional Assembly Experience

## Result

`PHASE_7_4C4_PROFESSIONAL_ASSEMBLY_EXPERIENCE_COMPLETE`

Phase 7.4C4 establishes `/work/assemble` as the canonical professional Assembly workspace for Customer Orders and Consignments. It closes the Assembly-specific forward-route and generic-full-progress gaps without changing the approved four-route family, and it preserves the existing Order Assembly services.

## Boundary and identity

| Item | Value |
| --- | --- |
| Required starting branch | `phase-7.4c3c-grouped-mark-determinism-entry-closure` |
| Verified starting HEAD | `d4bcd4bcda449da1f9c1b46e4138cff2c304a7da` |
| Prior browser runtime | `60516ff034da5f447a1a4b435461139885ecae9d` |
| Prior BUILD_ID | `TFsl3e-2u1bS8ExuL0jlI` |
| Implementation branch | `phase-7.4c4-professional-assembly-experience` |
| Final application runtime commit | `ca4fd111cb4ea5831f34becce6f23a5d7f434a36` |
| Final BUILD_ID | `Frh-YYLIvAPWdCeyHDpbB` |
| Production route count | 123 |
| Browser database | `PRIVATE_SYNTHETIC_STAGING` only |

The final application runtime is one coherent commit, `Build professional Assembly experience`. The following evidence commit contains only this report and the bounded C4 browser harness; it does not change the tested application runtime.

## Safety preflight and corrections

The required disposable-SQLite preflight reproduced all three suspected defects before correction:

- `CONFIRMED_INDIVIDUAL_ASSEMBLY_TO_MARK_DEFECT`
- `CONFIRMED_GROUPED_ASSEMBLY_TO_MARK_DEFECT`
- `CONFIRMED_ASSEMBLY_GENERIC_FULL_PROGRESS_BYPASS`

The correction is deliberately narrow:

- `forwardStageCandidates` is now the shared authoritative forward-stage allowlist.
- Assembly has one allowed normal destination: Pack.
- Crafted individual, quick-route, and grouped Assembly → Mark requests reject before mutation.
- Generic Assembly `SET_PROGRESS` or `INCREMENT` to the exact required quantity rejects with `Use Assembly Completed to finish assembly.`
- Valid partial Assembly progress remains supported.
- Final Assembly completion requires the exact safely prepared downstream Pack task; a mismatched, assigned, started, completed, or provenance-divergent task is rejected.
- Grouped Assembly uses its preselected Pack destination and does not present a route chooser.

No fifth route, route replacement behavior, backwards route, or repeat-Assembly path was introduced.

## Canonical entry and compatibility

- Worker navigation now points Assembly to `/work/assemble`.
- `/work/assembly` remains the bounded legacy Order search/history surface.
- A plain active `/work/assembly` request redirects to `/work/assemble?source=ORDER`.
- Exact `q` search plus `problem` and `completed` history behavior remain available on the legacy route.
- Navigation ownership treats `/work/assembly` as an owned compatibility path, preserving one current navigation item.

## Assembly workspace

The new workspace uses the existing `AppShell`, `PageHeader`, WorkCard system, metrics, button styles, focus system, image viewer, and worker overlay.

It provides:

- marketplace/account context;
- compact Open work, Required quantity, Problems, and Assigned to me metrics;
- capability-aware Customer Orders and Consignments selection;
- Flipkart support for both sources, Amazon Consignments only, and no unsupported Meesho source;
- direct opening when only one supported active source exists;
- explicit-source true empty states;
- fail-closed projection-unavailable behavior;
- Active, Problems, Completed today, and Assigned to me Order views;
- source- and status-preserving pagination.

The existing server-side permissions and selected-account boundary remain authoritative. The workspace does not expose unsupported Daily Orders or client-side permission computation.

## Card, guidance, and action grammar

Both sources use the existing WorkCard anatomy:

- source, marketplace, stage, and status context;
- product image and identity;
- actual Process Flow;
- compact Assembly quantity and assignment;
- saved/manual/missing Assembly guidance;
- problem or completed state;
- shared action layout.

`AssemblyGuidance` reads bounded immutable task metadata in this order: Order Assembly metadata, Consignment Assembly metadata, immutable route provenance, then bounded missing/manual metadata. It exposes useful worker copy and a reference image through the existing viewer, while excluding raw JSON, private paths, fingerprints, and internal IDs.

Action states are:

- actionable with more than one remaining: Assembly Completed, Partial Quantity, Problem, Details;
- one remaining: Assembly Completed, Problem, Details;
- problem: Open Problem, Details;
- read-only/completed: Details and receipt state only.

Partial Quantity accepts only `completed + 1` through `required - 1`. The final unit must use Assembly Completed.

Details uses the shared full-height mobile sheet/right desktop drawer and prioritizes Product, Assembly guidance, Process Flow, Quantity, Assignment, Identifiers, Problem, and recent stage history.

## Order and Consignment behavior

Existing Order Assembly behavior remains in place: automatic rule-created Assembly, manual Send to Assembly, immutable metadata, claiming, completion, Problems, owner resolution, owner skip, reassignment, idempotency, and Pack lock/unlock checks.

The UI adds an idempotent bounded Order partial-progress action. It does not allow the final unit and does not change Order completion semantics.

For both Order and Consignment completion, final browser truth was:

```text
Assembly: COMPLETED, 6 / 6
Pack: READY
actualStages: PICK → ASSEMBLE → PACK
completedStages: PICK, ASSEMBLE
currentStage: PACK
TASK_COMPLETED logs: 1
Pack task count: 1
```

For the actual partial submission:

```text
Assembly: IN_PROGRESS, 4 / 6
Pack: LOCKED
```

Disposable workflow tests additionally verify replay, stale-card rejection, problem-state safety, assignment conflict, exact Pack mismatch, one completion log, no duplicate Pack task, and cross-account rejection.

## Runtime and client boundary

No runtime dependency was added. `AppShell` and the workspace remain server components. The new client modules are limited to the source selector (live summary timestamps) and the interactive Order WorkCard; existing grouped cards and the shared overlay retain their prior client boundary.

Production build validation found and corrected three transitive client/server boundary issues before final evidence:

- the Order card no longer imports the server-only permission module;
- problem categories live in a client-safe contract module while server validation reuses the same values;
- bounded provenance parsing lives in a client-safe contract module while cryptographic provenance creation remains server-only.

## Tests and validation

All final commands passed on the exact runtime tree:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; 152 warnings confined to installed `.agents/skills/impeccable` tool files
- `npm.cmd run phase7.4c1:test`
- `npm.cmd run phase7.4c1a:test`
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run phase7.4c2:test`
- `npm.cmd run phase7.4c3:test`
- `npm.cmd run phase7.4c3a:test`
- `npm.cmd run phase7.4c3a1:test`
- `npm.cmd run phase7.4c3a2:test`
- `npm.cmd run phase7.4c3c:test`
- `npm.cmd run phase7.4c4:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run grouped-details:test`
- `npm.cmd run stage4-ui:test`
- `npm.cmd run stage4-6a:test`
- `git diff --check`

The focused C4 suites cover source capability truth, navigation compatibility, workspace/card contracts, immutable guidance, all Assembly → Mark entry points, generic full-progress rejection, valid partials, exact Pack validation, route snapshots, idempotency, stale state, assignment, and account isolation.

Flipkart and Amazon Consignment Assembly import regressions were also run successfully while developing the final route-snapshot compatibility correction.

## Exact production browser evidence

Browser: installed Google Chrome via repository `playwright-core`.

Runtime: `ca4fd111cb4ea5831f34becce6f23a5d7f434a36` / `Frh-YYLIvAPWdCeyHDpbB`.

The final `phase7.4c4:browser` run produced 26 records and 0 failures.

| Width | Canonical/source | Order workspace | Consignment workspace | Overflow | Undersized main controls | Current nav |
| --- | --- | --- | --- | --- | --- | --- |
| 360 × 800 | Pass | Pass | Pass | 0 px | 0 | 1 |
| 390 × 844 | Pass | Pass | Pass | 0 px | 0 | 1 |
| 430 × 932 | Pass | Pass | Pass | 0 px | 0 | 1 |
| 768 × 1024 | Pass | Pass | Pass | 0 px | 0 | 1 |
| 1024 × 768 | Pass | Pass | Pass | 0 px | 0 | 1 |
| 1440 × 900 | Pass | Pass | Pass | 0 px | 0 | 1 |

Additional passing browser records:

- Partial Quantity, Details, image viewer, focus entry, focus return, and visible 3px teal focus outline;
- Order Problem and completed receipt views;
- read-only View-all worker with no mutation controls;
- true empty and projection-unavailable account states;
- legacy default redirect;
- actual Order completion;
- actual Consignment completion;
- actual valid partial progress.

Console errors: 0. Page errors: 0. Unexpected failed requests/responses: 0. Reduced motion was enabled in every browser context. All enabled main-workspace controls measured at least 44 × 44 CSS px.

## Impeccable, Taste, and Emil review

Impeccable was scoped to the changed Assembly surfaces only. Its deterministic detector reported two `gray-on-color` warnings on the compact `AssemblyGuidance` source line. Both were inspected and confirmed false positives: the amber warning element uses `text-amber-950`; the reported slate classes belong to sibling elements outside the amber surface. No correction was required and the palette was not changed to silence the detector.

Taste was used only as the authorized anti-generic critic. The result reuses the warehouse WorkCard and operational ledger grammar, avoids a decorative dashboard, card-within-card proliferation, gradients, glass, oversized branding, GSAP, and unrelated layout expansion.

Emil review confirms that the shared overlay supplies meaningful initial focus, bounded Tab/Shift+Tab behavior, Escape dismissal, and opener focus return. No new decorative animation or animation dependency was added, and reduced-motion browser validation passed.

| Before | After | Why |
| --- | --- | --- |
| Separate legacy Order Assembly card and generic grouped queue | One canonical Assembly workspace using WorkCard for both sources | One worker mental model without rewriting service behavior |
| Ambiguous/unsafe Assembly forward choices | Pack-only deterministic completion with no route chooser | Matches the approved route family and removes non-decisions |
| Full quantity reachable through generic progress | Partial overlay excludes the final unit and server rejects crafted full progress | Preserves authoritative completion semantics |
| Guidance spread across metadata/card variants | One bounded saved/manual/missing guidance presentation | Makes instructions discoverable without exposing internals |
| Normal work required route changes or deep navigation for detail | Shared Details and image overlays with focus return | Keeps workers in context and preserves keyboard flow |

## Scope integrity and final state

- Prisma schema and migrations: unchanged.
- PostgreSQL and database configuration: unchanged.
- `mobile-app`: unchanged.
- Dependencies: none added.
- Real data: untouched.
- Synthetic database integrity after reset: OK; `productionPathsReferenced: false`.
- Staging final state: STOPPED.
- Port 3188 final state: closed (no listening process).
- No PR, merge, deployment, or C5 work was performed.
