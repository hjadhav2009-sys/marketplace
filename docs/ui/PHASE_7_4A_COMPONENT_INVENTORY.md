# Phase 7.4A component and route inventory

## Scope and method

This inventory covers the Next.js web application at audit/source baseline `e81c2f25f29fba99cbf4a254adf26b39856c4a65`. It combines source inventory with the bounded states rendered in the [focused browser evidence](./PHASE_7_4A_BROWSER_EVIDENCE.md); it does not claim that every possible state was populated. The repository contains roughly 186 `app` files (16.8k lines), 28 `components` files (3.6k lines), 82 `src` files (10.6k lines), and 56 `lib` files (7.5k lines).

## Shared shell and primitives

| Primitive | Current responsibility | Reach | Audit disposition |
| --- | --- | --- | --- |
| `AppShell` | account context, header, desktop rail, mobile shell, 1600 px content frame | Most owner, worker, report, inventory, and system routes | Keep; restructure shell in B2 |
| `AppNav` | owner/worker capability links, expanded/collapsed rendering | Broad | Fix active-route matching and navigation grouping in B2 |
| `MobileAccountMenu` and overlay coordinator | account/menu overlays | Mobile shell | Keep behavior; complete menu keyboard pattern/background isolation |
| `PageHeader` | eyebrow, title, description, actions | Broad (about 47 routes through shell/header patterns) | Standardize hierarchy/action limit |
| `StatusBadge` | semantic status label | Dashboard, imports, consignments, inventory, users, reports, packing, problems, system | Keep; normalize sizes and no-shrink behavior |
| `SubmitButton` | pending-state server-action control | Very broad | Keep; unify variants, disabled/pending/live feedback |
| `EmptyState` | list/workflow empty state | Imports, catalog, cleanup, consignments, manual review, system, reports, problems | Keep; require cause and safe next action |
| `StatCard` | KPI card | Dashboard, manual review, system | Consolidate with metric semantics in B1b/B3 |
| `ProductImage` and galleries | safe product/image presentation and retry | Inventory and worker details | Keep; standardize aspect/placeholder/retry language |
| `ProductDetailsDrawer` | detailed listing/product information | Pick/product workflows | Keep; address focus/background semantics in C1/C2 |
| `GroupedWorkCard` | projected grouped work and stage action | Smart Pick/Mark/Assembly/Pack | Core worker primitive; normalize in C1 |
| `WorkTaskCard` | legacy/consignment task card | Consignment queues/problems | Consolidate visual grammar in C1, preserve logic |
| `UniversalScannerPanel` | exact account-scoped work lookup and actions | `/work/scan`, packing integrations | Strong operational pattern; refine in C6 |
| `DataActionDetails` | high-risk data-management action details | Data Management | Keep confirmation/provenance; improve hierarchy in D6a |
| `MarketplaceImportWizard` | legacy import flow | Owner upload/import entry points | Preserve behavior; split marketplace/purpose intent in D3 |

## Complete reusable-file classification

Variants/routes are summarized by family; responsive and accessibility notes describe current source behavior and the required future disposition.

| File | Purpose / principal routes | Current variants and behavior | Duplication / fit / problem | Class / priority / future pattern |
| --- | --- | --- | --- | --- |
| `components/AccountSwitcherForm.tsx` | selected-account change in shell | Native select/form; server-authoritative | Account menu and shell presentation overlap | POLISH P1; shell account control B2 |
| `components/AppNav.tsx` | owner/worker navigation | expanded, collapsed, mobile; permission-driven | Prefix active bug; long ungrouped nav | REFACTOR P1; grouped route-owned nav B2 |
| `components/AppShell.tsx` | global authenticated frame | desktop rail/mobile header/account context | Breakpoints use viewport more than remaining rail width | POLISH P1; responsive shell B2 |
| `components/AwbBarcodeScanner.tsx` | packing scan capture | client scanner/input behaviors | Scanner input patterns overlap universal scan | CONSOLIDATE P2; scanner-input contract C5/C6 |
| `components/DataActionDetails.tsx` | destructive scope/evidence | disclosure/detail presentation | Unique safety content; visual shell duplicated | KEEP P1; risk-detail surface D6a |
| `components/DynamicMarketplaceListingForm.tsx` | marketplace listing form | field sets by marketplace | Large specialized form; basic fields repeated | POLISH P2; shared field primitives D1/D2 |
| `components/EmptyState.tsx` | empty collections/work | title/description/optional action | Several routes hand-roll empty boxes | CONSOLIDATE P1; causal empty state B1b |
| `components/FileUploadField.tsx` | file upload input | file constraints/help | Upload pages also hand-roll file controls | POLISH P2; upload field D3/D4 |
| `components/FormPendingStatus.tsx` | pending feedback | client pending state | Live-region usage inconsistent around forms | CONSOLIDATE P1; feedback contract B1b |
| `components/ImportJobProgress.tsx` | import state/progress | status-specific progress | Import job/list cards duplicate status hierarchy | POLISH P1; import progress D3 |
| `components/MarketplaceImportWizard.tsx` | legacy marketplace import wizard | purpose/marketplace steps | Entry intent stale/overlapping; preserve importer logic | REFACTOR P1; import-intent shell D3 |
| `components/MobileAccountMenu.tsx` | mobile account/actions menu | menu roles, Escape/outside close, focus return | Missing arrow/Home/End and managed initial focus | REFACTOR P1; accessible menu B2 |
| `components/MobileOverlayCoordinator.tsx` | prevent competing overlays | drawer/account coordination | Background inert semantics incomplete | POLISH P1; overlay coordinator B2 |
| `components/PageHeader.tsx` | route context/title/actions | eyebrow/title/description/children | Routes hand-roll adjacent navigation/action density | CONSOLIDATE P1; page-header contract B2 |
| `components/PickerProductCard.tsx` | picker product card/details | image, identity, detail drawer, actions | Overlaps grouped/task/scanner anatomy | CONSOLIDATE P1; WorkCard/product identity C1/C2 |
| `components/ProductDetailsDrawer.tsx` | contextual product details | modal drawer, large detail sections | Focus/background and page/drawer overlap need review | POLISH P1; details drawer C1/D2 |
| `components/ProductImage.tsx` | safe bounded image/fallback/retry | sizes, badge, external retry | Strong behavior; surrounding size rules vary | KEEP P1; canonical image primitive C1/D1 |
| `components/product-image-actions.ts` | image-related actions | server-action helpers | Behavior, not a visual primitive | KEEP; frozen business behavior |
| `components/ProductImageGallery.tsx` | product gallery | thumbnails/active image | Similar Work gallery | CONSOLIDATE P2; gallery primitive D2 |
| `components/ScannerPickRouteDialog.tsx` | scanner route choice | dialog/form/action state | Overlaps `WorkRouteDialog`; verify focus contract | CONSOLIDATE P1; route decision dialog C2/C6 |
| `components/StatCard.tsx` | metrics | basic label/value/detail | Manual metrics and dashboard cards duplicate | REPLACE P1; scoped Metric B1b/B3 |
| `components/StatusBadge.tsx` | status vocabulary | mapped semantic classes/fallback | No-shrink/intrinsic width contributes to overflow | POLISH P1; normalized badge B1b |
| `components/StructuredDetails.tsx` | grouped label/value details | sectioned disclosure/read-only | Useful operational density | KEEP P2; detail sections C/D |
| `components/SubmitButton.tsx` | server-action submission | primary/secondary/pending | Route buttons/links use many ad hoc classes | CONSOLIDATE P1; Button family B1a |
| `components/UniversalScanInput.tsx` | scan-first exact input | focus/select behavior | AWB/queue search inputs overlap | CONSOLIDATE P1; scanner input C6 |
| `components/UniversalScannerPanel.tsx` | account-scoped lookup/results/actions | filters, candidate states, action-specific forms | Dense monolith; strongest business-specific pattern | REFACTOR P1; scanner composition C6 |
| `components/WorkImageGallery.tsx` | worker reference gallery | work images/fallback | Duplicates product-gallery frame | CONSOLIDATE P2; gallery primitive C1/C3/C4 |
| `components/WorkRouteDialog.tsx` | Pick route decision | dialog, prerequisite warnings, action | Dialog implementation overlaps scanner version | CONSOLIDATE P1; route dialog C2 |
| `app/work/GroupedWorkCard.tsx` | projected order/consignment work | stage/source/action branches | Dense multi-purpose file and repeated card grammar | REFACTOR P1; WorkCard adapters C1 |
| `app/work/WorkTaskCard.tsx` | consignment legacy/task/problem card | stage/status/forms/disclosures | Extremely compressed layout and parallel grammar | REFACTOR P1; WorkCard adapters C1/C6 |
| `app/work/ExactMemberSelection.tsx` | exact member selection in grouped work | selection/action UI | Specialized; must preserve exactness/conflicts | POLISH P1; WorkCard selection C1/C2 |
| `app/work/LiveStageSummary.tsx` | refreshed stage counts | client live summary | Announcement/hierarchy contract incomplete | POLISH P2; live Metric/status C1 |
| `app/work/LiveWorkHubSummary.tsx` | refreshed hub counts | capability/source summary | Similar metric/status presentation | CONSOLIDATE P2; live Metric/status C1 |
| `app/work/LiveWorkRefresh.tsx` | bounded live refresh | refresh coordination | Behavior is useful; avoid decorative update motion | KEEP; C1 accessibility review |
| `app/work/SmartStagePage.tsx` | projected stage page composition | source chooser, projection warning, queue | Shared stage shell is strong; source-card UI ad hoc | POLISH P1; stage-page pattern C2–C5 |
| `app/work/WorkerQueuePage.tsx` | legacy consignment queue | search/status tabs/task cards | Naming and card grammar diverge from SmartStage | CONSOLIDATE P1; stage-page adapter C1–C5 |
| `app/work/assembly/OrderAssemblyCard.tsx` | order assembly task | instruction/action card | Stage-specific but repeats work-card anatomy | CONSOLIDATE P1; Assembly adapter C4 |

Native buttons, links, inputs, selects, textareas, checkboxes/radios, `details/summary`, tables, tabs, pagination, cards, alerts, and loading blocks are also repeatedly authored at route level. They are not separate component files today; B1a/B1b should introduce only the smallest primitives with multiple proven consumers, while B1c collection primitives remain deferred until the first owner collection. Dialog, sheet, and drawer selection rules live in the design-system proposal.

## Route families

### Authentication and access

- `/login`, `/forgot-password`, `/change-password`, `/access-denied`, session-expiry behavior, and password-reset actions.
- Strengths: bounded forms and explicit access outcomes.
- Debt: auth surfaces are visually separate from the operational shell and need one shared auth panel, consistent feedback roles, and predictable focus on error.

### Dashboard

- `/dashboard` combines five KPI cards, recent work, recent imports, and quick actions.
- The page is semantically warehouse-specific but its composition is a generic equal-weight dashboard.
- P1: import quick actions are stale/Flipkart-specific and route through the same legacy upload entry even for Amazon context.
- P1: fetched status context is underused, so open risk, age, assignment, throughput, and import health are not prioritized.
- Confirmed preserved 360 px evidence: 433 px document width on a 360 px client (73 px overflow), caused by the Recent imports grid/card row and intrinsic nowrap content.

### Worker hub and stages

- `/work` capability hub; `/work/pick`, `/work/mark`, `/work/assemble`, `/work/pack` projected grouped queues; legacy/source-specific routes under `/work/consignments/*`, `/work/marking`, and `/work/assembly`; group/task detail routes; `/work/problems`; `/work/scan`; `/packing` and `/packing/[awb]`.
- Strongest patterns: exact selected-account context, scanning is read-only until explicit action, 44/56 px targets, status plus text, preserved quantities and problem history.
- Debt: duplicated projected and legacy card grammars, long worker navigation, uneven naming (`mark`/`marking`, `assemble`/`assembly`), dense inline forms, and insufficient progressive disclosure in legacy cards.

### Product inventory and product details

- `/owner/product-inventory`, create/detail/edit routes, product/image/marking details, missing-data views, and marking-library relationships.
- The responsive inventory card is a good starting pattern: identity, thumbnail, badges, compact metadata, mobile disclosure, and one clear details action.
- Debt: product identity vocabulary varies by marketplace; missing fields and mapping health need a consistent issue model; details/drawer/page patterns overlap.

### Imports

- `/owner/imports`, upload/new entry points, job detail, mapping, issue list/export, marketplace file-role confirmation, and product-inventory import flows.
- Strengths: retained-file/retry boundaries, owner-only mapping, safe issue copy, and responsive issue cards.
- Debt: desktop history table requires 1500 px minimum width and 18 columns; purpose/marketplace entry intent is fragmented; status/action hierarchy is difficult to scan.

### Consignments

- Batch list/create/detail, import/review/issues, activation, line details, and worker stage queues.
- Strengths: explicit marketplace/account context and activation validation.
- Debt: review screens compress many per-line forms into dense source, batch/line state is visually inconsistent, and actions need stronger separation from evidence and blocking issues.

### Accounts and users

- `/owner/accounts` creates/edits seller accounts and exposes last-import/account context.
- `/owner/users` creates workers, assigns accounts/capabilities, edits identity/permissions, resets passwords, and lists users.
- P2: Accounts has five disclosures and Users has twelve; all are visually closed initially, but their repeated create/edit/capability/password forms are already instantiated (10 Accounts forms; 41 Users forms and about 2,200 DOM nodes). Use a summary collection plus one focused edit surface.
- Accounts also has four true controls measuring 40 px high at all six audited widths. Address Accounts in D5a and Users in D5b without changing permissions or server actions.

### Data management, reports, and system

- Data Management provides tabbed inventory/import/trash/history views and typed destructive confirmations; history table has a 760 px minimum.
- Reports and System use repeated metric/status/card patterns but lack a shared administrative information architecture.
- Preserve typed confirmation, retention deadlines, quarantine/restore semantics, audit evidence, and production checks. Recompose only presentation.

## Pattern duplication and consistency findings

- Radius use is highly fragmented: `rounded-md` 814 occurrences, `rounded-full` 117, `rounded-xl` 110, `rounded-lg` 58, `rounded` 21, `rounded-2xl` 14, and `rounded-none` 3 across app/components.
- Declared CSS root tokens are not consistently consumed; many surfaces encode raw Tailwind choices directly.
- Cards, banners, metric blocks, tabs, pagination, filters, and table wrappers are repeatedly handwritten.
- Success/error banners do not consistently use live-region roles.
- Some `role=tab` patterns lack the full keyboard/selection relationship.
- The account menu lacks arrow-key menu navigation; the drawer has a focus loop/return but does not isolate the background with `inert`.
- `AppNav` prefix matching can produce multiple simultaneous `aria-current` links for nested routes.

## Keep, consolidate, retire

Keep the product-specific scanner, account context, workflow snapshots, product-image safety, status labels, explicit forms, and responsive inventory cards. Consolidate shell/navigation, headers, feedback banners, metrics, status badges, table/list shells, filters, pagination, work cards, and product details. Retire only redundant presentation patterns after route-level parity is proven; no business route or action is retired by this audit.
