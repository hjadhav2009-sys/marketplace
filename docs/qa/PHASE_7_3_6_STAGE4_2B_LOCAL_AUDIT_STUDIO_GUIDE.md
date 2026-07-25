# Phase 7.3.6 Stage 4.2B Local Audit Studio Guide

1. Prepare/build/start private synthetic staging with the reviewed `staging:*` commands.
2. Run `npm.cmd run stage4-2b:browser -- --resume`.
3. Open http://127.0.0.1:3188/__qa/ui-audit
4. Filter by route, role, viewport or status.
5. Use Current, Redesign and Notes; add overlays and review tags.
6. Save privately or export sanitized JSON.
7. Stop with `npm.cmd run staging:stop`.

Synthetic credentials remain in the ignored Stage 3 credential file. Passwords
must not be copied into documentation. Without `STAGING_UI_AUDIT=true`, the
Studio and its private APIs return 404.
