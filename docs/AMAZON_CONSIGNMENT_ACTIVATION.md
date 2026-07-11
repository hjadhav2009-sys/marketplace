# Amazon Consignment Activation

Only an owner/consignment manager can activate a reviewed Amazon draft. Every line must have a positive quantity, explicit listing match, supported process route, and no unresolved blocking issue.

`PICK_PACK` creates `PICK READY` and `PACK LOCKED`. `PICK_MARK_PACK` creates `PICK READY`, `MARK LOCKED`, and `PACK LOCKED`. Marking lines require an active linked asset plus instructions or a Master Design ID; missing product images require explicit owner review. Missing worker marking files do not block activation.

Activation rechecks relationships transactionally, creates one task plan, and freezes identifiers/catalog display data. It never changes inventory or marketplace quantities.
