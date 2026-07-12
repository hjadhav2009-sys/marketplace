# Optional Default Processing

`ProductProcessRule` is a convenience default, not a validity requirement.

- No active applicable rule: Pick -> Pack.
- `PICK_PACK`: Direct to Pack.
- `PICK_MARK_PACK`: Marking.
- `PICK_ASSEMBLE_PACK`: Assembly.
- `PICK_MARK_ASSEMBLE_PACK`: Marking + Assembly.

Activation uses an applicable account-scoped rule, otherwise the reviewed route, otherwise `PICK_PACK`. Missing title/image and marking setup are warnings. Account mismatch, unusable identity, unresolved identifier conflict, invalid quantity, and unsupported route remain blocking.
