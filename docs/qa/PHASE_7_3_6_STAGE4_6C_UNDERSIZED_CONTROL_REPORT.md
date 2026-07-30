# Phase 7.3.6 Stage 4.6C — Undersized Operational Controls

## Evidence boundary

This report records the browser-proven Checkpoint B baseline before runtime
repairs.

```text
Frozen source SHA:                 7462fabeae9876907b0d5b26aee3117b3cd8d819
Checkpoint A source SHA:           6f25dfffb406bcc0732fb1fb33f946df5de5fad5
Captured frozen entries inspected: 199
Affected entries:                  159
Undersized control occurrences:    586
Deduplicated source families:       7
```

The Checkpoint A commit changed QA tooling only, so the frozen measurements
remain the valid pre-repair runtime baseline.

An enabled operational control is undersized when either its measured width or
height is below 44 CSS pixels. Disabled explanatory controls and
noninteractive text are not included.

## Deduplicated findings

| Component family | Source | Selector/control | Route families | Viewports | Occurrences | Smallest size | 44 px rule |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| App-shell account/home link | `components/AppShell.tsx` | Header account/home `a[href]` | Owner pages, worker Pick, dashboard | 360, 390, 430, 1024, 1440 | 146 | 88 × 40 | Applies |
| Dashboard section link | `app/dashboard/page.tsx` | `View all` link | Dashboard | All six | 6 | 49 × 20 | Applies |
| Import progress actions | `components/ImportJobProgress.tsx` | Navigation, review, export, issue and retry links | Mapping, running, completed, warning, failed and cancelled import details | All six | 304 | 95 × 36 | Applies |
| Upload-review actions | `app/owner/uploads/[batchId]/review/page.tsx` | `Apply`, `Upload another PDF`, and `Manage SKU image mappings` | Upload review | All six | 18 | 69 × 20 | Applies |
| Consignment detail links | `app/owner/consignments/[batchId]/page.tsx` | `View issues` and `All consignments` | Draft, active and completed details | All six | 30 | 119 × 42 | Applies |
| Consignment review filters/actions | `app/owner/consignments/[batchId]/review/page.tsx` | Issues link and horizontal filter links | Activation review | All six | 66 | 42 × 36 | Applies |
| Consignment issue controls | `app/owner/consignments/[batchId]/issues/page.tsx` | `Back to review` and `Filter` | Issue drill-down | 360, 390, 430, 768 and 1440 | 16 | 128 × 24 | Applies |

Total: **586 occurrences across seven shared source families**.

## Representative live reproduction

At `360 × 800`, the synthetic running-import page reproduced 11 enabled
undersized controls. Examples:

```text
Header account/home link: 209 × 40
Start another import:      165 × 38
Back to imports:           130 × 38
View Product Inventory:    180 × 36
Summary CSV:               119 × 38
Issues CSV:                 94 × 38
```

The remediation should change shared layout classes in these seven families,
not patch 586 rendered occurrences independently.

## AUTH_EXPIRED 404 reproduction

The frozen browser evidence recorded one console 404 in
`AUTH_EXPIRED:360x800`. The expired-session page itself completed correctly:

```text
Final URL: /login?expired=1&next=%2Fdashboard
HTTP page status: 200
Visible state: Sign in + session-expired message
Protected content: absent
Redirect loop: absent
```

The failed browser resource is:

```text
GET /favicon.ico
HTTP 404
```

The application HTML contains a manifest link but no `rel="icon"` link.
`public/icon.svg` returns 200, while `/favicon.ico` returns 404. A fresh browser
therefore requests the conventional favicon path; the first expired-session
capture exposed that missing resource as a console error. This is a metadata
asset declaration defect, not an authentication authorization failure.
