import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { argument, inventoryDatabase, resolveRealDatabasePath, sha256File, verifyManifest } from "./core.mjs";
try {
  const supplied=argument("--backup-manifest"); if(!supplied)throw new Error('Restore refused: provide --backup-manifest "backups/fresh-start/<timestamp>/backup-manifest.json".');
  const manifestPath=resolve(supplied); if(!existsSync(manifestPath))throw new Error("Restore manifest does not exist."); const manifest=JSON.parse(readFileSync(manifestPath,"utf8")); await verifyManifest(manifest);
  const target=resolveRealDatabasePath(), terminal=createInterface({input:stdin,output:stdout}); const typed=await terminal.question(`Type RESTORE ${basename(target)} FROM VERIFIED BACKUP: `); terminal.close(); if(typed.trim()!==`RESTORE ${basename(target)} FROM VERIFIED BACKUP`){console.error("Typed confirmation did not match. Restore was not run.");process.exit(2);}
  const safety=resolve(dirname(manifestPath),`pre-restore-${Date.now()}.db`); const current=new DatabaseSync(target,{readOnly:true}); try{await sqliteBackup(current,safety);}finally{current.close();}
  await copyFile(manifest.backupPath,target); const restoredSha256=await sha256File(target), inspection=inventoryDatabase(target,manifest.selectedOwner.username); if(restoredSha256!==manifest.backupSha256||inspection.integrity.join(",")!=="ok"||inspection.foreignKeyViolationCount)throw new Error("Restored database failed verification. No automatic rollback was attempted; preserve both files and investigate.");
  console.log(JSON.stringify({restored:true,targetFile:basename(target),verifiedBackupSha256:restoredSha256,preRestoreSafetyCopy:safety,storageRestore:"not requested; copy storage-backup manually only while writers remain stopped"},null,2));
} catch(error){ console.error(error instanceof Error?error.message:String(error)); process.exit(1); }
