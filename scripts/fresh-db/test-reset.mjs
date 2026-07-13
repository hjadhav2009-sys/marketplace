import { copyFile, rm } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { assertInside, latestBackup, purgeDatabase, requireOwnerArgument, ROOT, TEMP_ROOT, TEST_DB, TEST_RESULT, verifyManifest, writePrivateJson } from "./core.mjs";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

async function verifyTemporaryLoginPage(databaseUrl) {
  const require=createRequire(import.meta.url), nextBin=require.resolve("next/dist/bin/next"), port=String(41000+Math.floor(Math.random()*1000));
  const child=spawn(process.execPath,[nextBin,"dev","-H","127.0.0.1","-p",port],{cwd:ROOT,env:{...process.env,DATABASE_URL:databaseUrl},stdio:"ignore"});
  try {
    const deadline=Date.now()+90_000; let lastError="not ready";
    while(Date.now()<deadline){
      if(child.exitCode!==null)throw new Error(`Temporary app exited with code ${child.exitCode}.`);
      try{const response=await fetch(`http://127.0.0.1:${port}/login`,{redirect:"manual"});if(response.status>=200&&response.status<400)return {appStarted:true,loginPageResponded:true,httpStatus:response.status};lastError=`HTTP ${response.status}`;}catch(error){lastError=error instanceof Error?error.message:String(error);}
      await new Promise((resolveDelay)=>setTimeout(resolveDelay,500));
    }
    throw new Error(`Temporary login-page verification timed out: ${lastError}`);
  } finally { child.kill(); }
}
try {
  const username=requireOwnerArgument(), {manifest}=latestBackup(username); await verifyManifest(manifest); mkdirSync(TEMP_ROOT,{recursive:true}); assertInside(TEST_DB,TEMP_ROOT,"Disposable reset database"); await rm(TEST_DB,{force:true}); await copyFile(manifest.backupPath,TEST_DB);
  const result=purgeDatabase(TEST_DB,username,{vacuum:true}); const databaseUrl=`file:${TEST_DB.replace(/\\/g,"/")}`;
  execFileSync(process.platform==="win32"?"cmd.exe":"npx",process.platform==="win32"?["/d","/s","/c","npx.cmd","prisma","validate","--schema","prisma/schema.prisma"]:["prisma","validate","--schema","prisma/schema.prisma"],{cwd:ROOT,env:{...process.env,DATABASE_URL:`file:${TEST_DB.replace(/\\/g,"/")}`},stdio:"pipe"});
  const appVerification=await verifyTemporaryLoginPage(databaseUrl);
  const proof={...result,sourcePath:manifest.sourceDatabasePath,sourceSha256:manifest.sourceSha256,backupPath:manifest.backupPath,backupSha256:manifest.backupSha256,manifestCreatedAt:manifest.createdAt,prismaValidationPassed:true,authenticationLookupResolvedOwner:result.selectedOwner.username===username,...appVerification}; writePrivateJson(TEST_RESULT,proof); console.log(JSON.stringify(proof,null,2));
} catch(error){ console.error(error instanceof Error?error.message:String(error)); process.exit(1); }
