# Phase 7.3.6 Real-Database Manual QA Links

This is a navigation checklist, not evidence that QA passed. Use it only after:

1. synthetic automated and visible QA passes;
2. all application writers are stopped;
3. a new real database and managed-storage backup is created and verified;
4. that backup is restored to a private rehearsal copy;
5. migrations and application checks pass on the copy;
6. the owner types the separately required authorization phrase.

The owner must log in manually. Never place a password in a command, report, screenshot name, URL, or chat.

Use the locally bound review origin selected by the guarded start command. Do not expose it through a public tunnel.

## Authentication and owner navigation

- `/login`
- `/dashboard`
- `/accounts`
- `/owner/accounts`
- `/owner/users`
- `/owner/system`
- `/change-password`

## Product Inventory and imports

- `/owner/product-inventory`
- `/owner/product-inventory/new`
- `/owner/product-inventory/refresh`
- `/owner/catalog/missing`
- `/owner/imports`
- `/owner/sku-mappings`
- `/owner/data-management`
- `/owner/data-management?tab=files`
- `/owner/data-management?tab=imports`
- `/owner/data-management?tab=catalog`
- `/owner/data-management?tab=trash`
- `/owner/data-management?tab=history`
- `/owner/data-management?tab=reset`

## Consignments and workflow

- `/owner/consignments`
- `/owner/process-rules`
- `/owner/marking-library`
- `/owner/work-route-summary`
- `/work`
- `/work/pick?source=ORDER`
- `/work/pick?source=CONSIGNMENT`
- `/work/mark`
- `/work/assemble`
- `/work/pack`
- `/work/scan`
- `/work/problems`

## Reports and operational checks

- `/reports`
- `/owner/system`

Dynamic routes such as a listing, import job, missing-listing issue, Consignment batch, task, or exact work-card Details page must be opened from their parent list so the identifier remains account-scoped.
