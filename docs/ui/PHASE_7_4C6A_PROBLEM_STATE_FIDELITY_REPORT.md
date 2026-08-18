# Phase 7.4C6A — Problem State Fidelity and Repeatable Reassignment Closure

## Result

`PHASE_7_4C6A_PROBLEM_STATE_FIDELITY_CLOSED`

Phase 7.4C6A repaired one bounded Consignment Problem state-restoration defect and closed the repeatable reassignment request-identity risk. Scanner and Problems presentation were not redesigned, and no D-series work was started.

## Starting boundary

- Required branch: `phase-7.4c6-professional-scan-problems`
- Required final C6 HEAD: `1d9f64555e8784d58b805757d4b87185f4e85557`
- Required browser-tested C6 runtime: `1afa05b28e02afbb7b16079f406ed14963c41fe3`
- Required C6 BUILD_ID: `bIzU-AXWqEzFm_cihKYUz`
- Runtime-to-final C6 diff: only `docs/ui/PHASE_7_4C6_SCANNER_PROBLEMS_REPORT.md`
- Local and remote C6 HEAD matched exactly.
- Starting worktree was clean.
- Prisma, `mobile-app`, `package-lock.json`, and package dependencies were unchanged.
- PRIVATE_SYNTHETIC_STAGING was stopped and port 3188 was closed.

## Branch and commits

- Implementation branch: `phase-7.4c6a-problem-state-fidelity`
- Runtime commit: `f1a4e21807371ebe2405bf4c00283368d2e1db5f`
- Runtime commit message: `Preserve Consignment problem state and reassignment retries`
- Documentation commit: the commit containing this report; the pushed branch HEAD is recorded in the completion handoff.

## Defect reproduction

A disposable SQLite fixture created this exact sequence:

1. Pick was `COMPLETED`.
2. Mark was `IN_PROGRESS` with `completedQuantity = 0`.
3. Pack was `LOCKED`.
4. Mark reported a Problem.
5. The stored task correctly became `PROBLEM` with `statusBeforeProblem = IN_PROGRESS` and quantity still zero.
6. The pre-repair resolver restored Mark to `READY` because it inferred state only from quantity.

The reproduction printed:

`CONFIRMED_CONSIGNMENT_PROBLEM_PRIOR_STATE_LOST`

## Narrow repair

`resolveWorkTaskProblem()` now restores the recorded prior state only when it is one of the two valid resumable states:

- `READY`
- `IN_PROGRESS`

For legacy or malformed values—including null, `LOCKED`, `PROBLEM`, `COMPLETED`, `SKIPPED`, `CANCELLED`, or an unknown value—the previous safe fallback remains:

- positive completed quantity → `IN_PROGRESS`
- zero completed quantity → `READY`

The repair does not change quantity, assignment, upstream state, downstream locks, route selection, or Order Problem resolution.

## Repeatable reassignment closure

The C6 Reassign form used React `useId()` as part of its mutation request ID. `useId()` is an element/hydration identity, not a fresh mutation-attempt nonce, and is deterministic for the same component position across equivalent renders.

Each server-rendered Problem card now receives a cryptographically random `randomUUID()` mutation base. The base is passed to the existing client card and used by its action forms.

This provides the required boundaries:

- the same rendered form retains one request ID for network retry;
- a fresh server render receives a new request base;
- backend request fingerprints remain unchanged;
- same request ID plus same assignment remains idempotent;
- same request ID plus a changed assignment remains rejected;
- a new request ID plus a new authorized assignment succeeds.

## Changed files

Runtime:

- `src/lib/workflow/task-store.ts`
- `app/work/problems/ProfessionalProblemsPage.tsx`
- `components/ProblemWorkspaceCard.tsx`

Focused validation:

- `tests/phase-7-4c6a-problem-state-fidelity.test.ts`
- `scripts/qa/phase-7-4c6a-browser.mjs`
- `package.json`

Documentation:

- `docs/ui/PHASE_7_4C6A_PROBLEM_STATE_FIDELITY_REPORT.md`

## Restore and reassignment tests

`phase7.4c6a:test` proves:

- prior `READY`, quantity zero → `READY`;
- prior `IN_PROGRESS`, quantity zero → `IN_PROGRESS`;
- prior `IN_PROGRESS`, partial quantity → `IN_PROGRESS`;
- legacy null, quantity zero → `READY`;
- legacy null, positive quantity → `IN_PROGRESS`;
- unsupported/malformed prior values use the quantity fallback;
- a reported quantity-zero `IN_PROGRESS` Mark task resolves back to `IN_PROGRESS`;
- completed Pick remains `COMPLETED`;
- downstream Pack remains `LOCKED`;
- quantity and assignment remain unchanged by resolution;
- same request ID and same reassignment payload replays idempotently;
- same request ID with a changed assignee is rejected;
- a new request ID with a new authorized assignee succeeds;
- an incompatible stage worker is rejected;
- a cross-account worker is rejected;
- reassignment does not resolve the Problem;
- exactly two action logs represent two legitimate reassignment mutations.

The existing C6 suite continues to prove Order stage-aware Problem resolution without rewind.

## Required validation

Passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run phase7.4c3c:test`
- `npm.cmd run phase7.4c4:test`
- `npm.cmd run phase7.4c5:test`
- `npm.cmd run phase7.4c6:test`
- `npm.cmd run phase7.4c6a:test`
- `npm.cmd run universal-scan:test`
- `npm.cmd run direct-stage-actions:test`
- `npm.cmd run workflow:test`
- `npm.cmd run grouped-details:test`
- `node --check scripts/qa/phase-7-4c6a-browser.mjs`
- `git diff --check`

Lint completed with zero errors. Its 152 warnings are confined to the bundled `.agents/skills/impeccable` tooling and were not introduced by C6A runtime files.

## Production build identity

- Exact runtime SHA: `f1a4e21807371ebe2405bf4c00283368d2e1db5f`
- BUILD_ID: `MDCCyA-Nj9PCLGmVNfKU5`
- Build result: passed
- Next.js routes in app-path manifest: 123
- Production builds run after final runtime source: one

The stopped synthetic staging root was reset after the build. Its exact-build receipt was reconstructed from the already completed build's SHA, BUILD_ID, and app-path manifest so that no second production build was run. Staging status and health then independently verified the running source SHA and BUILD_ID.

## Focused browser validation

- Browser: installed Google Chrome through repository `playwright-core`
- Environment: `PRIVATE_SYNTHETIC_STAGING`
- Address: `127.0.0.1:3188`
- Real data: untouched
- Widths: `390 × 844`, `1440 × 900`
- Browser report: `.codex-tmp/phase-7-4c6a/browser-report.json`
- Screenshots: `.codex-tmp/phase-7-4c6a/owner-review/`

At both widths, the browser performed real server-action submissions:

1. Opened the genuine Consignment Mark Problem.
2. Recorded the first hidden reassignment request ID.
3. Reassigned Marker → Owner.
4. Verified the Problem remained open.
5. Loaded a fresh server render.
6. Recorded a distinct second request ID.
7. Reassigned Owner → Marker.
8. Verified the Problem remained open and exactly two reassignment action logs existed.
9. Resolved the Problem independently.
10. Verified the final task states directly from the synthetic SQLite database.

Results at both widths:

- request IDs distinct: yes
- first reassignment succeeded: yes
- second reassignment succeeded: yes
- Problem stayed open after each reassignment: yes
- assignment action logs: 2
- Pick final status: `COMPLETED`
- Mark final status: `IN_PROGRESS`
- Mark final quantity: 0
- Pack final status: `LOCKED`
- final assignee: Marker
- document overflow: 0 px
- enabled controls under 44 px: 0
- console errors: 0
- page errors: 0
- failed requests: 0
- HTTP error responses: 0

## Scanner regression

No Scanner source or service file changed in C6A. The required C6, Universal Scanner, direct-stage, and workflow regression suites all passed, retaining:

- unresolved Mark → Process Flow;
- actor-blocked Pack without `Pack Completed`;
- successful scan clear/focus behavior;
- completed scan read-only behavior.

## Protected boundaries

- No Scanner redesign.
- No Problems redesign.
- No D-series work.
- No Prisma schema or migration change.
- No PostgreSQL activity or migration.
- No `mobile-app` change.
- No package-lock or dependency change.
- No real data or production storage access.
- No merge or deployment.
- No PR opened.

## Final environment

- PRIVATE_SYNTHETIC_STAGING: stopped after browser validation
- Port 3188: closed after browser validation
- Prisma: unchanged
- `mobile-app`: unchanged
- Real data: untouched
- Push result and final clean worktree: recorded in the completion handoff after the documentation commit is pushed
