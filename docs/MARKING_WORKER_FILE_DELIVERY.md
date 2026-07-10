# Future Marking Worker File Delivery

This contract is documentation only. No Worker Agent or automatic file delivery is active in Phase 1.

The owner server keeps the original active marking file permanently. A future authenticated task endpoint may issue a short-lived download, return the expected SHA-256, and record download acknowledgement. The endpoint must authorize stage permission and assigned account every time.

```json
{
  "taskId": "task_fake_001",
  "fileName": "design-example.ezd",
  "downloadUrl": "/api/worker/tasks/task_fake_001/file?token=short-lived",
  "sha256": "fake-sha256",
  "expiresAt": "2026-07-11T10:00:00Z"
}
```

A later Windows agent may download into `%LOCALAPPDATA%\MarketplaceWorker\jobs\<taskId>\`, verify SHA-256, open through Windows association or a reviewed `engravingbrain://` protocol, report `OPENED`, wait for worker completion, delete only its temporary local copy, retry locked-file deletion, and clean stale jobs.

The owner original is never deleted. Browser-only download remains available, and the server never assumes a browser can silently delete a local file.
