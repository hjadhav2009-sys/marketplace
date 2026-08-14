# Phase 7.4 design-skill policy

## Decision

Phase 7.4 uses Impeccable as the primary UX/design-review authority, Emil Kowalski's skills as the interaction and motion authority, and the installed Taste skills only as an anti-generic critique lens. Product truth, repository evidence, accessibility, and the explicit Phase 7.4 business freeze outrank every skill recommendation.

This phase authorizes audit, critique, documentation, and planning only. It does not authorize source mutation, browser injection, prototype code, generated imagery, dependency changes, business-logic changes, database changes, or mobile-app changes.

## Installed project-local tools

| Tool | Project-local location | Intended use | Phase 7.4A status |
| --- | --- | --- | --- |
| Impeccable 4.1.1 | `.agents/skills/impeccable/` | Product/design context, heuristic audit, detector, responsive critique, future design guardrails | Installed; detector and read-only references used |
| Impeccable Codex hooks | `.codex/hooks.json` | Non-blocking detector after edits and at stop | Installed and reviewed |
| Emil skills | `.agents/skills/{animate,animation-vocabulary,apple-design,ask-sonner,emil-design-eng,find-animation-opportunities,improve-animations,pick-ui-library,prototype,review-animations}/` | Interaction craft, motion restraint, UI-library evaluation, future prototype workflow | Installed; guidance read; no prototype or source edit run |
| Taste redesign | `.agents/skills/redesign-existing-projects/` | Critique category-default/generic UI and preserve useful product-specific structure | Installed; read-only guidance used |
| GPT Taste | `.agents/skills/gpt-taste/` | Additional anti-generic visual critique | Installed; read-only guidance used selectively |
| Installer lock | `skills-lock.json` | Exact source and content hashes for Emil/Taste installs | Tracked |

The exact installed file set is the committed content under those paths. `skills-lock.json` is the machine-readable manifest for the twelve registry-installed skill packages; the Impeccable directory is the complete 4.1.1 distribution created by its installer. No runtime package dependency or application source file was added by these tools.

## Hook safety review

`.codex/hooks.json` registers the local Impeccable `hook.mjs` for `PostToolUse` and `Stop`. The reviewed hook:

- is local and non-blocking; it exits successfully after reporting findings;
- scans only supported visual-source extensions;
- rejects sensitive/generated/out-of-project paths;
- does not edit application source;
- may write only Impeccable cache/log state when configured or when findings exist;
- performs no network call on the normal detector path.

The installed Impeccable bundle also contains optional commands capable of live browser injection, local serving, source writing, design-question serving, or image generation. Installation does not grant those commands standing approval. During 7.4A they were not run. Any future use requires a task-specific review and must remain within the user-approved scope.

Ignored local-only Impeccable outputs are `.impeccable/cache/`, `live/`, `critique/`, `mocks/`, and top-level log files. Shared `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` remain tracked.

## Authority and conflict rules

1. Repository/product truth and explicit user instructions.
2. Accessibility, security, account isolation, permissions, auditability, and data integrity.
3. Impeccable for hierarchy, responsive behavior, specificity, usability, and design-system coherence.
4. Emil for interaction timing, reduced motion, interruption safety, and component-library selection.
5. Taste as a critic of generic output, never as authority to turn an internal operations tool into a marketing page.

Recommendations rejected for this product include AIDA/landing-page composition, large promotional spacing, decorative GSAP sequences, gradients/glass, randomized visual choices, animated charts, icon-only navigation, and novelty that hides production evidence. The useful Taste principle is narrower: retain warehouse-specific structures and remove generic dashboard filler.

## Motion policy

- No decorative animation on scan, claim, route, quantity, complete, pack, or problem-reporting paths.
- Occasional drawer/dialog transitions may use 120–180 ms opacity/transform motion with interruption-safe easing.
- Live count changes and card refreshes do not animate for spectacle.
- `prefers-reduced-motion` removes non-essential motion.
- Animation work is deferred until the relevant functional chunk exists and passes keyboard/responsive checks.

## UI-library policy

No UI dependency is added in 7.4A. If a later chunk needs a robust dialog, menu, popover, or focus-management primitive, Base UI is the leading candidate from the installed selection guidance, but adoption requires a bounded proof covering bundle size, maintenance, accessibility behavior, styling fit, and removal cost. Existing HTML/React patterns stay in place until that decision is explicitly approved.

## Required workflow for later chunks

1. Read `PRODUCT.md`, `DESIGN.md`, this policy, the master audit, and the chunk definition.
2. Confirm protected business behavior and exact runtime-file budget.
3. Capture before-state evidence at 360/390/430/768/1024/1440 where applicable.
4. Implement one bounded chunk; do not bundle neighboring routes opportunistically.
5. Run detector, typecheck, lint, relevant tests, keyboard/focus review, overflow measurements, and browser screenshots.
6. Stop for the required owner-review gate after each chunk group.

Prototype and image-generation workflows remain deferred unless a later user request explicitly authorizes them.
