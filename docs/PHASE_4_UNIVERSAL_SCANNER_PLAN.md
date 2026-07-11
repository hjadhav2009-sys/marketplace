# Phase 4 Universal Scanner Plan

## Scope

The scanner resolves exact active work across every account the current user is authorized to use. Owners receive all active accounts. Workers receive active assigned accounts plus their active legacy primary account, deduplicated by ID. An optional account filter must be within that set.

The resolver searches compact customer-order fields and listing identifiers, then loads bounded active consignment tasks. It returns separate cards for every matching source, account, and stage. Scanning is lookup-only; mutations require an explicit card action and a second server-side authorization check.

## Matching And Results

Priority is AWB/Tracking ID, FNSKU, Seller SKU, FSN/ASIN, listing identifiers, barcode identifiers, order identifiers, then an explicit work-task ID. Scan mode never uses title or fuzzy matching. Actionable cards sort first, followed by the current worker's assignments, match priority, ready state, and a stable candidate key.

Packed orders and completed tasks are excluded from active cards and contribute only to `completedMatchCount`. Visible problems are read-only scanner candidates. Multiple matches are never auto-selected.

## Security And Actions

The account ID from a form is a selector, never authorization proof. Every action recalculates account access, reloads the source with its account predicate, checks permission, assignment, expected state or quantity, and then calls the existing order/task domain behavior. The selected-account session is not changed. Result payloads omit raw rows, secrets, private paths, and database configuration.

## Performance And Indexes

Universal code-first indexes cover order operational identifiers and listing `identifierType + normalizedValue + accountId`. Queries are exact and bounded to at most 50 returned candidates. The integration test uses the real resolver; the separate SQLite microbenchmark validates the 800,000-identifier index path with `EXPLAIN QUERY PLAN`.

## UI And Tests

`/work/scan` and `/packing` reuse `UniversalScannerPanel`. The existing customer-order scanner remains available under Customer Order Packing. The UI uses a focused input, intent/account filters, prominent account/marketplace labels, compact cards, explicit actions, and completed-only/no-result states.

Tests cover account scope, exact identifiers, duplicate-account matches, order and consignment candidates, problem visibility, completed exclusion, deterministic ordering, bounded results, explicit actions, stale authorization, idempotency, indexes, and the Phase 3.1 regressions.

## Non-goals

No mobile-app changes, APK work, inventory, ERP behavior, customer-order Assembly, Amazon consignment import, fuzzy title search, AI Product Design Identity, or Worker Agent is included.
