# Phase 7.3.6 Stage 4 Visible Browser QA

## Decision

```text
STAGE4_BROWSER_QA_FAILED_BLOCKERS
```

Visible browser QA used Google Chrome 150 with Playwright Core from an ignored temporary runner and a new isolated profile. The browser was restricted to the private synthetic staging server on `127.0.0.1:3188`. No real database, storage, marketplace file, customer data, personal browser profile, tunnel, deployment, push, merge, mobile, Expo, Android, APK or AAB operation was used.

## Visible coverage

The owner-visible runs covered login, dashboard, Accounts, Users, Imports, Product Inventory, Product Details entry points, adaptive header mapping, missing-listing resolution, Consignment intake/review, Work Hub, Pick, Mark, Assembly, Pack, Scanner, Problems, completed-state entry points and the required responsive widths:

```text
360 × 800
390 × 844
430 × 932
768 × 1024
1024 × 768
1440 × 900
```

Ignored evidence contains the checkpoint screenshots, console/network records, browser profiles and structured result files. Expected blocked synthetic remote-image URLs and aborted Next.js prefetch requests were separated from required localhost request failures.

## Verified scenarios

- Product Inventory refresh completed through the visible UI.
- A previously unknown Flipkart Daily Orders header set entered `NEEDS_MAPPING` visibly and was resumed through the owner mapping form.
- First Order file: 100 read, 100 inserted, zero warnings and zero blocking errors.
- Rolling file: 150 read, 50 inserted and 100 unchanged.
- Exact repeat: 150 read, zero inserted and 150 unchanged.
- A conflicting/missing-listing Order import retained the issue; worker work was absent before resolution and visible after the owner created a minimal listing.
- Scanner lookup remained non-mutating.
- Flipkart Consignment mapping/review retained invalid and missing-listing rows.
- Amazon Product Inventory completed and Amazon Consignment review retained blank, negative, decimal and text quantity blockers.
- Order Pick, Mark, Assembly and Pack grouped actions were visibly exercised on bounded synthetic groups.
- Consignment Mark and Assembly actions completed on bounded synthetic tasks.
- Authoritative Consignment Pack rejected a deliberately invalid Pack-only seed task with a missing-Pick prerequisite error.
- Authentication, role navigation, denied access and account isolation were covered by staging smoke and visible role changes.

## UI repair

`GroupedWorkCard` used click capture to set local `processing` state before the form submission event completed. The re-render removed the form, so the server action never received the request and the card could remain on `Processing group…`.

The bounded repair removes the premature card replacement and retains per-form pending feedback through `SubmitButton` and `useFormStatus`. A focused regression prevents reintroducing click-capture form removal.

Visible retest confirmed:

- required native form validation leaves the card present and usable;
- no frozen `Processing group…` card;
- Pick submission reaches the server and routes successfully;
- Pack submission reaches the authoritative service;
- 360px and 430px states remain usable.

Validation passed:

```text
stage4-ui:test
typecheck
lint
staging:test (31 assertions)
security:test
permission:test
git diff --check
production-mode staging build (114 application paths)
staging smoke (15 authorized routes)
```

## Critical backend blocker

A newly imported and activated synthetic Direct-Pack Consignment produced:

```text
PICK task: COMPLETED, quantity 1/1
PACK task: READY, quantity 0/1
route snapshot actual stages: PICK → PACK
route snapshot completed stages: PICK
batch: ACTIVE
```

The Pack card was correctly unlocked. Submitting `Pack Completed` reached the authoritative service but returned:

```text
Picking is required but its work task is missing.
```

The completed Pick task exists for the same Consignment line. This is a backend prerequisite-resolution inconsistency, not a presentation defect, and was not changed during Stage 4.

Until corrected and visibly retested, Consignment Direct-Pack work can become stranded after a successful Pick. Therefore Stage 4 cannot pass and Stage 5 two-worker QA must not begin.

## Remaining work

1. Repair the authoritative Consignment Pack prerequisite resolver in a focused backend phase.
2. Add a real service regression for import → activation → Pick → Pack on the same Consignment line.
3. Rerun the affected visible Consignment checkpoints and Pack duplicate-click check.
4. Complete the full four-route Order and Consignment matrix after the blocker is fixed.
5. Begin Stage 5 two-worker contention QA only after Stage 4 passes.
