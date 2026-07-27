# Phase 7.3.6 Stage 4.3A Local Diff Review

## Scope

Base: `a9906e0a659058ae5a0d9b9d8dfedf5165416627`

Audit branch: `phase-7.3.6-stage4.3a-auth-shell-pick-ui-safety-review`

The pre-audit working tree contained exactly four modified files:

- `app/login/page.tsx`
- `components/AppShell.tsx`
- `app/work/GroupedWorkCard.tsx`
- `tests/stage4-2c-coverage-editor.test.mjs`

No login action, workflow service, stage action, API route, Prisma schema,
migration, database service, or `mobile-app` file was changed. The closure
audit later changed the role-denial branch in `requireUser` from a capability
redirect to the authenticated `/access-denied` page. Authentication and
authorization checks remain server-side.

## Classification

| File | Classification | Backend impact | Review |
| --- | --- | --- | --- |
| `app/login/page.tsx` | visual, responsive, accessibility, form wiring | Existing `loginAction`, field names, autocomplete, query states and `SubmitButton` preserved | Accepted |
| `components/AppShell.tsx` | navigation presentation, server-action wiring | Permission-derived `linksForUser` and audited `logoutAction` preserved | Accepted subject to browser matrix |
| `app/work/GroupedWorkCard.tsx` | responsive presentation | Live refresh, authorization display state, route dialog and completion action preserved | Accepted subject to browser interaction |
| `tests/stage4-2c-coverage-editor.test.mjs` | regression coverage | None | Accepted |
| `lib/auth.ts` | authorization-denial presentation | Role mismatch still fails closed before protected page logic; destination is now `/access-denied` | Accepted |
| `app/access-denied/page.tsx` | accessibility and safe navigation | Loads no protected owner data | Accepted |

## Audit corrections

The audit added a production-neutral username placeholder, sans-serif login
typography, accessible alerts, a keyboard-operable password visibility control,
a 44-pixel forgot-password target, a compact staging banner, and deterministic
mobile account-menu dismissal and focus return.

The mobile account menu continues to receive the real server `logoutAction`.
It does not implement client-only logout. The hamburger drawer continues to
receive the complete permission-derived `links` array.

## Grouped action contract

Source assertions verify `completeGroupedStageAction`, `stage`, `sourceType`,
`groupKey`, `groupVersion`, `clientRequestId`, `nextStage`, `useRecommended`,
`routeReason`, `routeOtherReason`, `confirmMissingInstructions`, and
`workerNote`. No domain mutation logic was changed.

## Evidence

Passed:

- Stage 4.3A wiring policy
- Stage 4.2C visual-editor policy
- TypeScript
- ESLint
- staging isolation tests
- permissions
- security
- Stage 4 UI contracts
- universal scanner
- grouped work and Details
- direct stage actions
- grouped Pack safety
- final workflow correctness and 20-request concurrency
- production build (122 application routes)

Interactive browser verification is not complete because no controllable
browser was available in the audit session. No commit was created.
