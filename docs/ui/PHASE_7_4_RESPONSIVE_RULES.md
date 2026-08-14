# Phase 7.4 responsive rules

## Supported audit widths

Every implementation chunk must be checked at all six owner-approved widths: 360, 390, 430, 768, 1024, and 1440 px. Widths are evidence points, not permission to optimize only for six screenshots.

## Global invariants

1. `document.documentElement.scrollWidth` must not exceed `clientWidth` by more than one rounding pixel.
2. Long identities, filenames, SKUs, ASIN/FNSKU/FSN/listing IDs, AWBs, and account names must wrap, truncate with an accessible full-value affordance, or scroll inside an explicitly bounded data region.
3. Grid/flex children carrying variable text use `min-w-0`; responsive tracks use `minmax(0, 1fr)`.
4. Status/action controls must not force content width. Badges may retain intrinsic width only when the neighboring content can shrink safely.
5. Operational targets are at least 44 px high/wide; scanner primary controls may be 56 px.
6. Focus indicators remain fully visible and are not clipped by overflow containers or sticky regions.
7. Reading order, tab order, and visual order remain aligned.
8. No required production fact or permitted primary action disappears solely because the viewport is small.

## Shell behavior

### 360–430 px

- Desktop sidebar is absent; one labelled menu trigger opens a modal navigation drawer.
- Drawer traps focus, closes on Escape, returns focus, prevents background scroll, and makes background content inert/unavailable to assistive interaction.
- Header shows product/account identity and only essential controls; secondary context moves into the drawer/account menu.
- Content padding targets 12–16 px.

### 768 px

- Do not assume tablet width can hold desktop header density. Keep the mobile/tablet shell until the content rail and controls have measured room.
- Two columns are allowed only when each child remains useful at its actual shell-adjusted width.
- Filter/action bars wrap as labelled groups instead of shrinking controls below target size.

### 1024 px and wider

- Desktop navigation may appear only after the remaining content rail is measured; a viewport breakpoint alone is insufficient.
- Multi-column workspaces are allowed where columns retain meaningful minimum widths.
- Supporting details may use a side drawer instead of compressing the primary task.

### 1440 px and wider

- Desktop navigation rail is visible; content width is calculated after the 264 px expanded or 72 px collapsed rail.
- Dense owner comparison views may use tables, but identity and action columns remain discoverable and keyboard-accessible.
- Five equal KPI columns are not a default. Use priority, grouping, and available-width tests.

## Component rules

### Dashboard and metric cards

- Order metrics by urgency and actionability, not by arbitrary count.
- Avoid orphaned final cards in two-column mobile grids; use one column, a deliberate featured metric, or an even layout.
- Every value names its time scope and account/source scope.
- Recent items use `min-w-0` at grid, card, row, and text-wrapper levels. Badge/action areas cannot establish the grid track's minimum width.

### Worker cards

- Mobile order: source/stage/status; product identity/image; quantity and assignment; required instructions/evidence; primary action; problem/history disclosure.
- Only the permitted next action receives primary emphasis.
- Forms stack on mobile. Side-by-side quantity/button layouts require measured room and must not compress numeric inputs.
- Product/marking/assembly details may collapse only when they are not required for the current action.

### Scanner

- Input, intent/source filters, and Find action are a stable first region; results never shift focus unexpectedly.
- On mobile, controls stack and results occupy one column. At desktop, the control column may be sticky if focus and zoom do not obscure results.
- Search results show selected account, exact-match identifiers, stage state, and read-only reason before actions.
- Live lookup counts/timing use appropriate status semantics without repeated noisy announcements.

### Tables, lists, and cards

- Prefer cards/lists on mobile when each row has actions or long identity fields.
- Use an internally scrollable table only for genuine multi-row comparison. Label the region, keep headers associated, and provide a visible cue that more columns exist.
- Tables never set document width. `min-width` must be inside an `overflow-x-auto` region whose own width is constrained.
- At tablet, choose column presets; do not merely expose a 1500 px table through a narrow peephole.

### Forms, dialogs, and menus

- Labels remain visible; placeholders are examples, not labels.
- Error summary or first invalid field receives focus after failed submission where server-action behavior permits.
- Dialogs/drawers trap focus and isolate background. Menus implement Up/Down/Home/End/Escape and sensible initial focus.
- Destructive confirmation copy, scope, typed phrase, retention behavior, and audit consequences remain visible at every width.

## Known baseline defect

Fresh focused evidence recorded dashboard `clientWidth/scrollWidth` of `360/433`, `390/433`, and `430/433`, for 73, 43, and 3 px overflow; 768/1024/1440 had none. Recent imports anchors measured about 419 px wide inside a card reaching x=433. The import filename/metadata/intrinsic-badge min-content chain establishes an oversized implicit grid track, and the sibling Recent work card expands to the same track. This must be fixed and remeasured in B3; clipping or `overflow-x-hidden` on the document is not an acceptable fix.

## Browser QA matrix

For every representative route/state record: route, role/account, fixture/state, viewport, client/scroll width, focused control, keyboard path, screenshot, console/page/request errors, and pass/fail rationale at 360/390/430/768/1024/1440 as applicable. Minimum representative coverage:

- auth success/error/access-denied;
- owner and worker shell, expanded/collapsed/drawer/account menu;
- dashboard populated/empty/error/import-risk;
- each worker stage, grouped and legacy card, scanner no-result/multiple/result/problem/completed;
- inventory list/detail/missing-data;
- imports list/job/mapping/issues;
- consignment list/review/detail/issues;
- accounts/users create/edit/permission variants;
- Data Management destructive flow, Reports, and System health.

Phase 7.4A1 completed a controlled repository-Playwright run against `PRIVATE_SYNTHETIC_STAGING`: 102 route/state/width records, seven sanitized screenshots, and no console/page/request/HTTP errors. Only Dashboard overflowed the document, at 360/390/430; the other inspected routes were contained. Shell current-link, drawer isolation, account-menu keyboard, collapsed-but-instantiated admin forms, and exact Accounts target sizes were measured. See [Phase 7.4A1 focused browser evidence](./PHASE_7_4A_BROWSER_EVIDENCE.md). Populated Mark, Assembly, Pack, and Work Problems states were not reproduced, so their later chunks must still satisfy their own browser gates.
