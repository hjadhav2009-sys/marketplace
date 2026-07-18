# Database migration and backup history

Schema evolution uses ordered additive or reviewed safe-copy migrations, maintained separately for SQLite and PostgreSQL. Migration smokes protect fresh and existing-style databases. Real-data migration tooling introduced inspect, consistent backup, SHA-256, copied deployment, preserved counts/identity bounds, unchanged-source proof, explicit confirmation, and post-verification.

Fresh-start is not a migration reset. It preserves the database file, schema objects, and every applied `_prisma_migrations` row. A backup captures database and active storage under one timestamp. A disposable reset proves owner/hash/migration preservation and zero operational counts. The real command refuses stale proofs and requires exact database, owner, and deletion phrase input.

Restore is manual because replacing a database or storage tree can erase newer work. The helper verifies the chosen manifest, makes a pre-restore database safety copy, restores the database, and checks integrity/foreign keys. Storage is restored only after an owner decision.
