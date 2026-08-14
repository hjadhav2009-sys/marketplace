# Phase 7.4A1 focused browser evidence

## Run identity

- Audit date: 14 August 2026.
- Source: `e81c2f25f29fba99cbf4a254adf26b39856c4a65` on `phase-7.4a-ui-foundation-audit`.
- Runtime: repository-owned `PRIVATE_SYNTHETIC_STAGING`, synthetic database only, build `rbBGqg9Kj_8zrzBDcpd41`.
- URL: `http://127.0.0.1:3188` only.
- Browser: installed Google Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`, controlled with the repository's existing `playwright-core` infrastructure.
- Evidence: 98 primary records plus four supplemental read-only-worker records; seven sanitized screenshots. Raw JSON/screenshots remain ignored under `.codex-tmp/phase-7.4a-browser-audit/` and are not committed.
- Every page title was `Marketplace Pick & Pack`; every authenticated primary record used `STAGE-FK-01 / Synthetic Flipkart Primary` unless explicitly marked as the isolated Amazon account check.
- Aggregate browser health: 0 console errors, 0 page errors, 0 unexpected failed requests, and 0 HTTP error responses. Aborted speculative requests were excluded by the established harness rule.

## Width and state record matrix

Each grouped row represents one record per listed viewport. Direct route navigation left default document focus on `body`; interactive focus behavior was exercised separately in the shell table. `client/scroll` values are CSS pixels in viewport order. Candidate under-44 counts are mechanical flags, not automatically findings: text links, native checkboxes/radios, and controls inside disclosures require true-box/context review.

| State / route | Role | Viewports | Heading | client/scroll / overflow | Browser result |
| --- | --- | --- | --- | --- | --- |
| Dashboard `/dashboard` | Owner | 360, 390, 430, 768, 1024, 1440 | Warehouse overview | `360/433/73`, `390/433/43`, `430/433/3`, `768/768/0`, `1024/1024/0`, `1440/1440/0` | CONFIRMED mobile overflow; all controls at least 44 px |
| Accounts `/owner/accounts` | Owner | all six | Marketplace accounts | all client=scroll; 0 overflow | CONFIRMED collapsed editors and 40 px controls |
| Users `/owner/users` | Owner | 390, 768, 1440 | Worker users and sessions | all client=scroll; 0 overflow | CONFIRMED collapsed editors plus high instantiated DOM/form cost |
| Inventory `/owner/product-inventory` | Owner | 390, 768, 1440 | Product Inventory | all client=scroll; 0 overflow | Cards reflow; long identities remain contained; page is very tall at 390 (7,898 px) |
| Product detail `/owner/product-inventory/stage3-listing-fk-direct` | Owner | 390, 768, 1440 | Synthetic Direct Pack Product | all client=scroll; 0 overflow | Details remain contained; dense/long at 390 (3,622 px) |
| Imports `/owner/imports` | Owner | 390, 768, 1440 | Imports | all client=scroll; 0 overflow | Mobile cards and bounded desktop data region confirmed; compact desktop utility links need later target review |
| Import mapping `/owner/imports/stage4-import-mapping/mapping` | Owner | 390, 768, 1440 | Map File Headers | all client=scroll; 0 overflow | Form reflows without clipping |
| Consignments `/owner/consignments` | Owner | 390, 768, 1440 | Consignments | all client=scroll; 0 overflow | Collection contained; tall mobile scan path (4,598 px) |
| Consignment review `/owner/consignments/stage3-batch-review_required/review` | Owner | 390, 768, 1440 | Synthetic REVIEW_REQUIRED Consignment | all client=scroll; 0 overflow | Blocking evidence is prominent; per-line mutation/editor remains dense and long |
| Data Management history | Owner | 390, 768, 1440 | Data Management | all client=scroll; 0 overflow | Horizontal tab/table regions stay internal; mobile gives a swipe cue; destructive wording remains distinct |
| Reports `/reports` | Owner | 390, 768, 1440 | Operations reports | all client=scroll; 0 overflow | Contained; several CSV/secondary links mechanically measure 34–38 px high |
| System `/owner/system` | Owner | 390, 768, 1440 | System health | all client=scroll; 0 overflow | Contained; `Open cleanup` measures 38 px high |
| Shell nested Work/Mark/Assemble | Owner | 390, 1440 | Work Hub / Marking / Assembly | all client=scroll; 0 overflow | Desktop prefix-current defect reproduced on Mark and Assemble |
| Shell nested Product/Import/Consignment | Owner | 390, 1440 | record/mapping/review headings | all client=scroll; 0 overflow | Exactly one current item on these owner nested routes |
| Work Hub `/work` | Picker | 360, 390, 768, 1440 | Work Hub | all client=scroll; 0 overflow | Compact, clear entry surface |
| Pick `/work/pick?source=ORDER` | Picker | 360, 390, 768, 1440 | Pick | all client=scroll; 0 overflow | Product, route, assignment, quantity and action hierarchy visible; multiple current links at desktop |
| Mark `/work/mark` | Marker | 360, 390, 768, 1440 | Marking | all client=scroll; 0 overflow | Empty fixture state only; populated state NOT_REPRODUCED in this closure |
| Assembly `/work/assemble` | Assembler | 360, 390, 768, 1440 | Assembly | all client=scroll; 0 overflow | Empty fixture state only; populated state NOT_REPRODUCED |
| Pack `/work/pack` | Packer | 360, 390, 768, 1440 | Packing | all client=scroll; 0 overflow | Empty fixture state only; populated state NOT_REPRODUCED |
| Scanner empty/no match | Picker | 360, 390, 768, 1440 | Universal Work Scan | all client=scroll; 0 overflow | Input remains first/dominant; no-match is explicit and non-mutating |
| Scanner one match | Picker | 360, 390, 768, 1440 | Universal Work Scan | all client=scroll; 0 overflow | Account/source/state/quantity/action distinguishable |
| Scanner multiple match | Picker | 360, 390, 768, 1440 | Universal Work Scan | all client=scroll; 0 overflow | Five active plus one completed/read-only candidate remain distinct; 390 page is 5,104 px tall |
| Scanner completed | Packer | 360, 390, 768, 1440 | Universal Work Scan | all client=scroll; 0 overflow | Completed result is visibly read-only and mutation controls are absent |
| Work Problems `/work/problems` | Picker and View-All | 360, 390, 768, 1440 | Work Problems | all client=scroll; 0 overflow | Empty state only; no mutation forms for View-All; populated problem state NOT_REPRODUCED |

## Shell and keyboard evidence

| Check | Actual result | Status |
| --- | --- | --- |
| Desktop expanded/collapsed | At 1440, main rail changed from x=264/width=1176 to x=72/width=1368; sidebar reported 72 px and `data-collapsed=true` | CONFIRMED |
| One current navigation link | Owner `/work/mark` marked Work Hub + Mark; `/work/assemble` marked Work Hub + Assemble. Worker Pick, Scan and Problems similarly marked parent Work plus child. Nine desktop records had two current links | CONFIRMED P1 |
| Owner Product/Import/Consignment nested current | One current item in tested desktop routes | CONFIRMED correct for those families |
| Drawer mutual exclusion | Only one overlay existed | CONFIRMED |
| Drawer initial focus | Close navigation received focus | CONFIRMED |
| Drawer Tab loop | Shift+Tab from Close wrapped to Password; Tab wrapped back to Close | CONFIRMED |
| Drawer Escape/return | Drawer removed, body scroll restored, focus returned to Open navigation | CONFIRMED |
| Drawer background isolation | Body scrolling was locked, but 0 inert nodes and no `aria-hidden` on main | CONFIRMED missing isolation P2 |
| Account menu initial focus | Focus remained on Open account menu trigger | CONFIRMED incomplete menu pattern |
| Account menu ArrowDown/Up/Home/End | All four keys left focus unchanged on trigger | CONFIRMED missing keyboard behavior P2 |
| Account menu Tab/Shift+Tab | Tab entered Switch account; Shift+Tab returned to trigger | PARTIALLY_CONFIRMED |
| Account menu Escape/return | Menu removed and focus returned to trigger | CONFIRMED |
| Browser Back | Returned to `/dashboard`; neither drawer nor account menu remained open | CONFIRMED |

## Dashboard evidence

At 360×800, `documentElement.clientWidth=360`, `documentElement.scrollWidth=433`, `body.scrollWidth=433`, and document overflow is exactly 73 px. At 390 it is 43 px; at 430 it is 3 px. The defect disappears at 768 and above.

Both Recent work and Recent imports cards render at x=12, width=420.6, right=432.6 because they share the expanded implicit grid track. Their inner rows render at about 418.6 px. Recent import anchors are 418.6×76/77 px; their flex rows are 386.6×44 px. Status badges retain intrinsic widths (Failed about 66.3 px; Needs Mapping about 118 px). The Recent imports filename/metadata/badge min-content chain establishes the oversized track; the sibling Recent work card expands to that track. This confirms the source hypothesis and adds the sibling effect. Global clipping is not an acceptable repair.

The fifth KPI is visibly orphaned in the two-column mobile grid (CONFIRMED P3). Every measured visible dashboard control met 44 px.

The isolated Amazon check selected `Synthetic Amazon Primary / STAGE-AMZ-01`, then loaded Dashboard. It still exposed Import files, Import orders, and Import listing master, with all three pointing to `/owner/uploads/new`. The page's source-visible Flipkart import framing and Flipkart-only latest-listing query therefore remain a CONFIRMED P1 marketplace/IA defect; no routes were changed.

## Administration evidence and target sizes

Accounts contains five `<details>` elements (create plus four account editors), all initially closed, 10 forms, and 551–553 DOM nodes. At 390 its initial height is 3,372 px; opening one account editor raises it to 3,895 px and two to 4,418 px.

Users contains twelve `<details>` elements, all initially closed, 41 forms, and about 2,200 DOM nodes. At 390 its initial height is 4,772 px; opening one editor raises it to 7,337 px and two to 9,902 px. Therefore the earlier “expanded by default” wording is DISPROVED, while repeated form instantiation/administrative complexity is CONFIRMED.

| True account control | 360 | 390 | 430 | 768 | 1024 | 1440 | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Switch link | 69.4×40 | same | same | same | same | same | Below 44 px height |
| Deactivate button | 95.5×40 | same | same | same | same | same | Below 44 px height |
| Reactivate button | 93.9×40 | same | same | same | same | same | Below 44 px height |
| Deactivation confirmation input | 128×40 | same | same | same | same | same | Below 44 px height |
| Edit account details summary | width 300–1092 ×44 | 44 high | 44 high | 44 high | 44 high | 44 high | Meets policy |
| Save account | 137.4×50 | 137.4×50 | 137.4×50 | 117.5×44 | 117.5×44 | 117.5×44 | Meets policy |

This is new browser-supported finding F13/P2. Native checkbox/radio glyphs are not classified independently when their enclosing label provides the target.

## Workflow-family findings

- Worker card: CONFIRMED that Pick exposes source/marketplace/stage/status, bounded image fallback, identity, route, assignment, quantity/progress and explicit Complete/Partial/Problem/Details actions without overflow. Presentation duplication remains because other stage/legacy cards use different anatomy.
- Scanner: CONFIRMED lookup-first hierarchy, selected-account label, distinguishable candidates, explicit prerequisites, explicit action controls, and completed/read-only treatment. Multiple-match pages become extremely long on mobile, so candidate prioritization/progressive disclosure remains C6 work.
- Inventory: CONFIRMED responsive containment and clear Details actions. Mobile height and repeated identity links remain density concerns; missing-image behavior stayed bounded in the inspected detail/list fixtures.
- Imports: CONFIRMED mobile cards and internally bounded desktop data regions. The 1500 px comparison table does not create document overflow; compact desktop action/export links remain a target-size review item for D3.
- Consignments: CONFIRMED strong blocking/error hierarchy. The review page clearly separates “Activation unavailable” from route/listing actions, but a single-line fixture still produces a 3,028 px mobile page, supporting the focused-review recommendation.
- Data Management: CONFIRMED horizontal containment, swipe cue, distinct destructive language and disabled/retention presentation. No destructive action was executed.
- Reports/System: contained at all tested widths. Several secondary report/system links measured 34–38 px high; this is evidence for later route-specific target review, not added as a separate audit finding in this checkpoint.

## Accessibility result

Visible global focus styling and 44 px primary worker/scanner targets were confirmed. Drawer focus containment, Escape, return and body-scroll control work. Missing background inertness, incomplete menu keyboard behavior and multiple `aria-current` links are confirmed. No inspected page produced an unlabeled primary input/button in the focused paths, but this run was not an automated WCAG conformance scan. Populated Mark/Assembly/Pack/Problems and full role-tab keyboard states were not reproduced and remain implementation-gate checks.

## Evidence disposition

- CONFIRMED: dashboard overflow/root cause, dashboard marketplace IA, multiple-current navigation, drawer strengths/background-isolation gap, account-menu keyboard gap, collapsed admin disclosures plus instantiated complexity, account 40 px controls, responsive containment on all other tested routes, scanner hierarchy/read-only result.
- PARTIALLY_CONFIRMED: worker-card consistency (Pick and Scanner populated; other stage pages empty), account-menu Tab behavior, owner data-table strategy.
- DISPROVED: claim that account/user editors are visually expanded initially.
- NOT_REPRODUCED: populated Mark, Assembly, Pack, and Work Problems states; these remain focused C3–C6 browser gates rather than source facts.
