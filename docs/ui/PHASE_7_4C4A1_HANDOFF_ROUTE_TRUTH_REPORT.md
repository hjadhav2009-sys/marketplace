# Phase 7.4C4A.1 — Individual Handoff Route Truth & Origin Live Closure

## Result

`PHASE_7_4C4A1_HANDOFF_ROUTE_TRUTH_CLOSED`

This checkpoint closes the immutable route-snapshot and origin-page live-consistency gaps left after C4A. It does not begin C5 or alter route choice, authorization, assignment, quantities, problems, or Pack completion behavior.

## Boundary and identity

- Required starting branch: `phase-7.4c4a-individual-stage-handoff-closure`
- Starting HEAD: `90326d5f2d28b8925b0a51862e07c3c504b71623`
- Browser-tested starting runtime: `f1016360b911d58b00782cbaabc4879a28fb260f`
- Starting BUILD_ID: `chsWPXsPxoxqq_6yFtq-g`
- Starting runtime-to-HEAD diff: only `docs/ui/PHASE_7_4C4A_INDIVIDUAL_STAGE_HANDOFF_REPORT.md` and `scripts/qa/phase-7-4c4a-browser.mjs`
- Implementation branch: `phase-7.4c4a1-handoff-route-truth`
- Runtime commit: `0b1f6ffb739f60d896336b431a39784b95ffd485`
- Final exact BUILD_ID: `WylPagq-ZDKgcYpDrUvJ9`
- Production build route count: 123
- Browser engine: installed Google Chrome through repository `playwright-core`
- Browser environment: `PRIVATE_SYNTHETIC_STAGING` at `127.0.0.1:3188`

The exact browser report is `.codex-tmp/phase-7-4c4a1/browser-report.json`. It records the runtime SHA and BUILD_ID above.

## Pre-repair reproductions

### Mark route-snapshot truth

A disposable SQLite test called the normal `completeWorkTask()` path for `PICK → MARK → PACK`. Before the repair, Mark became `COMPLETED` and Pack became `READY`, while the persisted snapshots still reported `currentStage: MARK` and omitted Mark from `completedStages`.

The reproduction printed:

```text
CONFIRMED_INDIVIDUAL_MARK_ROUTE_SNAPSHOT_STALE
```

### Origin live card

Two independent synthetic browser sessions kept the canonical Consignment Assembly page open while Universal Scanner completed the same individual task. Backend and destination state changed correctly, but the already-mounted origin card remained visible.

The reproduction printed:

```text
CONFIRMED_INDIVIDUAL_ORIGIN_CARD_LIVE_STALE
```

## Runtime changes

### Shared deterministic snapshot advancement

`src/lib/workflow/task-store.ts` replaces the Assembly-only snapshot update with one bounded helper used by successful final individual Mark and Assembly completion.

It:

- preserves `actualStages`, `recommendedStages`, decisions, saved-route provenance, and all unrelated snapshot fields;
- retains all previously completed stages and adds the completed stage once;
- sets `currentStage` and `selectedNextStage` to the deterministic destination;
- increments `routeVersion` exactly once;
- persists the same advanced snapshot to every WorkTask for the Consignment line.

The existing idempotent replay returns before advancement, so it does not increment the route version again, append stages again, emit events again, create another action log, or change membership again.

No `WorkRouteDecision` is created for deterministic completion.

### Targeted origin-card matching

`app/work/work-change-card-match.ts` provides a pure card/event matcher. A card accepts an event only when:

- the explicit `groupKey` equals the card group; or
- the event has no group key and its `entityId` is one of that card's `memberTaskIds`.

`app/work/GroupedWorkCard.tsx` uses that matcher. A matching `STAGE_COMPLETED` event for the card's current stage removes the departed card immediately. Other matching events keep the existing bounded group endpoint refresh. Unrelated entity events and explicit events for other groups do nothing.

The C4A `WORK_ROUTED` destination-page refresh remains unchanged. There is no new global refresh for every completion.

## Route regression results

| Route | Checkpoint | Persisted truth |
| --- | --- | --- |
| Pick → Mark → Pack | after Mark | `actualStages=[PICK,MARK,PACK]`; `completedStages=[PICK,MARK]`; current/selected destination `PACK` |
| Pick → Mark → Assembly → Pack | after Mark | `completedStages=[PICK,MARK]`; current/selected destination `ASSEMBLE`; Pack remains `LOCKED` |
| Pick → Mark → Assembly → Pack | after Assembly | `completedStages=[PICK,MARK,ASSEMBLE]`; current/selected destination `PACK` |
| Pick → Assembly → Pack | after Assembly | `completedStages=[PICK,ASSEMBLE]`; current/selected destination `PACK` |

All source tasks contain byte-identical route snapshots after each handoff. Existing decisions and immutable provenance remain unchanged. Identical replay leaves the stored JSON byte-for-byte unchanged and retains exactly one completion event, one routed event, and one action log.

## Focused regression coverage

`phase7.4c4a1:test` proves:

- deterministic Mark → Pack snapshot advancement;
- deterministic Mark → Assembly snapshot advancement while Pack remains locked;
- subsequent Assembly → Pack retains Mark in completed history;
- direct Assembly → Pack advancement;
- exact route stage order and provenance preservation;
- zero deterministic route-decision rows;
- byte-identical replay and single-event/action-log behavior;
- explicit grouped-event matching remains unchanged;
- member-task events match their owning card;
- unrelated task events and explicit other-group events cannot remove a card.

The three existing task-store digest guards were updated to the reviewed runtime digest. Their policy assertions were not weakened.

## Validation

Passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint` — 0 errors; 152 pre-existing warnings, all in installed `.agents/skills/impeccable` sources
- `npm.cmd run phase7.4c3a:test`
- `npm.cmd run phase7.4c3a1:test`
- `npm.cmd run phase7.4c3a2:test`
- `npm.cmd run phase7.4c3c:test`
- `npm.cmd run phase7.4c4:test`
- `npm.cmd run phase7.4c4a:test`
- `npm.cmd run phase7.4c4a1:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run live-work:test`
- `npm.cmd run live-work-load:test`
- `git diff --check`
- exact production build for runtime `0b1f6ffb739f60d896336b431a39784b95ffd485`

No historical atlas or PostgreSQL migration suite was run.

## Exact-build browser proof

The final Chrome run produced 6/6 passing records:

| Viewport | Flow | Origin | Destination | Result |
| --- | --- | --- | --- | --- |
| 390 × 844 | Assembly → Pack | canonical Assembly page | canonical Pack page | Passed |
| 390 × 844 | Mark → Pack | canonical Mark page | canonical Pack page | Passed |
| 390 × 844 | Mark → Assembly | canonical Mark page | canonical Assembly page | Passed |
| 1440 × 900 | Assembly → Pack | canonical Assembly page | canonical Pack page | Passed |
| 1440 × 900 | Mark → Pack | canonical Mark page | canonical Pack page | Passed |
| 1440 × 900 | Mark → Assembly | canonical Mark page | canonical Assembly page | Passed |

Each flow used separate origin, destination, and Universal Scanner sessions. For every record:

- the destination card was absent before completion;
- the exact individual task was completed through Universal Scanner;
- the already-open origin card disappeared without manual reload;
- the already-open destination page gained the card without manual reload or projection rebuild;
- origin summary changed by `-1` and destination summary by `+1`;
- persisted route truth matched the expected route and destination;
- snapshots were identical across all tasks for the line;
- completion event count was 1;
- routed event count was 1;
- completion action-log count was 1;
- route-decision count was 0;
- focus remained usable.

Final browser health:

- console errors: 0
- page errors: 0
- unexpected failed requests/responses: 0
- horizontal overflow: 0
- undersized enabled controls: 0
- accidental inert state: 0
- duplicate current navigation: 0

Screenshots were captured under `.codex-tmp/phase-7-4c4a1/` for the Assembly and Pack destinations at both validated widths.

## Protected business boundary

Unchanged:

- `dynamic-route.ts`
- `route-stage-eligibility.ts`
- `stage-transition.ts`
- `grouped-transition.ts`
- `grouped-progress.ts`
- `grouped-completion-destination.ts`
- `route-selection.ts`
- `workflow-prerequisites.ts`
- `order-pack-scope.ts`
- permissions, assignment policy, quantities, problems, and Pack completion services

No dependencies were added. Prisma schema/migrations and `mobile-app` are unchanged. PostgreSQL and real data were untouched.

## Final state

- Staging: stopped
- Port 3188: no listener; only transient `TIME_WAIT` sockets remained immediately after shutdown
- Prisma: unchanged
- `mobile-app`: unchanged
- Real data: untouched
- PR: not opened
- Merge: not performed
- Deployment: not performed
- C5: not started

## Changed files

Runtime/test commit:

- `src/lib/workflow/task-store.ts`
- `app/work/GroupedWorkCard.tsx`
- `app/work/work-change-card-match.ts`
- `package.json`
- `tests/phase-7-4c4a1-handoff-route-truth.test.ts`
- three existing task-store digest guards

Documentation commit adds only this report and the two bounded C4A.1 browser scripts. The preflight script records the original browser reproduction; the final script records the exact-build six-flow closure matrix.
