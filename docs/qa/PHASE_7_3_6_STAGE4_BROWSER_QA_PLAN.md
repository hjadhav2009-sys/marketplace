# Phase 7.3.6 Stage 4 browser QA plan

## Boundary

Use only the prepared private synthetic staging environment on `127.0.0.1:3188`. Do not connect production data, production storage, public tunnels or real marketplace credentials. Start with `npm.cmd run staging:start`; stop with `npm.cmd run staging:stop`.

## Required widths

Test exact viewport widths `360`, `390`, `430`, `768`, `1024` and `1440`. Capture sanitized screenshots to ignored private storage. Source inspection is not browser evidence.

## Route coverage

Review login, dashboard, account selection, Users, Product Inventory, Imports, Missing Listings, Consignments, Work Hub, Pick, Mark, Assembly, Pack, Scanner, Problems, Reports and System. Validate long identifiers, images/fallbacks, template selectors, advanced field search, pending/error states and owner/worker navigation.

## Acceptance

- visible private synthetic staging banner;
- no horizontal overflow or text overlap;
- touch targets at least 44px;
- keyboard/scanner focus remains usable;
- errors are accessible and contain no internal path or stack trace;
- no hydration or uncaught console errors;
- no unexplained 4xx/5xx or duplicate requests;
- no private or production value in the DOM, console or network payload.

All items remain untested until a real browser run records evidence.
