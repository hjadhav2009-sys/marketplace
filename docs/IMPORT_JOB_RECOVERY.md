# Import Job Recovery

Import runners use conditional database leases, heartbeat timestamps, attempt counts and retained entry checkpoints. Status GET and progress pages are read-only; start/retry is explicit. A stale lease may be reclaimed, while only its current runner ID may publish progress.

Product Inventory jobs persist a versioned manifest and progress after each file. A conditional database update gives one runner the lease even when multiple processes attempt the job. Explicit POST/server actions start or retry work; progress GET routes never start jobs. Exact identity and idempotent identifier synchronization make retries safe.

Cancellation is checked before parsing and between Product Inventory entries. A process crash leaves an expiring lease; the next bounded attempt resumes retained parsing or completed-entry merge checkpoints. Attempts are capped at ten. Absolute paths and raw stack traces are never returned. Redis is intentionally not used for the owner-PC deployment.
