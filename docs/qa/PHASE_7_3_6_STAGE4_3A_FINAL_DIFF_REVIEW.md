# Phase 7.3.6 Stage 4.3A Final Diff Review

Base SHA: `a9906e0a659058ae5a0d9b9d8dfedf5165416627`

## Classification

- Authentication layout, banner, password control and messages:
  `VISUAL_ONLY`, `RESPONSIVE`, `ACCESSIBILITY`, `FORM_WIRING`.
- Mobile account menu and shell:
  `NAVIGATION_PRESENTATION`, `ACCESSIBILITY`, `SERVER_ACTION_WIRING`.
- Pick cards:
  `VISUAL_ONLY`, `RESPONSIVE`.
- Role-denial redirect:
  `PERMISSION_LOGIC`. It continues to reject unauthorized roles server-side
  before protected page data is queried, but now renders a genuine authenticated
  Access Denied state rather than silently redirecting to a capability home.
- Tests, browser runner and reports: regression evidence only.

No unknown line or workflow/backend mutation remains.

## Preserved contracts

- Existing `loginAction`, username/password names and autocomplete.
- Server `logoutAction`, audit log, session and selected-account clearing.
- Permission-derived desktop and mobile navigation.
- `completeGroupedStageAction` and route decision fields.
- Group key/version, idempotency request ID, route reasons, missing-instruction
  confirmation and worker note.
- Details and Problem destinations.
- Live group refresh and stale-version rejection.

## Browser evidence

Installed Google Chrome ran one headed checkpoint and a complete headless
matrix using only private synthetic staging.

- Roles: OWNER, PICKER, MARKER, ASSEMBLER, PACKER, VIEW_ONLY,
  MIXED_PERMISSIONS.
- Resolutions: 360×800, 390×844, 430×932, 768×1024, 1024×768, 1440×900.
- Final result: 111/111 passed.
- Genuine forbidden state showed no owner Users content.
- One Pick mutation succeeded; later stale replay was rejected with the
  controlled refresh message.

Private PNGs and the JSON browser report remain under `.codex-tmp/stage4-3a/`.
