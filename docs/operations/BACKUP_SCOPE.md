# Release backup scope

## Stage 1 boundary

Phase 7.3.6 Stage 1 proves a backup and restore design with synthetic data only. The commands refuse the repository's normal SQLite database and private-storage root, require all paths to remain under `.codex-tmp/stage1-backup/`, and require explicit synthetic confirmation. This is not authorization to back up, restore, migrate, or inspect production data.

## Consistency model

The supported release model is:

1. Stop the application and every writer, importer, recovery runner and maintenance command.
2. Confirm the source is quiescent.
3. Use SQLite's online backup API to create a standalone database image. Do not copy only the main `.db` file.
4. While writers remain stopped, copy the reviewed private-storage roots.
5. write a sealed manifest and verify database and file hashes, SQLite integrity, foreign keys, migration history, required tables and row counts.
6. Resume writers only after the backup is verified.

SQLite WAL commits may exist only in `-wal`. The online backup API incorporates committed WAL state into the standalone backup. The `-shm` file is transient shared-memory coordination state and is not a restore artifact. A rollback journal is an implementation sidecar, not a separately restored application file. Cross-resource database/file coherence still requires the application-wide quiescence window.

## Classified paths

| Repository-relative path | Classification | Reason and restore treatment |
| --- | --- | --- |
| `prisma/dev.db` plus live SQLite state | `MUST_BACK_UP` | Authoritative application database. Future production tooling must use an online SQLite backup, never main-file-only copying. Stage 1 refuses this path. |
| `storage/import-jobs/` | `MUST_BACK_UP` | Retained import files may be referenced by `ImportJob.filePath` for review, retry or recovery. |
| `storage/marking-library/` | `MUST_BACK_UP` | Private marking assets are durable application content. |
| `storage/consignment-imports/` | `MUST_BACK_UP` | Retained consignment sources may be needed for mapping/reparse/review. |
| `storage/product-images/` | `REGENERABLE` | Cached marketplace images are derivable, but database cache paths must remain coherent. Safest initial production procedure includes this root. A future exclude mode must transactionally invalidate cache references. |
| `storage/marking-temp/` | `TEMPORARY_EXCLUDE` | Temporary work area; restore must start empty. |
| `storage/temp/` | `TEMPORARY_EXCLUDE` | Temporary work area; restore must start empty. |
| `.next/`, `node_modules/` | `TEMPORARY_EXCLUDE` | Build/dependency artifacts, recreated from source and lockfiles. |
| `.codex-tmp/` | `TEMPORARY_EXCLUDE` | Disposable tests, benchmarks and rehearsals. Stage 1 outputs live here only because production mode is disabled. |
| `backups/` | `HISTORICAL_BACKUP_DO_NOT_OVERWRITE` | Historical backup sets must never be recursively included in a new backup. They are managed as separate immutable generations. |
| `storage/uploads/` | `MUST_BACK_UP_PENDING_CLEANUP` | Stage 2 found no files and no current source-code writer, but historical reset tooling still classifies the root as active. Include conservatively until an owner-approved cleanup removes the ambiguity. |
| environment files, credentials, keystores | `SECRET_EXCLUDE` | Required for recovery but must use the approved secret manager, not the application backup archive or its manifest. |

Only reviewed roots may be added. Unknown roots fail the future production preflight; they are never silently excluded. The classification vocabulary is `MUST_BACK_UP`, `MUST_BACK_UP_PENDING_CLEANUP`, `REGENERABLE`, `TEMPORARY_EXCLUDE`, `SECRET_EXCLUDE`, `HISTORICAL_BACKUP_DO_NOT_OVERWRITE`, and `UNKNOWN_REQUIRES_STAGE2_CONFIRMATION`.

`storage/marking-library/` and `storage/consignment-imports/` are defaults; their code supports `MARKING_LIBRARY_ROOT` and `CONSIGNMENT_IMPORT_ROOT`. Stage 2 added `IMPORT_JOB_STORAGE_ROOT` and `PRODUCT_IMAGE_STORAGE_ROOT` so a temporary copied application cannot fall back to production storage. Rehearsal tooling derives effective roots without publishing their absolute values and verifies that they are distinct and private. The default SQLite URL in the public example resolves `file:./dev.db` through the Prisma schema location; synthetic mode uses neither that default nor an environment file.

## Manifest contract

`ReleaseBackupManifestV1` records:

- manifest version, backup ID, UTC timestamps and application commit;
- backup mode and scope-classification version;
- safe database display name, byte size and SHA-256;
- source journal mode, quiescence confirmation and backup method;
- SQLite integrity and foreign-key result;
- applied migrations, required tables and per-table counts;
- safe storage display root, every relative file path, byte size and SHA-256;
- total file count/bytes and a canonical manifest self-check.

It deliberately records no source absolute path, environment value, credential, customer value or raw spreadsheet row.

## Stage 1 synthetic storage

The synthetic fixture uses one combined private-storage directory containing fake import, marking and image files. It includes a zero-byte file, a Unicode filename and a long safe path. This proves the generic archive mechanism; it does not resolve the `UNKNOWN_REQUIRES_STAGE2_CONFIRMATION` classifications above.
