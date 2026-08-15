# Phase 7.4C3A.2 Preselected Mark Route Integrity

## Result

`PHASE_7_4C3A2_PRESELECTED_MARK_ROUTE_INTEGRITY_CLOSED`

C3 UI work did not begin.

## Boundary

- Starting branch: `phase-7.4c3a1-mark-complete-path-safety`
- Starting final HEAD: `843cdf289725b213df543443d86b9aba8e031776`
- Starting runtime: `6a6df8e8b013cd4d7c18fd4284adf7c1cd669a44`
- Starting BUILD_ID: `BmaMX_iryy1Dbjr46zNec`
- Implementation branch: `phase-7.4c3a2-preselected-mark-route-integrity`
- Starting worktree clean; Prisma/mobile-app clean; staging stopped; port 3188 closed.
- Runtime-to-final diff contained only `docs/ui/PHASE_7_4C3A1_MARK_COMPLETE_PATH_SAFETY_REPORT.md`.

## Reproduction

A disposable-SQLite fixture contained:

```text
Mark      sequence 2 READY 0/6
Assembly  sequence 3 LOCKED
Pack      sequence 4 LOCKED
actualStages = PICK, MARK, ASSEMBLE
completedStages = PICK
preselectedNextStage = ASSEMBLE
```

A crafted `completeStageAndChooseNext(...)` requested Pack. Before the repair it:

- completed Mark at `6/6`;
- appended Pack, producing `PICK, MARK, ASSEMBLE, PACK`;
- left Assembly `LOCKED`;
- made Pack `READY`;
- wrote one route decision, one `WORK_STAGE_COMPLETED_AND_ROUTED` audit, and one completion action.

The reproduction printed `CONFIRMED_PRESELECTED_MARK_REROUTE_INTEGRITY_DEFECT`. Packing remained prerequisite-blocked, but the work became contradictory and stuck.

## Root cause and guard

`completeStageAndChooseNext(...)` validated Pack as a generally legal forward destination but did not compare it with the already-authoritative next stage in `actualStages`.

The only production workflow change is in `src/lib/workflow/stage-transition.ts`. After parsing the authoritative snapshot and resolving the requested next stage, it reuses `resolveForwardStageEligibility(...)`. For current Mark, a request that differs from a non-null `preselectedNextStage` now rejects before mutation:

```text
The next processing stage is already selected. Complete Marking to continue.
```

`assertValidStageTransition(...)` remains unchanged and still performs its existing validation. No route-replacement workflow was introduced.

## Regression results

The expanded disposable-SQLite matrix proves:

- unresolved `PICK, MARK` can still route to Pack;
- unresolved `PICK, MARK` can still route to Assembly;
- preselected Assembly cannot be replaced by crafted Pack;
- preselected Pack cannot be replaced by crafted Assembly;
- both rejected reroutes leave Mark quantity/status/assignment, Assembly, Pack, and route JSON unchanged;
- rejected reroutes write no route decision, routed audit, completion action, or `WorkChangeEvent`;
- deterministic preselected Assembly generic completion still unlocks Assembly and leaves Pack locked;
- deterministic preselected Pack generic completion still unlocks Pack;
- exact-full generic Set and Increment remain rejected;
- routed success retains route decisions, audits, assignment/account authorization, reason policy, missing-instruction policy, and idempotent replay;
- stale quantity/version, assignment isolation, account isolation, Pick guard, and Pack authoritative boundary remain intact.

## Changed files

| File | Purpose |
|---|---|
| `src/lib/workflow/stage-transition.ts` | Narrow preselected Mark reroute guard. |
| `tests/phase-7-4c3a-mark-progress-safety.test.ts` | Assembly/Pack replacement and non-mutation regressions. |
| `tests/phase-7-4c1a1-interaction-truth.test.tsx` | Authorized stage-transition hash update only. |
| `tests/phase-7-4c2-pick-experience.test.tsx` | Authorized stage-transition hash update only. |
| `package.json` | Adds `phase7.4c3a2:test`. |

No dependency or UI file changed.

## Protected hashes

Unchanged protected files:

- `route-decision-policy.ts`: `7e80762e3062d66b8c30491cf3decef6f3325009e946a66f94299df271a3b53e`
- `route-selection.ts`: `d7f465a9cfe7b92254ea2d6479eb238dfca25f3eff729a2ed6fc0ca3c517402f`
- `grouped-transition.ts`: `5a52d4798bed591c1f6f8af9c6c6646e65ad6596595a5b7f9c797ffee4f2517c`
- `grouped-progress.ts`: `98592bc58d9e2ce8deff9417e4917415ad0ddf82d679d7b620fd0a2903890266`
- `task-store.ts`: `f5f6018e48e9398797ca058b6ec634e12904b512f46ac96a37d06bab1e52dd3a`
- `order-pack-scope.ts`: `65e30f0f66dd536f16b92bed8b0979f9b13da4609a9ab45df7541b1d564ad6f3`
- `order-problems.ts`: `d2f6c7f2fb570883c93b7733832a3fc5e088654cd9b91cee00e67715b4533314`
- `workflow-prerequisites.ts`: `ddaa6820d1b990bbf14b486e8750b68ba445240903d4c0dbe88b8d6c013122e2`

Authorized `stage-transition.ts` now hashes to `d104a70482a5d438885fd7f5df53bc5b2bd44de681bd0031d1bddc6139db3d2b`.

## Validation

Passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; 152 existing Impeccable warnings
- `npm.cmd run phase7.4c1a1:test`
- `npm.cmd run phase7.4c2:test`
- `npm.cmd run phase7.4c3a:test`
- `npm.cmd run phase7.4c3a1:test`
- `npm.cmd run phase7.4c3a2:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run grouped-details:test`
- `git diff --check`

No PostgreSQL migration or historical atlas was run.

## Exact build and browser

- Runtime SHA: `b1fedb5da9647653f2ad4cfcddf179c17c90b735`
- BUILD_ID: `E3V5X-7vq_ocqLwhMCDHd`
- Route count: `123`
- Database: `SYNTHETIC_ONLY`
- Browser: installed Google Chrome
- Widths: `390x844`, `1440x900`
- Records: `4`; failures: `0`

At both widths, multi-choice Mark retained `Marking Completed` and Pack/Assembly choices. Preselected Assembly retained normal completion, showed its actual flow, and exposed no alternate route chooser. Partial Quantity excluded the final unit. Console, page, request, HTTP, overflow, and undersized-control failures were all zero.

## Final state

- Prisma/migrations unchanged
- mobile-app unchanged
- real data untouched
- staging stopped
- port 3188 closed
- no PR, merge, deployment, C3 UI, or C4 work
- final branch HEAD: documentation commit containing this report; exact SHA recorded in push handoff

