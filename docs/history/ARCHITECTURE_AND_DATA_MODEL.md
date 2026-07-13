# Architecture and data-model history

The repository evolved from a Next.js owner-PC tool into an account-scoped catalog and staged-work system. SQLite is authoritative for local deployment; Prisma supplies equivalent SQLite and PostgreSQL models/migrations. UI code calls server actions/services, and exact account/capability checks must occur at the server boundary.

Core identity models are User, UserDeviceSession, PasswordResetRequest, Account, the implicit assigned-account join, and AuditLog. Catalog models are MarketplaceListing, MarketplaceListingIdentifier, SkuImageMapping, ProductProcessRule, MarkingAsset, MarkingAssetFile, and MarkingAssetListingLink. Import models are ImportJob, UploadBatch, ImportRowIssue, and UploadPreviewRow. Operational models are Order, ProblemOrder, ScanLog, ConsignmentBatch, ConsignmentLine, ConsignmentImportFile, ConsignmentImportIssue, WorkTask, and WorkActionLog.

Account foreign keys provide tenant-like separation on one owner-controlled database. WorkTask links either an Order or ConsignmentLine and records source, stage, sequence, quantities, status, assignment, actors, problem state, and timestamps. WorkActionLog records immutable action/replay evidence. Consignment lines retain source values and activation snapshots so later catalog edits do not rewrite warehouse evidence.

Fresh-start reset classification is deliberately schema-derived. `_prisma_migrations` is preserved; User preserves one selected OWNER; every other application table is deleted. Foreign keys determine child-before-parent order, and post-reset verification rejects any nonzero operational table.
