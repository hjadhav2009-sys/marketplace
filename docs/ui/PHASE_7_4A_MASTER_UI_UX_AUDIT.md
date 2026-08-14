# Phase 7.4A master UI/UX audit

## Executive verdict

The application has a sound operational core and an acceptable accessibility floor, but not yet a coherent production design system. It is warehouse-specific in language and behavior while remaining structurally close to a generic admin dashboard. The highest-value work is not a visual rebrand: it is clarifying owner decision hierarchy, consolidating duplicated worker/card/shell patterns, fixing responsive intrinsic sizing, and completing keyboard/live-feedback semantics.

No P0 safety defect was identified in this UI-only audit. Three P1 findings need resolution before broad polish. The independent Impeccable heuristic review scored the current experience 22/40 (acceptable, with significant consistency, visibility, prevention, efficiency, recovery, and help debt). Cognitive-load review found five of eight risk conditions: no single focus, weak nav chunking, too many equal-weight choices, limited progressive disclosure, and insufficient hierarchy.

## Audit baseline and constraints

- Repository: `hjadhav2009-sys/marketplace`
- Branch: `phase-7.4a-ui-foundation-audit`
- Baseline/source SHA: `e81c2f25f29fba99cbf4a254adf26b39856c4a65`
- Scope: design skills, source audit, controlled synthetic-staging browser evidence, responsive/accessibility analysis, design-system proposal, implementation sequence, and PostgreSQL roadmap.
- Frozen: runtime application code, business logic, routes/actions, permissions, account isolation, workflow/database semantics, imports/reports, mobile app, deployment, merge, and PR creation.

## Evidence quality

The audit combined repository-wide source inspection, component/route usage mapping, Prisma schema comparison, installed-skill detector output, two independent Impeccable critiques, and a fresh repository-controlled Playwright run against `PRIVATE_SYNTHETIC_STAGING`. The closure produced 102 route/state/width records at the six approved widths, seven sanitized screenshots, and zero console errors, page errors, unexpected failed requests, or HTTP error responses. Full measurements and reproduction limits are in [Phase 7.4A1 focused browser evidence](./PHASE_7_4A_BROWSER_EVIDENCE.md).

The browser closure confirms the dashboard overflow, marketplace/import mismatch, multiple-current navigation, shell keyboard gaps, admin DOM complexity, and responsive containment findings described below. It disproves the earlier wording that repeated Accounts/Users editors were visually expanded initially: the disclosures are closed, but their forms are already instantiated. Populated Mark, Assembly, Pack, and Work Problems states were not reproduced and remain mandatory C3–C6 implementation gates.

## What is working

- Account and capability context is explicit across owner and worker routes.
- Scanning/searching does not mutate work; actions remain explicit.
- Worker surfaces preserve quantities, assignment, workflow snapshots, problem state, and missing-instruction warnings.
- Global focus styling is visible (3 px teal outline with 2 px offset).
- Most operational controls meet a 44 px target; scanner controls are 56 px. Four Accounts controls measure 40 px high and are tracked as F13.
- Drawer code handles Escape, focus looping, focus return, and body-scroll lock.
- Status is normally expressed with text and semantic color, not color alone.
- Product inventory cards demonstrate a useful responsive identity/details pattern.
- Import flows preserve retained-file and retry boundaries and avoid exposing private raw order/customer data in issue copy.
- Data Management preserves typed destructive confirmation, quarantine, restoration, retention, and audit concepts.

## Findings by severity

### Canonical findings matrix

| ID / severity | Route family and source | Roles / widths | Current behavior | Recommended behavior / reusable pattern | Risk / phase |
| --- | --- | --- | --- | --- | --- |
| F01 P1 | Owner overview; `app/dashboard/page.tsx:18–25,38–42,76–80` | Owner; all | Flipkart-specific import IA can appear for Amazon context and actions converge on a legacy entry | Marketplace/purpose-aware action group using existing routes | Wrong conceptual action; B3 |
| F02 P1 | Shell; `components/AppNav.tsx:16–20,79–99` | All; all | Prefix matching can mark multiple links current | Longest/exact route ownership in shared nav | Orientation/a11y; B2 |
| F03 P1 | Dashboard and `lib/data.ts:111–142` | Owner; all | Equal metrics hide exception age, ownership, throughput scope, and import health | Operational metric/action strip with explicit scope/time | Slow risk detection; B3 |
| F04 P2 | Dashboard `page.tsx:83,110,120–134`; `StatusBadge.tsx:47` | Owner; 360/390 | Intrinsic grid/flex sizing yields 433 px document on 360 px client | Constraint-safe grid/card/row primitive with `min-w-0` | Hidden/clipped UI; B3 |
| F05 P2 | Owner/worker shell `AppNav`, `AppShell` | All; 360–1440 | ~22 owner links and long capability nav lack task chunking | Grouped labelled navigation; no icons-only fallback | High search/recall cost; B2 |
| F06 P2 | Imports `app/owner/imports/page.tsx` | Owner/import manager; 360–1024 | 18-column, 1500 px table is a narrow peephole | Mobile cards plus desktop column presets/data region | Comparison/overflow; D3 |
| F07 P2 | Users `app/owner/users/page.tsx:251,314–401` | Owner; all | Disclosures start closed, but repeated edit/password forms are already instantiated per user | Summary collection plus one focused editor | Error/cognitive/DOM cost; D5b |
| F08 P2 | Worker `GroupedWorkCard`, `WorkTaskCard`, `UniversalScannerPanel` | Workers/owner; all | Multiple card anatomies reorder identity/state/evidence/action | Shared WorkCard anatomy with stage adapters | Misread/maintenance drift; C1–C6 |
| F09 P2 | Mobile drawer/account menu/role tabs | All; 360–1024 | Incomplete inert/menu-arrow/tab keyboard behavior | Shared overlay/menu/tab primitives with complete focus patterns | Keyboard/a11y; B1a/B2 |
| F10 P2 | Shared app/components | All; all | Repeated cards/banners/filters/pagination; seven radius families | Tokenized primitives migrated only by chunk | Visual/behavior drift; B1a–B1c then C/D |
| F11 P2 | Consignment review/details | Owner/import manager; all | Dense repeated per-line forms mix evidence and mutations | Review row/card with issue summary and focused action | Activation error risk; D4 |
| F12 P3 | Dashboard/loading | Owner; 360–430 | Fifth equal KPI is orphaned and skeleton differs from content | Deliberate metric priority and state-parity skeleton | Polish/comprehension; B3 |
| F13 P2 | Accounts `/owner/accounts` | Owner; all six widths | Switch, Deactivate, Reactivate, and deactivation-confirmation input are each 40 px high | Raise true interactive boxes to at least 44 px without changing actions | Touch/motor target; D5a |

Every later defect must use this same evidence shape. A recommendation does not authorize business behavior change.

### P1 — dashboard marketplace/import information architecture is incorrect or stale

The dashboard quick-action labels and descriptions are Flipkart-specific while account context may be Amazon, and multiple actions resolve to the same legacy upload path. This reduces real-world match and can steer owners toward the wrong conceptual import. Evidence: `app/dashboard/page.tsx` around lines 18–25, 38–42, and 76–80.

Recommendation: in B3, make import actions purpose- and marketplace-aware using existing route/business capabilities only. Do not merge Amazon and Flipkart flows or change import logic. If a correct route does not exist, label the limitation rather than inventing one.

### P1 — navigation can expose multiple current items

`AppNav` uses prefix matching for active state, so nested routes can make a parent and child link simultaneously `aria-current`. This harms orientation and screen-reader semantics. Evidence: `components/AppNav.tsx` around lines 16–20 and 79–99.

Recommendation: B2 defines exact-match/longest-match route ownership, then proves one current link at a time for representative nested routes.

### P1 — dashboard hides operational risk and mixes time horizons

Five equal KPI cards, recent work/imports, and quick actions do not provide a single operational focus. Data assembled in `lib/data.ts` around lines 111–142 includes richer state than the page presents. Values lack consistent time/scope labels and do not foreground total open exceptions, oldest age, assignment/backlog, today throughput, or latest import health.

Recommendation: B3 becomes an owner command center, preserving current business data and explicitly documenting any unavailable metric rather than deriving unapproved logic.

### P2 — owner navigation is overloaded

The owner rail exposes roughly 22 links with weak task grouping; capability-driven worker navigation can also become long. At collapsed width, icons/abbreviations plus tooltips do not fully restore information scent.

Recommendation: B2 group by Operate, Catalog, Data, People, and System (names to validate against routes), keep high-frequency items visible, and use explicit labels in the drawer. Do not hide business capabilities behind icons alone.

### P2 — responsive behavior is viewport-led rather than available-width-led

At 768 px the mobile header can be crowded; at 1024 px a visible sidebar leaves less room than page breakpoints assume; dashboard KPI and owner table layouts use raw viewport breakpoints. `app/owner/imports/page.tsx` contains an 18-column, `min-w-[1500px]` table. Data Management history uses `min-w-[760px]`.

Recommendation: adopt the responsive rules document, constraint-based grid tracks, column presets, and mobile card/list patterns.

### P2 — confirmed dashboard document overflow

Fresh evidence records `clientWidth/scrollWidth` of `360/433`, `390/433`, and `430/433`, for exact overflow of 73, 43, and 3 px; the defect is absent at 768/1024/1440. Recent imports anchors measured about 419 px. The root cause is intrinsic grid/flex sizing around `app/dashboard/page.tsx` lines 83, 110, and 120–134: the import filename/metadata/badge min-content chain establishes an oversized implicit grid track, and the sibling Recent work card expands to the same track.

Recommendation: fix the sizing chain in B3 and remeasure. Do not conceal the defect with document clipping.

### P2 — incomplete composite-widget semantics

- Some tab-like controls use roles without a complete keyboard/selection pattern.
- Account menu has menu roles, Escape/outside click, and focus return, but lacks arrow/Home/End navigation and managed initial focus.
- Drawer does not make background content inert.
- Dynamic result counts and some action feedback are visually present but not consistently announced.

Recommendation: B1a defines action/field/focus behavior, B1b defines feedback/surface semantics, and B2 fixes the shell menu/drawer; route chunks adopt them.

### P2 — duplicated primitives create drift

Cards, headers, banners, tabs, filters, pagination, tables, metrics, and work cards are repeatedly handwritten. Radius use alone spans seven families, dominated by 814 `rounded-md`, 117 pills, 110 `rounded-xl`, and 58 `rounded-lg`. Root design tokens exist but are sparsely consumed.

Recommendation: B1a creates tokens/actions/fields, B1b creates feedback/surface primitives, and deferred B1c creates collection primitives only when a first owner collection proves them. Later chunks migrate only in their bounded scope.

### P2 — user/account administration overloads each page

The user page is about 565 lines and instantiates repeated edit/capability/password forms per user around the mapped list/table. Its twelve disclosures are visually closed initially, but 41 forms and about 2,200 DOM nodes are already present. Accounts similarly starts with five closed disclosures while instantiating 10 forms; four true controls measure only 40 px high. This increases cognitive and DOM load and weakens a single focus.

Recommendation: D5a handles Accounts and its target boxes; D5b handles Users. Each uses a summary list/table plus one selected create/edit surface while preserving every permission and server action.

### P2 — worker presentation models diverge

`GroupedWorkCard`, `WorkTaskCard`, source cards, scanner candidate cards, packing cards, and detail routes express similar identity/state/action information with different ordering, radii, density, and disclosure.

Recommendation: C1 establishes a shared work-card anatomy; C2–C6 migrate stage-specific surfaces one at a time, preserving route/action logic.

### P3 — dashboard fifth KPI creates an orphan hierarchy

A two-column mobile KPI grid leaves a fifth equal-weight card visually orphaned; loading skeleton structure also differs from the populated page.

Recommendation: B3 establishes deliberate metric priority/order and state-parity skeletons.

### P3 — overly heavy typography and badge repetition

Frequent `font-black`, uppercase micro-labels, and multiple adjacent pills flatten hierarchy and reduce reading speed. Some functional text approaches the lower legibility bound.

Recommendation: B1a defines weight/size roles; route chunks reduce emphasis without reducing information.

## Heuristic scorecard

| Nielsen heuristic | Score / 4 | Key evidence |
| --- | ---: | --- |
| Visibility of system status | 2 | Status badges/feedback exist; live refresh/count semantics and dashboard risk visibility are incomplete |
| Match with real world | 3 | Strong warehouse language; stale marketplace import IA weakens it |
| User control and freedom | 3 | Explicit actions, retry/quarantine/restore; some overlays and flows lack complete escape/focus affordances |
| Consistency and standards | 2 | Shared shell exists; cards, radii, banners, tabs, and naming drift |
| Error prevention | 2 | Typed destructive confirmation/idempotency strong; dense inline forms and ambiguous dashboard actions remain |
| Recognition over recall | 2 | Context and statuses visible; long nav and collapsed labels impose recall |
| Flexibility and efficiency | 2 | Scanner and account-scoped queues strong; owner IA and repeated forms slow expert use |
| Aesthetic/minimal design | 3 | Restrained palette; too many equal-weight surfaces and badges |
| Error recovery | 2 | Problems/retry flows exist; feedback/recovery language and focus are inconsistent |
| Help/documentation | 1 | Sparse in-product guidance and unclear cross-flow orientation |

Total: 22/40.

## Route-level direction

### Dashboard

Lead with an exception/action strip: total open exceptions and oldest age; assigned vs unassigned backlog; today throughput; latest import health. Then show actionable recent work/imports with marketplace/account/source and age. Place creation/import shortcuts after current operational state. Every metric names timeframe and scope.

### Worker surfaces

Keep Scan/Resume dominant. Standardize source/stage/status, product identity, quantity/assignment, required evidence, primary action, and problem/history order. Avoid hiding production evidence for minimalism. Stage-specific pages remain distinct because Pick, Mark, Assembly, Pack, Scanner, and Problems have different safety needs.

### Owner/admin surfaces

Cards remain useful on mobile and for action-heavy rows. Desktop tables are appropriate only for comparison, with column presets, sticky identity/actions where feasible, internal scrolling, and a mobile alternative. Accounts/users use one focused editor. Imports/consignments preserve marketplace and retained-source boundaries.

## Accessibility requirements

- Exactly one `aria-current` route.
- Full keyboard patterns for dialogs, drawers, menus, tabs, and disclosures used as composite widgets.
- `role=status` for non-urgent async success/update; `role=alert` for blocking errors.
- Focus moves predictably after validation, destructive confirmation, route changes, and overlay close.
- Background is inert for modal overlays.
- Semantic headings, labels, table headers/captions, and landmark names remain coherent.
- Status includes text/icon; focus and contrast are tested on every colored surface.
- Reduced-motion behavior is explicit.

## Explicit non-recommendations

Do not add more whitespace as a blanket solution; turn navigation into icons only; animate routine worker actions; add charts without a decision they support; color every KPI; add gradients/glass/illustration; hide production actions/details; or merge marketplace-specific import flows. These would make the UI more generic or less safe.

## Readiness conclusion

The focused browser closure is complete, and the repository is ready for bounded Phase 7.4B–E work after owner acceptance. Execute B1a, B1b, B2, and B3 as separate proofs; defer B1c until the first authorized owner collection. Populated Mark, Assembly, Pack, and Problems states still require focused C3–C6 fixture/browser gates. No runtime change should begin from this audit branch without the owner review gate.
