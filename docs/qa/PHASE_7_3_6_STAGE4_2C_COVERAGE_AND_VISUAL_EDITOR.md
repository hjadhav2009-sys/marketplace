# Phase 7.3.6 — Stage 4.2C Coverage and Local Visual Editor

## Boundary

This stage used only the private synthetic staging database, synthetic storage,
and ignored evidence roots. It did not access production data, change
`mobile-app`, push, merge, or deploy.

Branch:

```text
phase-7.3.6-stage4.2c-coverage-and-visual-editor
```

## Coverage result

```text
Viewport captures:       840 / 840 verified
Full-page masters:       840 / 840 verified
Broken mandatory states: 0
Control inventory:       24,020 controls
Browser failure traces:  0
```

Each viewport has 140 verified full-page masters:

```text
360x800
390x844
430x932
768x1024
1024x768
1440x900
```

The evidence referenced by the committed manifest totals 470,440,526 bytes.
Existing high-density masters were preserved. Missing and explicitly
recaptured states used lossless PNG at a practical 2x device scale following
the owner's storage decision.

The largest referenced master is 4096 × 73,236 pixels. The longest referenced
master is 1440 × 117,992 pixels.

## Closed findings

- Added a real synthetic held-Order missing-listing issue for the owner detail
  route.
- Added a valid synthetic adaptive-mapping payload for the import mapping
  route.
- Added a linked synthetic Marking asset for its real Details route.
- Replaced render-time elapsed calculations with a hydration-stable timestamp,
  then advanced the clock after hydration.
- Added bounded responsive widths and wrapping to Consignment review forms,
  identifiers, controls, and route content.
- Reverified the import processing state at all six widths with zero hydration
  or React errors.
- Reverified both Consignment review scenarios at 360, 390, and 430 pixels with
  zero horizontal overflow.

## Local visual editor

Audit Studio now supports:

- viewport, full-page, comparison, redesign, and notes modes;
- selectable, movable, resizable, duplicable, deletable, hideable, lockable,
  groupable, and alignable overlay layers;
- text, rectangle, ellipse, line, arrow, freehand, highlight, and blur tools;
- undo/redo, zoom, pan through the bounded canvas, PNG export, and JSON
  import/export;
- links from selected captures to matching Design Lab areas;
- private `ApprovedDesignSpecificationV1` exports.

The Work Cards Design Lab provides live synthetic-only controls for layout
direction, columns, section order, dimensions, gap, padding, margin, image
size/aspect, typography, button layout, radius, shadow, visibility, and
desktop/mobile variants.

The Pick-card proof saved a redesign, moved and resized a layer, added an owner
note, exported PNG and JSON, changed the Live Component preview, and saved two
approved specifications. The proof reported zero console and React errors.

All generated redesigns, approval specifications, screenshots, and proof files
remain private and ignored under:

```text
.codex-tmp/stage4-2c/
```

## Validation

Passed:

```text
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run staging:test
npm.cmd run permission:test
npm.cmd run security:test
npm.cmd run stage4-ui:test
npm.cmd run stage4-2b:audit-studio
npm.cmd run stage4-2c:test
npm.cmd run stage4-2c:editor-proof
git diff --check
npm.cmd run build
```

Production build generated 84 static pages and included the guarded private QA
routes. QA routes and approval APIs return 404 unless both synthetic-staging
environment gates are enabled.

## Decision

```text
STAGE4_2C_COVERAGE_COMPLETE_AND_VISUAL_EDITOR_READY
```
