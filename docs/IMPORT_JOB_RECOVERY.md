# Import Job Recovery

Product Inventory jobs persist a versioned manifest and progress after each file. One local runner processes a job. Queued jobs resume from the progress endpoint. Exact identity and idempotent identifier synchronization make retries safe.

Cancel is available only before merge. Absolute paths and raw stack traces are never returned. Redis is intentionally not used for the owner-PC deployment.
