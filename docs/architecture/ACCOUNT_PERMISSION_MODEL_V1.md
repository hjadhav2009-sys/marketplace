# Account Permission Model V1

Status: Frozen target architecture for Phase D5a/D5b. Phase D1 records this model but does not implement it or broaden current access.

## Authorization principle

Roles are broad labels. Permissions are the effective authority, and their final scope is per seller account.

The broad roles are:

- `OWNER`
- `ADMIN`
- `WORKER`

Compatibility role values may remain until Phase D5. Hiding a route, action, or button is never authorization: every permission must be enforced again by the backend at the protected operation.

## Permission families

### Work

- `canPick`
- `canMark`
- `canAssemble`
- `canPack`
- `canReportProblem`
- `canResolveProblems`
- `canViewAllWork`

### Import

- `canImportProductCatalog`
- `canImportDailyOrders`
- `canImportConsignments`
- `canViewImportHistory`
- `canResolveImportIssues`

### Catalog

- `canViewProductInventory`
- `canEditProductCatalog`
- `canResolveMissingListings`
- `canManageProcessRules`
- `canManageMarkingLibrary`

### Management

- `canManageConsignments`
- `canViewReports`
- `canManageAccounts`
- `canManageUsers`
- `canManageData`
- `canViewSystem`

## Per-account scope

The final permission assignment belongs to the relationship between a user and a seller account. The same person may therefore have different capabilities on different accounts.

Example — Listing Team worker on Account A:

```text
canViewProductInventory = true
canImportProductCatalog = true
canResolveImportIssues = true

canImportDailyOrders = false
canPick = false
canPack = false
```

Example — Picker on Account A:

```text
canPick = true
canImportDailyOrders = true only when the owner grants it
canImportProductCatalog = false unless separately granted
```

An import capability never follows automatically from a work capability. Product Catalog import remains unavailable unless it is granted explicitly.

## Owner authority

`OWNER` has full access across all seller accounts, including Accounts, Users, Data Management, and System administration.

## Phase ownership and compatibility

- D1–D4 retain their current protected owner/management access. Merely documenting this future model must not broaden authorization.
- D5a/D5b implement the per-account permission persistence, backend enforcement, and owner-facing management UI.
- Unauthorized workers must not receive owner mutation access before that deliberate implementation.
- Existing backend checks remain mandatory throughout the transition.
