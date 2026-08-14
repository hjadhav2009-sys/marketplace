# Phase 7.4 design-system proposal

## Direction: Operations Ledger

Retain the existing stone/slate/berry visual identity and turn it into a compact operations system. The signature is not a decorative motif; it is a consistent ledger-like anatomy: context, state, evidence, responsibility, and next action. A screen should still feel like Marketplace Pick & Pack with all marketplace data removed because shell rhythm, work-card anatomy, semantic states, and action hierarchy remain recognizable.

This is a proposal for later implementation, not a claim that current code already conforms.

## Token layer

### Color roles

| Role | Proposed value/family | Use |
| --- | --- | --- |
| canvas | stone-50 / `#fafaf9` | application background |
| surface | white | cards, tables, forms, overlays |
| text | slate-950 / `#0f172a` | primary identity/content |
| muted | slate-600/500 | supporting metadata with verified contrast |
| border | slate-200/300 | grouping and control boundaries |
| action | berry-800 / `#9f1239` | one primary action/current identity |
| success | teal-700 plus teal-50 | completed/healthy/safe confirmation |
| warning | amber-800 plus amber-50 | attention/locked/missing prerequisite |
| danger | rose-700 plus rose-50 | blocking error/problem/destructive intent |

No semantic meaning is encoded by background alone. Avoid using berry as a decorative brand wash.

### Type roles

- Page title: 24–30 px, bold/black only where scanability benefits.
- Section title: 18–20 px, 700.
- Card identity: 16 px, 600–700.
- Body/action: 14–16 px, 500–700 according to role.
- Metadata: 12–14 px; never below 12 px for functional text.
- Numeric operational value: 24–32 px, tabular numerals where comparison matters.

Reduce indiscriminate `font-black`; reserve it for primary identifiers, urgent values, and worker action labels.

### Shape, spacing, elevation

- Radius: control/small surface 6 px; normal card 8 px; emphasized/overlay 12 px; pill only for compact status/filter tokens.
- Space: 4/8/12/16/20/24/32 px scale.
- Shadow: border-first surfaces; small shadow for ordinary cards; raised shadow only for overlays/sticky elevated regions.
- Control heights: 44 px standard, 56 px scan-first.

## Primitive set for B1

Implement only primitives proven by current duplication:

- `Button`/link-button variants: primary, secondary, quiet, danger; pending/disabled/focus states.
- `Field`, `SelectField`, `TextAreaField`, error/help text.
- `FeedbackBanner`: status, warning, error with correct live-region behavior.
- `Surface`/`SectionCard` with two radius/density variants.
- `Metric`: value, label, timeframe/scope, status/action linkage.
- `StatusBadge`: normalized semantic mapping, icon/text, shrink behavior.
- `EmptyState` refinement.
- `FilterBar`, `Pagination`, and internally scrollable `DataRegion` only if they stay small and composable.

Do not create a speculative component catalog. Each primitive needs at least two real consumers in the planned sequence.

## Composite patterns

### Application shell

- One route-ownership algorithm; one current item.
- Owner groups: current work/overview, catalog/process, data/imports, people/accounts, reports/system. Final labels follow repository routes and owner review.
- Worker navigation is capability-aware and task-ordered: Scan/Work, then permitted stages, Problems, and secondary account/help controls.
- Drawer and account menu use complete keyboard/focus semantics.

### Page header

Eyebrow = stable context; title = current object/task; description = one purpose/recovery sentence; actions = one primary plus limited secondary. Avoid turning every route link into header buttons.

### Work card

1. Source, marketplace/account, stage, status.
2. Product image and primary identifier/title.
3. Quantity/progress and assignment.
4. Current-stage evidence/instructions and prerequisite state.
5. One permitted primary action; secondary/recovery actions.
6. Problem and history disclosure.

This anatomy unifies presentation while keeping stage/business behavior separate.

### Owner data collection

- Mobile: card/list with key identity, state, top evidence, one action, and disclosure.
- Desktop: table for comparison only, with intentional column preset and constrained scroll region.
- Detail/edit: one selected object in a page, drawer, or dialog chosen by complexity; not every editor expanded at once.

### Dashboard

An operational command center, not a decorative analytics grid. Top layer answers: what is blocked, how old, who owns it, what moved today, did the latest import succeed, and what action is next. Secondary layers provide recent work/import evidence and correctly scoped creation/import actions.

## Feedback and state contract

Every interactive pattern specifies loading, empty, success, warning, blocking error, stale/conflict, read-only/no-permission, and long-content behavior. Skeletons preserve the final structure. Success copy names what changed; error copy names what did not change and the next safe recovery step.

## Accessibility contract

- Semantic native elements first.
- Complete ARIA patterns where native semantics are insufficient.
- Focus visible, never clipped; overlay focus entry/containment/return/background isolation.
- Logical heading/landmark hierarchy.
- Table caption/headers and labelled scroll region.
- 44 px targets, sufficient contrast, zoom/reflow, and reduced-motion support.

## Motion contract

Default is no motion. Drawer/dialog may use 120–180 ms opacity/translate; feedback may appear without movement; progress/count changes do not bounce or count up. All motion is interruptible and removed/reduced under user preference.

## Drawer, sheet, dialog, and toast system

### Side drawer

Use on desktop for secondary record inspection that supports—not replaces—the current task: product details preview, audit/history evidence, image/marking reference, or read-mostly metadata. Keep the main route and selection visible. Do not place a long primary create/edit workflow or destructive confirmation in a drawer merely to avoid navigation.

Requirements: labelled modal/non-modal semantics chosen deliberately, focus entry/return, Escape, background isolation when modal, width bounded to leave task context visible, its own scroll region, URL/deep-link strategy for important records, and a full-page fallback at narrow widths.

### Bottom sheet

Use on 360–430 px for short contextual choices close to a worker's current action: route choice, compact filter/sort, or a small secondary action set. It must not contain long forms, production instructions that need persistent comparison, dense tables, or irreversible confirmation. Primary action stays reachable above the safe area; the sheet supports drag only as an enhancement and always has an explicit close control.

### Dialog

Use for short blocking decisions and confirmations: problem reporting/resolution, typed destructive confirmation, or a concise route decision whose consequences are stated. Use a dedicated page for long, multi-section, linkable, or recoverable editing. A dialog has a labelled title/description, initial focus chosen by risk, containment, Escape unless the transaction cannot safely dismiss, focus return, and no ambiguous primary/danger styling.

### Toast/status feedback

Use an inline `role=status` near the affected scope for durable or recoverable action results. A toast is optional for brief cross-page acknowledgement only; it never carries the sole error, required next step, generated identifier, or destructive result. Do not add a toast dependency during 7.4A. Errors stay inline with `role=alert` and focus/recovery guidance.

## Performance contract

- Prefer Server Components and native controls; add client JavaScript only for local interaction that needs it.
- Do not add an animation framework or broad design-system package for polish.
- Avoid whole-page remounts for local drawers, disclosures, filters, and feedback.
- Fetch heavy secondary drawer details on demand and cancel stale requests.
- Bound/lazy-load images and preserve layout dimensions.
- Skeletons mirror final structure and never delay an otherwise available action.
- Any dependency proposal records purpose, measured bundle impact, maintenance health, why existing code is insufficient, and removal/rollback cost.

## Library decision

No new dependency is approved by this proposal. If hand-maintaining overlay/menu behavior becomes the main risk, evaluate Base UI in an isolated B1 proof. Record minified/gzip impact, accessibility coverage, styling/control fit, maintenance health, SSR compatibility, and rollback before adoption.

## Governance

- `PRODUCT.md` owns durable product truth.
- `DESIGN.md` and `.impeccable/design.json` own current visual rules.
- This proposal owns the planned convergence target until implemented.
- Each chunk updates shared design documentation only when it actually changes the implemented system.
- Detector warnings require human verification; the dashboard `gray-on-color` warning at line 152 is a documented false positive because the colored class is hover-only and the foreground is dark on a pale surface.
