# Phase 7.4C4A — Individual Stage Handoff Projection & Live Update Closure

## Result

`PHASE_7_4C4A_INDIVIDUAL_STAGE_HANDOFF_CLOSED`

This checkpoint closes the individual deterministic Mark/Assembly handoff gap without changing route-selection, quantity, permission, assignment, or account-isolation policy. C5 was not started.

## Boundary and identity

- Required starting branch: `phase-7.4c4-professional-assembly-experience`
- Starting HEAD: `50f48d968e0579a294411283bd60c3c0fb81e777`
- Browser-tested C4 runtime: `ca4fd111cb4ea5831f34becce6f23a5d7f434a36`
- Starting BUILD_ID: `Frh-YYLIvAPWdCeyHDpbB`
- Runtime-to-starting-HEAD diff: only `docs/ui/PHASE_7_4C4_ASSEMBLY_EXPERIENCE_REPORT.md` and `scripts/qa/phase-7-4c4-browser.mjs`
- Implementation branch: `phase-7.4c4a-individual-stage-handoff-closure`
- C4A runtime commit: `f1016360b911d58b00782cbaabc4879a28fb260f`
- C4A BUILD_ID: `chsWPXsPxoxqq_6yFtq-g`
- Production build route count: 123
- Browser engine: installed Google Chrome through repository `playwright-core`
- Browser environment: `PRIVATE_SYNTHETIC_STAGING` at `127.0.0.1:3188`

The final C4A browser report is `.codex-tmp/phase-7-4c4a/browser-report.json`. It records the exact runtime SHA and BUILD_ID above.

## Pre-repair reproduction

A disposable SQLite regression created separate deterministic individual Consignment routes and built current and destination projections before calling `completeWorkTask()` through its normal COMPLETE path.

Before the repair it proved:

- current Assembly/Mark task became `COMPLETED`;
- the exact downstream task became `READY`;
- route truth advanced to the correct destination;
- the destination projection did not contain the newly ready work;
- no destination `WORK_ROUTED` event existed.

The reproduction printed:

```text
CONFIRMED_INDIVIDUAL_ASSEMBLY_PACK_HANDOFF_PROJECTION_GAP
CONFIRMED_INDIVIDUAL_MARK_HANDOFF_PROJECTION_GAP
```

## Runtime changes

### Deterministic handoff transaction

`src/lib/workflow/task-store.ts` now uses one shared deterministic handoff helper after a successful final individual Mark or Assembly completion. Inside the existing transaction it:

1. preserves the already-approved completion, downstream validation, unlock, and route advancement;
2. writes one `STAGE_COMPLETED` event for the current stage;
3. writes one `WORK_ROUTED` event for the deterministic next stage;
4. refreshes both current and destination `WorkGroupProjection` scopes using the affected task/order/consignment identifiers.

Partial progress retains the existing current-stage-only refresh. It does not unlock or project downstream work and does not emit `WORK_ROUTED`. Idempotent replay returns before the handoff helper, so events, action logs, membership, and quantity are not duplicated.

### Open destination-page update

The first exact browser pass proved that task truth, destination projection, routed event, and Pack summary all updated, but a brand-new Pack group did not render in the already-open page. Existing card-local live handling can update or remove a card that is already mounted; it cannot mount a new group.

`app/work/LiveWorkRefresh.tsx` therefore performs a route refresh only for an accepted `WORK_ROUTED` event. Ordinary progress and completion events keep the existing card-local behavior. The refresh preserves scroll and focused-control identity, reuses the existing event stream, and introduces no new live-update architecture or dependency.

### Optional semantic correction

`app/work/assemble/OrderAssemblyWorkCard.tsx` now labels `SKIPPED` as `Assembly skipped`, not `Assembly completed`. No layout or card redesign was made.

## Business behavior preserved

No changes were made to:

- Pick final-unit guards;
- Mark or Assembly final-unit guards;
- Pack authoritative completion;
- Assembly → Pack-only policy;
- Mark preselected-destination policy;
- assignment, account, stage-permission, stale-quantity, problem, or idempotency behavior;
- route provenance or route-choice policy.

The protected route services were unchanged: `dynamic-route.ts`, `route-stage-eligibility.ts`, `stage-transition.ts`, `grouped-transition.ts`, and `grouped-completion-destination.ts`.

## Regression coverage

`phase7.4c4a:test` proves:

- individual Assembly → Pack task truth, route truth, immediate Pack membership, and `getGroupedWork(PACK)` visibility without rebuild;
- deterministic Mark → Pack and Mark → Assembly destination membership/events;
- partial Assembly leaves Pack locked, absent, and unrouted;
- identical replay produces one action log, one completion event, one routed event, and one membership;
- wrong downstream work rejects without mutation;
- assignment and cross-account rejection remain active;
- routed events refresh an open destination page;
- skipped Assembly uses the correct semantic label.

The protected task-store source hashes in the C1A/C2/C3 regression guards were updated to the reviewed C4A digest; their policy assertions were not weakened.

## Validation

Passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; 152 pre-existing warnings, all from installed `.agents/skills/impeccable` sources
- `npm.cmd run phase7.4c1a:test`
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run phase7.4c2:test`
- `npm.cmd run phase7.4c3:test`
- `npm.cmd run phase7.4c3a:test`
- `npm.cmd run phase7.4c3a1:test`
- `npm.cmd run phase7.4c3a2:test`
- `npm.cmd run phase7.4c3c:test`
- `npm.cmd run phase7.4c4:test`
- `npm.cmd run phase7.4c4a:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run grouped-details:test`
- `npm.cmd run live-work:test`
- `npm.cmd run live-work-load:test`
- `git diff --check`
- production staging build gate for final runtime `f1016360…`; final recorded BUILD_ID `chsWPXsPxoxqq_6yFtq-g`

No historical atlas or PostgreSQL migration suite was run.

## Focused browser proof

The final exact-build run produced 3/3 passing records:

| Viewport | Sessions | Entry path | Result |
| --- | --- | --- | --- |
| 390 × 844 | independent Assembler + Packer | Assembler `/work/scan`; Packer `/work/pack?source=CONSIGNMENT` | Passed |
| 1440 × 900 | independent Assembler + Packer | Assembler `/work/scan`; Packer `/work/pack?source=CONSIGNMENT` | Passed |
| 390 × 844 | Assembler | `/work/consignments/assemble` and completed item detail | Passed |

For each scanner handoff:

- the target was absent from the Packer page before the action;
- the Assembler found the exact Consignment Assembly candidate through Universal Scanner;
- `Assembly Completed` used the actual `TASK_COMPLETE` path;
- Assembly became `COMPLETED`;
- Pack became `READY`;
- route `currentStage` became `PACK`;
- Pack projection membership count became exactly 1;
- `STAGE_COMPLETED` count was exactly 1;
- `WORK_ROUTED` count was exactly 1;
- completion action-log count was exactly 1;
- the already-open Packer page displayed the new Pack card live without manual reload, projection rebuild, or owner repair.

The legacy individual queue and completed item detail also rendered correctly and showed `ASSEMBLE: COMPLETED` plus `PACK: READY`.

Final browser health:

- console errors: 0
- page errors: 0
- unexpected failed requests/responses: 0
- horizontal overflow: 0
- undersized enabled controls: 0

## Scope and safety

- New dependencies: none
- Prisma schema/migrations: unchanged
- PostgreSQL: untouched
- `mobile-app`: unchanged
- Production/real data: untouched
- Synthetic fixtures restored after browser mutation
- Final staging state: stopped
- Port 3188 listener: closed (only transient `TIME_WAIT` sockets remained immediately after shutdown)
- C5: not started

## Changed runtime/test files

- `src/lib/workflow/task-store.ts` — shared deterministic projection/event handoff
- `app/work/LiveWorkRefresh.tsx` — selective `WORK_ROUTED` page refresh
- `app/work/assemble/OrderAssemblyWorkCard.tsx` — skipped-state label
- `package.json` — C4A source/browser commands
- `tests/phase-7-4c4a-individual-stage-handoff.test.ts` — reproduction and regression suite
- three existing phase digest guards — reviewed task-store digest only

The final documentation commit adds only this report and `scripts/qa/phase-7-4c4a-browser.mjs`. No PR, merge, deployment, or C5 work was performed.
