---
name: Marketplace Pick & Pack Operations UI
description: A restrained, high-clarity warehouse operations system built from stone surfaces, slate text, berry actions, and semantic status colors.
colors:
  primary: "#be185d"
  background: "#fafaf9"
  foreground: "#0f172a"
  muted: "#64748b"
  border: "#e2e8f0"
  success: "#0f766e"
  warning: "#92400e"
  danger: "#be123c"
typography:
  families:
    sans: "Inter, ui-sans-serif, system-ui, sans-serif"
  sizes: ["0.75rem", "0.875rem", "1rem", "1.125rem", "1.25rem", "1.5rem", "1.875rem", "2.25rem"]
rounded: ["0.375rem", "0.5rem", "0.75rem", "1rem", "9999px"]
spacing: ["0.25rem", "0.5rem", "0.75rem", "1rem", "1.25rem", "1.5rem", "2rem"]
---

# Overview

The current visual world is an **Operations Ledger**: quiet stone canvas, white bounded work surfaces, dark slate identity, berry primary actions, and semantic teal/amber/rose state treatments. Its purpose is to keep warehouse facts, responsibility, and the next safe action legible. The strongest existing surfaces already behave this way; Phase 7.4 should consolidate them rather than introduce a new brand identity.

The system is intentionally restrained. Density is acceptable when the information is task-critical, but hierarchy must separate context, status, evidence, and action. Marketplace, seller account, work source, stage, quantity, assignment, and exception state should remain visible at the decision point.

# Principles

1. **Operational truth before decoration.** Show saved state and missing data honestly. Never manufacture instructions or imply a scan changed work.
2. **One dominant task per worker view.** Scan/resume, the current work card, and the next permitted action outrank secondary navigation and history.
3. **Context travels with action.** Marketplace, seller account, source, stage, assignment, quantity, and exception state sit beside the action they govern.
4. **Safe density.** Owner screens may use cards or responsive tables; worker screens use bounded cards and progressive disclosure without hiding required production facts.
5. **Color carries meaning, not structure alone.** Text/icons name every state; semantic color reinforces it.
6. **Quiet repetition.** Frequent actions are immediate and stable. Motion is reserved for occasional spatial transitions and feedback.

# Colors

- Canvas: stone/near-white `#fafaf9`.
- Primary text: slate `#0f172a`; secondary text uses slate-600/500 only where contrast remains sufficient.
- Primary action/accent: implemented berry `#be185d`; use selectively for the main action, current nav identity, and links. The darker `#9f1239` remains an unapproved proposal requiring owner review before implementation.
- Success: teal surfaces and text. Warning: amber. Blocking/error: rose. Neutral/inactive: slate.
- Do not color every metric. A neutral value stays neutral until status or urgency gives color semantic work.
- Pale colored backgrounds require dark semantic text and an explicit label or icon.

# Typography

Use Inter when available, then the system sans-serif stack. Worker quantities and primary identifiers may use heavier weight; long descriptions and metadata should not. Keep functional text at 12 px or larger, body/action text normally 14–16 px, and page titles within a compact 24–36 px range. Avoid promotional display typography, all-caps paragraphs, and extreme weight on every line.

# Layout

- Application frame: maximum width 1600 px; expanded desktop rail 264 px; collapsed rail 72 px.
- Content columns must use `minmax(0, 1fr)`/`min-w-0` where long identifiers or badges can establish intrinsic width.
- Mobile begins as one column. Do not let two-column KPI grids create an orphan hierarchy; use intentional priority/order.
- Owner tables may scroll within their own labeled region when true comparison requires columns. They must not cause document-level overflow and need a card/list alternative when row actions or identities cannot remain readable.
- Breakpoints respond to available content width after shell/navigation, not merely the physical viewport.

# Components

- Page header: eyebrow for durable context, concise title, one-sentence purpose, and at most the primary adjacent actions.
- Work card: follow the Operations Ledger sequence `context -> identity -> quantity -> state -> actions -> disclosure`. Keep source/stage/quantity/assignment at every responsive size. Compact/mobile cards use 96 px media and place state before actions; from the small breakpoint media is 112 px, and at extra-large widths actions move into a dedicated right column while disclosure remains below the card body.
- Status badge: semantic label plus color/icon; compact but never the sole carrier of meaning.
- Form controls: minimum 44 px height; scanner controls may be 56 px. Labels remain visible for consequential fields.
- Feedback: success uses `role=status` when it follows an async action; errors use `role=alert`; provide recovery guidance.
- Dialog/drawer/menu: complete keyboard pattern, focus entry/containment/return, Escape behavior, and background isolation.
- Empty state: explain why the list is empty and offer the most likely safe next action; never imply missing permission or data is success.

# Motion

No decorative motion on scan, claim, quantity, route, complete, pack, or problem actions. Occasional drawers/dialogs may use 120–180 ms opacity/transform transitions with interruption-safe easing. Respect `prefers-reduced-motion`; never animate live counts, charts, gradients, or routine card updates merely for delight.

# Do and Don't

Do preserve the app's calm stone/slate/berry character, make responsibility visible, use specific recovery copy, and test at 360/390/430/768/1024/1440 with real long identifiers and every important state.

Do not add gradients, glass effects, decorative illustrations, animated charts, icon-only operational navigation, arbitrary large whitespace, or generic dashboard decoration. Do not merge business-distinct Amazon and Flipkart import flows. Do not hide worker actions or production instructions behind visual novelty.
