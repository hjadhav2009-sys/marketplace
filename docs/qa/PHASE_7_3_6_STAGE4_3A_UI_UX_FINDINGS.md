# Phase 7.3.6 Stage 4.3A UI/UX Findings

## Accepted and implemented

- Login states share one responsive layout.
- Production username placeholder is `Enter username`.
- Login typography uses the application sans-serif system.
- Invalid and expired messages have accessible semantics and clearer wording.
- Password Show/Hide is keyboard operable and cannot submit the form.
- Forgot-password has a minimum 44-pixel target.
- Synthetic staging warning is compact on mobile.
- Mobile account menu is bounded to the viewport.
- Outside click and Escape close the account menu; Escape returns focus.
- Switch account remains `/accounts`.
- Logout remains the audited server action.
- Mobile bottom navigation remains retired; the permission-derived drawer is
  the mobile navigation authority.
- Pick badges remain in one row at 768, 1024 and 1440 widths.
- Pick quantity layout is compact at tablet size and wider at 1440.

## Deferred

- Moving secondary mobile identifiers behind expandable details needs a
  separate interaction decision.
- Further typography-weight reduction needs owner visual approval.
- A dedicated forbidden/access-denied experience is not implemented in this
  visual repair.

## Blocking verification

The existing screenshots named `AUTH_FORBIDDEN` show redirected Pick content
and are not evidence of a forbidden page. A controllable browser was
unavailable, so the real forbidden state and the complete seven-role
interaction matrix remain unverified.
