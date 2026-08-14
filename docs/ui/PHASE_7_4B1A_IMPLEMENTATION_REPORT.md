# Phase 7.4B1a Implementation Report

Result: `PHASE_7_4B1A_CORE_CONTROLS_COMPLETE`

## Boundary and scope

1. **Starting SHA:** `66db8f77ab4270211495ad443b2ca8f31ee6af6c` from the completed `phase-7.4a-ui-foundation-audit` branch.
2. **Branch:** `phase-7.4b1a-ui-foundation-controls`.
3. **Changed runtime files:** `app/globals.css`, `components/SubmitButton.tsx`, `components/ui/buttonStyles.ts`, `components/ui/Button.tsx`, `components/ui/Field.tsx`, `app/login/page.tsx`, and `app/login/PasswordField.tsx`.
4. **New primitive files:** `components/ui/buttonStyles.ts`, `components/ui/Button.tsx`, and `components/ui/Field.tsx`.
5. **Token changes:** Added only the semantic canvas, surface, text, muted, border, action, state, focus, control-height, control-radius, and short control-transition tokens consumed by B1a. Existing layout tokens remain. `--control-height` now aliases the retained 44px operational minimum.
6. **Exact palette values:** canvas `#fafaf9`; surface `#ffffff`; text `#0f172a`; muted `#475569`; action `#be185d`; action hover `#9d174d`; success/focus `#0f766e`; warning `#92400e`; danger `#be123c`; danger hover `#881337`; invalid/action-soft surface `#fff1f2`.
7. **Primary confirmation:** `#be185d` remains the active primary berry. The unapproved `#9f1239` is not active in B1a token or control sources.
8. **Focus implementation:** Native `:focus-visible` uses a 3px `#0f766e` outline, 2px offset, and a 2px white separation boundary. Mouse activation does not retain the keyboard-only outline. Forced-colors uses `CanvasText`; no JavaScript focus replacement or `outline: none` was added.

## Control foundation

9. **Button variants:** `primary`, `secondary`, `quiet`, and `danger`, with `standard` and `large` sizes. Enabled operational actions have a 44px minimum in both axes. Hover styles are limited to hover-capable fine pointers; no gradient, transform, scale animation, or animation library was introduced.
10. **SubmitButton compatibility:** `useFormStatus()`, native `type="submit"`, real pending label replacement, pending disablement, `pendingText`, primary/secondary callers, and `className` extension are retained. The shared contract also permits quiet/danger and explicit disabled state without changing existing callers.
11. **Field structure:** `Field` provides a visible/programmatic label, optional help and error content, stable help/error IDs, combined `aria-describedby`, `aria-invalid`, required indication, and render-prop control attributes. `fieldControlStyles` covers standard/large, invalid, disabled, and read-only presentation without creating a form-state framework.
12. **Login migration:** Username and Password now prove the Field contract; Submit, Forgot Password, and Show/Hide prove the shared action contract. Invalid credentials connect both controls to `login-error`; the existing status/error banners remain local because banner normalization belongs to B1b.
13. **Server actions:** `app/login/actions.ts` is byte-for-byte unchanged; its verification SHA-256 remains `a6c99c4e710f09460b7dfe46fbf928cec244c179d732a87b2c7967e404113fd2`.
14. **Route destinations:** Login submission and all server destinations are unchanged. Forgot Password remains `/forgot-password`.
15. **Client JavaScript:** No new client boundary was added. `SubmitButton` remains client-side only for `useFormStatus`; `PasswordField` remains client-side for visibility state. Button, Field, and the class helper are server-compatible.
16. **Dependencies:** None added. `package-lock.json` is unchanged; no class, form, validation, or animation package was introduced.

## Tests and browser evidence

17. **Tests:** Added `phase7.4b1a:test` using the repository's existing `tsx`/Node assertion style. It covers tokens, static production-discoverable action variants, Button states, SubmitButton compatibility/pending semantics, Field relationships/states, Login names/autocomplete/action/destination/visibility behavior, and the unchanged Login action hash. `typecheck`, `lint`, `stage4-ui:test`, `stage4-6a:test`, the focused B1a test, the relevant Stage 4.3a UI safety test, production build, and `git diff --check` pass. Lint reports zero errors and only the repository's pre-existing 152 warnings under installed Impeccable sources.
18. **Browser engine:** Installed Google Chrome `151.0.7922.138`, headless through repository `playwright-core`.
19. **Staging identity:** `PRIVATE_SYNTHETIC_STAGING`, `127.0.0.1:3188`, synthetic-only SQLite/storage under `.codex-tmp/stage3-sanitized-staging`, production build ID `KFp6BkYKMVNGZisXcm027`, identity HTTP 200, command verified, exact build true. No public tunnel was used.
20. **Six-width results:** Login normal, invalid-credentials, and expired-session states passed at `360x800`, `390x844`, `430x932`, `768x1024`, `1024x768`, and `1440x900` (18 Login records). Owner Accounts, owner import mapping, and Pick were also inspected at `390x844`, `768x1024`, and `1440x900` (9 representative records). No audited Login state overflowed; representative shared actions did not introduce overflow.
21. **Control sizes:** Login Username and Password were 50px high; Show/Hide and Sign in were 50px high; Forgot Password was 44px high. Existing shared SubmitButton consumers on Accounts and import mapping computed to 44px minimum. No audited shared operational control was below 44px.
22. **Focus results:** Tab order was Username → Password → Show password → Sign in → Forgot password; Shift+Tab returned from Forgot Password to Sign in. Space and Enter toggled password visibility. Enter on an empty form preserved native required validation and focused Username. All sampled keyboard targets showed the 3px teal outline with 2px offset; none was clipped. Invalid rose inputs retained the same clear focus treatment without a competing halo.
23. **Contrast results:** white/action `6.04:1`; slate text/white `17.85:1`; muted help/white `7.58:1`; danger/rose-soft `5.72:1`; disabled text/disabled surface `6.92:1`; focus/white `5.47:1`; focus/stone `5.24:1`; focus/amber-soft `4.92:1`; focus/rose-soft `4.98:1`. On berry and teal surfaces the white 2px separation boundary provides the contrasting focus edge (white/berry `6.04:1`; white/teal `5.47:1`).
24. **Console errors:** 0 across 27 final browser records.
25. **Page errors:** 0 across 27 final browser records.
26. **Unexpected requests:** 0 failed requests and 0 HTTP error responses across 27 final browser records.

## Review, deferrals, and safety

27. **Impeccable findings:** Scoped deterministic detection was run only against the changed control foundation and representative Login sources. Final result: 0 findings. An initial literal-token advisory in `globals.css` was corrected by consolidating repeated semantic values.
28. **False positives:** None remained in the final B1a scoped detector result; no palette change was made merely to silence detection.
29. **Deferred findings:** B1b banners/statuses/surfaces; B2 duplicate `aria-current`, navigation grouping, account-menu keyboard behavior, and drawer background isolation; B3 Dashboard 433px overflow, import IA, and KPI hierarchy; D5a Accounts F13 40px controls; later worker-card work. No deferred finding was opportunistically changed.
30. **Protected business paths:** Authentication/session/throttling/authorization, account selection, permissions, warehouse actions and transitions, imports/projections/reports, Data Management, route-decision policy, payload names, quantities, and idempotency are unchanged.
31. **Prisma:** Schema, migrations, configuration, and database behavior are unchanged. Prisma Client generation during the standard production build did not change tracked Prisma sources.
32. **mobile-app:** Unchanged.
33. **Real data:** Untouched. Browser validation used only repository synthetic credentials, synthetic database, and synthetic storage.
34. **Staging stopped:** Confirmed `STOPPED` after browser validation, with no receipt or live process.
35. **Port 3188:** Closed after validation.
36. **Commit SHA:** The exact SHA is the commit containing this report and is recorded in the final handoff and branch history. A Git commit cannot embed its own content-derived SHA.
37. **Push result:** The branch was pushed to `origin/phase-7.4b1a-ui-foundation-controls` and the remote was verified at the same commit; the exact remote SHA is recorded in the final handoff.
38. **Worktree state:** Clean after commit and push; `mobile-app` remains clean.

No B1b, B1c, B2, B3, Accounts F13, Users, worker-card, PostgreSQL, merge, deployment, or real-data work was performed.
