# Phase 5 Assembly QA

## Automated

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:validators
npm.cmd run workflow:test
npm.cmd run universal-scan:test
npm.cmd run assembly:test
git diff --check
```

## Manual Browser Checklist

1. Configure one exact listing as `PICK_ASSEMBLE_PACK` with short instructions.
2. Pick a fake order and confirm one Assembly task appears.
3. Open `/work/assembly` at 360, 390, 430, 768, 1024, and 1440 px.
4. Start and complete the task; confirm the order becomes packable but is not auto-packed.
5. Send a no-rule picked order manually with instructions.
6. Report a problem and confirm Pack stays blocked; resolve or skip as owner.
7. Test two fake Flipkart rows sharing one Tracking ID and confirm one pending assembly row blocks both.
8. Scan AWB/Tracking ID with `ASSEMBLE` intent; verify scanning alone changes nothing.
9. Verify a view-all user sees read-only work and a worker without `canAssemble` cannot complete.

Never use or commit real order/customer data for QA.
