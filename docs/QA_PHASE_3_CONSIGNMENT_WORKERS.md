# Phase 3 Consignment Worker QA

Use fake or sanitized data only. Never commit uploaded files or database files.

## Owner

1. Upload and review a fake consignment, confirm manual matches show `OWNER_SELECTED`, then activate it.
2. Confirm task totals by stage/status and assign PICK, MARK, and PACK only to eligible workers.
3. Replace a draft source and confirm exactly one `CURRENT SOURCE` plus superseded history.
4. Resolve one worker problem with a note and confirm progress is retained.

## Picker

1. Open `/work`, then Consignment Pick.
2. Search exact SKU/FSN, start, use `+1`, set quantity, and complete.
3. Report a problem and confirm the next stage stays locked.

## Marker

1. Claim a ready MARK task and inspect settings.
2. Open preview and download the private file.
3. Record marked quantity and complete; confirm PACK becomes ready.

## Packer

1. Search SKU/FSN, claim, increment, and pack remaining.
2. Confirm completed work leaves the active queue and the last line completes the batch.

## Devices And Concurrency

Check 360, 390, 430, 768, 1024, and 1440 pixel widths with no horizontal page scroll or hidden actions. Test two workers claiming the same task, a double tap with one request ID, a stale page quantity, disconnect/retry, unauthorized account access, and a missing marking file.
