import { execFileSync } from "node:child_process";
import { createVerifiedBackup } from "./safety.mjs";

const commit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();process.env.REAL_DB_GIT_COMMIT=commit;
const result=await createVerifiedBackup();
console.log(JSON.stringify({backupPath:result.manifest.backupPath,manifestPath:result.manifestPath,sourceSizeBytes:result.manifest.sourceSizeBytes,backupSizeBytes:result.manifest.backupSizeBytes,backupSha256:result.manifest.backupSha256,integrity:result.manifest.integrity,appliedMigrationCount:result.manifest.appliedMigrations.length,pendingMigrations:result.manifest.pendingMigrations},null,2));
