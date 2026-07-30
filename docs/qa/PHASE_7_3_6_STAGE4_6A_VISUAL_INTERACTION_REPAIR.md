# Phase 7.3.6 — Stage 4.6A Visual Interaction Repair

## Decision

```text
STAGE4_6A_VISUAL_INTERACTION_REPAIR_VERIFIED
```

The repaired UI passed the bounded, private, synthetic browser gate against one
exact production-mode build. This is not a merge, deployment, real-data, or
production-use approval.

## Source and build boundary

```text
Branch:
phase-7.3.6-stage4.6a-visual-interaction-repair

Browser-tested application SHA:
32da85c4e295c79a90d5e0dfbc207671733f6ea1

BUILD_ID:
r3WhX7tEjfJe-ppoWa-CJ

Route count:
123

Bind:
127.0.0.1:3188

Database:
private synthetic staging only
```

Relevant local commits:

```text
e9f1776 Repair Stage 4.6 mobile and operational interactions
eb66380 Add Stage 4.6A interaction regression coverage
d429130 Portal the mobile drawer above the app shell
cf1f210 Clarify Scanner active and completed result counts
d508ce8 Make synthetic staging lifecycle bounded and detached
32da85c Bound synthetic browser QA lifecycle
```

No changes were made to `main` or `mobile-app`. No push, merge, deployment,
schema change, production database access, or production storage access was
performed.

## Browser-gate architecture

`npm.cmd run staging:browser-gate` now owns the temporary synthetic server:

1. it refuses production or non-staging paths;
2. starts one non-detached Next.js child;
3. allows 120 seconds for `/login` and exact staging identity;
4. accepts evidence only for the exact source SHA and BUILD_ID;
5. verifies every screenshot byte count and SHA-256;
6. applies a 45-minute total timeout;
7. stops the owned process in `finally`;
8. removes its runtime and ready receipts.

The completed proof exited with code 0 in 9.7 seconds after the preserved
browser evidence was handed to the gate. Port 3188 was closed and both the
runtime and ready receipts were absent afterward.

## Browser evidence

Exact viewports:

```text
360 × 800
390 × 844
430 × 932
768 × 1024
1024 × 768
1440 × 900
```

Result:

```text
Explicit browser checks: 59
Failed checks:            0
Full-page screenshots:    9
Console errors:           0 observed
Page errors:              0 observed
Unexpected failed HTTP:   0 observed
Horizontal overflow:      0
Controls below 44px:      0 in checked action surfaces
Destructive actions:      0 completed
```

Private, ignored evidence:

```text
.codex-tmp/stage4-6a-browser-evidence/gate-32da85c/
.codex-tmp/stage3-sanitized-staging/reports/stage4-6b-browser-gate/
```

The evidence contains synthetic data only and is not committed.

## Verified interactions and states

### Global shell

- all six CSS viewports matched exactly;
- authorized owner navigation contained 22 links;
- the drawer portal, backdrop, and drawer panel covered the full viewport;
- Close, outside click, and Escape closed the drawer;
- Close and Escape restored focus;
- account menu and navigation drawer were mutually exclusive;
- route navigation closed the drawer and restored body scrolling.

The gate found and fixed one synthetic-only layering defect: the staging banner
was above the drawer header and covered the mobile Close control. The banner now
uses `z-index: 40`, below the drawer's `z-50` layer.

### Worker cards and permissions

- Pick READY and IN_PROGRESS cards exposed Complete Pick, Partial Quantity,
  Problem, and Details;
- Pick PROBLEM exposed only Open Problem and Details;
- read-only Pick exposed only Details and the permission explanation;
- Mark READY and IN_PROGRESS exposed the supported marking actions;
- Assembly READY, IN_PROGRESS, and PROBLEM states were correct;
- Pack READY was actionable;
- Pack blocked by Assembly remained blocked;
- completed Packing was read-only with no duplicate completion action;
- a worker opening `/owner/users` reached a genuine Access Denied page with no
  protected user-management data.

### Pick route decisions

- the saved Direct-to-Pack recommendation remained visible;
- changing the saved route required a bounded reason;
- Other required bounded text;
- missing Marking instructions required explicit confirmation;
- the warning stated that no machine settings or directions would be invented;
- the optional worker note was bounded to 240 characters;
- Cancel and Close caused no task mutation.

### Universal Scanner

- one filtered active scope was displayed correctly;
- one Tracking ID produced two genuine scopes: Order Pick and package Pack;
- completed work used a separate completed read-only counter;
- no-match stated that no action was performed;
- task count, maximum update timestamp, and summed task version were identical
  before and after scan-only checks.

### Data Management

- all eight tabs opened at 390 × 844 without page overflow;
- disabled actions displayed their reason;
- action previews required owner password reauthentication and typed
  confirmation;
- a deliberately incorrect phrase returned a controlled error;
- Cancel and Escape closed the panel and restored focus;
- the deletion-job fingerprint was unchanged;
- no destructive action was completed.

## Automated validation

Passed before the matching build:

```text
npm.cmd run staging:browser-gate-test
npm.cmd run stage4-6a:test
npm.cmd run stage4-3a:test
npm.cmd run permission:test
npm.cmd run security:test
npm.cmd run workflow:test
npm.cmd run universal-scan:test
npm.cmd run grouped-work:test
npm.cmd run grouped-details:test
npm.cmd run direct-stage-actions:test
npm.cmd run production-flow:test
npm.cmd run test:validators
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

The same focused regression and safety matrix passed again after the final
browser-gate cleanup.

## Remaining release gates

Stage 4.6A is closed, but production remains blocked pending:

- a final frozen-version screenshot atlas;
- sanitized two-worker warehouse contention QA;
- production-computer performance measurements;
- final CI and release checks;
- controlled deployment and monitored pilot.

Native Expo development remains after the backend/API contract freeze and
production pilot. No native work was started here.
