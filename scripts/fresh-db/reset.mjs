import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { clearActiveStorage, inventoryDatabase, latestBackup, POST_RESET_RESULT, purgeDatabase, requireOwnerArgument, resolveRealDatabasePath, sha256File, TEST_RESULT, verifyManifest, writePrivateJson } from "./core.mjs";
try {
  const username=requireOwnerArgument(); if(!process.argv.includes("--confirm-fresh-start")){console.error("Real reset was not run: --confirm-fresh-start is required.");process.exit(2);}
  const databasePath=resolveRealDatabasePath(), {manifest}=latestBackup(username); await verifyManifest(manifest); if(!existsSync(TEST_RESULT))throw new Error("Real reset refused: disposable reset proof is missing.");
  const proof=JSON.parse(readFileSync(TEST_RESULT,"utf8")); const currentSha=await sha256File(databasePath);
  if(!proof.passed||!proof.prismaValidationPassed||!proof.authenticationLookupResolvedOwner||!proof.loginPageResponded||proof.sourcePath!==databasePath||proof.sourceSha256!==manifest.sourceSha256||proof.backupSha256!==manifest.backupSha256||currentSha!==manifest.sourceSha256)throw new Error("Real reset refused: proof is stale, mismatched, incomplete, or the real database changed after backup.");
  const current=inventoryDatabase(databasePath,username); if(current.pendingMigrations.length)throw new Error(`Real reset refused: pending migrations remain (${current.pendingMigrations.join(", ")}).`); if(current.migrations.length!==manifest.appliedMigrations.length||JSON.stringify(current.migrations)!==JSON.stringify(manifest.appliedMigrations))throw new Error("Real reset refused: migrations changed after backup.");
  console.log(JSON.stringify({databaseFile:basename(databasePath),selectedOwner:current.selectedOwner,deleteSummary:current.inventory.filter(r=>r.classification==="delete-all").map(r=>({table:r.table,rows:r.preResetCount}))},null,2));
  const terminal=createInterface({input:stdin,output:stdout}); const typedDb=await terminal.question(`Type ${basename(databasePath)}: `), typedOwner=await terminal.question("Type the selected owner username: "), typedPhrase=await terminal.question("Type DELETE ALL DATA EXCEPT THIS OWNER: "); terminal.close();
  if(typedDb.trim()!==basename(databasePath)||typedOwner.trim()!==username||typedPhrase.trim()!=="DELETE ALL DATA EXCEPT THIS OWNER"){console.error("Typed confirmations did not match. Real reset was not run.");process.exit(2);}
  const result=purgeDatabase(databasePath,username,{vacuum:true}); writePrivateJson(POST_RESET_RESULT,{...result,storageCleanupPassed:false}); await clearActiveStorage(); const completed={...result,storageCleanupPassed:true}; writePrivateJson(POST_RESET_RESULT,completed); console.log(JSON.stringify(completed,null,2));
} catch(error){ console.error(error instanceof Error?error.message:String(error)); process.exit(1); }
