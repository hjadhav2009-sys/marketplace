# Security and concurrency history

Security layers include hashed-password authentication, active/lockout state, device sessions, reset requests, audit logs, exact role/capability checks, account scoping, input validation, safe path handling, upload/parser/archive limits, and private ignored operational files.

Idempotency uses task, actor, request kind, and client request identity. Duplicate quantity requests must yield one mutation and one action log. Bounded retry handles transient SQLite contention and safe replay recovery converts a committed competing request into its prior result. Controlled busy errors avoid leaking low-level database failures.

The reset checkpoint adds exact owner validation, read-only inspection, consistent SQLite backup, SHA-256 verification, migration checksum/name comparison, unchanged-source proof, disposable-copy proof, three typed confirmations, transaction verification, and nonautomatic restore. Password hashes, tokens, and private business rows are never printed or documented.
# Phase 7.3.4 amendment

Durable privacy-hashed username and IP throttles now protect web/mobile login, forgot-password, first-run setup and sensitive owner resets. Import runners use conditional leases, heartbeats, bounded attempts and retained checkpoints.
