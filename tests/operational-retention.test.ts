import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const repoRoot=process.cwd(),root=resolve(repoRoot,".codex-tmp");mkdirSync(root,{recursive:true});
const file=resolve(root,"operational-retention.db"),backup=resolve(root,"operational-retention-backup.db"),manifestFile=resolve(root,"verified-backup-manifest.json"),sandbox=resolve(root,"operational-retention-sandbox"),storageRoot=resolve(sandbox,"storage","import-jobs");
rmSync(file,{force:true});rmSync(backup,{force:true});rmSync(manifestFile,{force:true});rmSync(sandbox,{recursive:true,force:true});mkdirSync(storageRoot,{recursive:true});

const validArtifact=resolve(storageRoot,"job_11111111-1111-4111-8111-111111111111-synthetic.csv");
const protectedSharedArtifact=resolve(storageRoot,"job_22222222-2222-4222-8222-222222222222-shared.csv");
const eligibleSharedArtifact=resolve(storageRoot,"job_33333333-3333-4333-8333-333333333333-shared.csv");
const rootSentinel=resolve(storageRoot,"root-sentinel.keep");
for(const target of[validArtifact,protectedSharedArtifact,eligibleSharedArtifact,rootSentinel])writeFileSync(target,`synthetic ${target}\n`);

const sqlite=new DatabaseSync(file);sqlite.exec("PRAGMA foreign_keys=ON;");for(const name of readdirSync(resolve(repoRoot,"prisma/migrations"),{withFileTypes:true}).filter(item=>item.isDirectory()).map(item=>item.name).sort())sqlite.exec(readFileSync(join(repoRoot,"prisma/migrations",name,"migration.sql"),"utf8"));sqlite.exec("INSERT INTO Account (id,name,code,marketplace,active,createdAt,updatedAt) VALUES ('account','Synthetic','SYN','FLIPKART',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");sqlite.exec("INSERT INTO WorkChangeEvent (accountId,eventType,sourceType,createdAt) VALUES ('account','SYNTHETIC','ORDER',946684800000)");
const insertJob=sqlite.prepare("INSERT INTO ImportJob (id,accountId,marketplace,importType,fileName,filePath,status,stage,finishedAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)"),old=946684800000,recent=Date.now();
insertJob.run("unsafe-root","account","FLIPKART","FLIPKART_ORDER","root",storageRoot,"COMPLETED","COMPLETED",old,old);
insertJob.run("unsafe-parent","account","FLIPKART","FLIPKART_ORDER","parent",dirname(storageRoot),"COMPLETED","COMPLETED",old,old);
insertJob.run("unsafe-sibling","account","FLIPKART","FLIPKART_ORDER","sibling",resolve(dirname(storageRoot),"other-imports","job_44444444-4444-4444-8444-444444444444.csv"),"COMPLETED","COMPLETED",old,old);
insertJob.run("valid-old","account","FLIPKART","FLIPKART_ORDER","valid",validArtifact,"COMPLETED","COMPLETED",old,old);
insertJob.run("shared-old","account","FLIPKART","FLIPKART_ORDER","shared old",protectedSharedArtifact,"COMPLETED","COMPLETED",old,old);
insertJob.run("shared-active-retry","account","FLIPKART","FLIPKART_ORDER","shared retry",protectedSharedArtifact,"RUNNING","PARSING",null,recent);
insertJob.run("eligible-shared-a","account","FLIPKART","FLIPKART_ORDER","eligible shared a",eligibleSharedArtifact,"FAILED","FAILED",old,old);
insertJob.run("eligible-shared-b","account","FLIPKART","FLIPKART_ORDER","eligible shared b",eligibleSharedArtifact,"CANCELLED","CANCELLED",old,old);
sqlite.close();

const command=[resolve(repoRoot,"node_modules/tsx/dist/cli.mjs"),"--tsconfig",resolve(repoRoot,"tsconfig.json"),resolve(repoRoot,"scripts/operational-retention.ts")],env={...process.env,DATABASE_URL:`file:${file.replace(/\\/g,"/")}`};
const execute=(args:string[]=[])=>execFileSync(process.execPath,[...command,...args],{cwd:sandbox,env,encoding:"utf8",stdio:"pipe"});
const sha256=(target:string)=>createHash("sha256").update(readFileSync(target)).digest("hex");
const writeVerifiedManifest=()=>{copyFileSync(file,backup);const manifest={version:1,verified:true,createdAt:new Date().toISOString(),sourcePath:file,backupPath:backup,sourceSha256:sha256(file),backupSha256:sha256(backup),backupSizeBytes:readFileSync(backup).length,integrity:["ok"],foreignKeyViolationCount:0};writeFileSync(manifestFile,JSON.stringify(manifest));return manifest;};
const runConfirmed=()=>execute(["--confirm-cleanup",`--backup-manifest=${manifestFile}`]);
const expectRefusal=(manifest:Record<string,unknown>,message:RegExp)=>{const refused=resolve(root,`retention-refused-${Math.random().toString(16).slice(2)}.json`);writeFileSync(refused,JSON.stringify(manifest));try{assert.throws(()=>execute(["--confirm-cleanup",`--backup-manifest=${refused}`]),(error:unknown)=>{assert.match(String((error as{stderr?:unknown}).stderr??error),message);return true;});}finally{rmSync(refused,{force:true});}};

try{
 const output=execute();assert.match(output,/"dryRun": true/);let verify=new DatabaseSync(file,{readOnly:true});assert.equal((verify.prepare("SELECT COUNT(*) AS count FROM WorkChangeEvent").get() as{count:number}).count,1,"Retention dry-run never deletes eligible records");verify.close();assert.throws(()=>execute(["--confirm-cleanup"]),/status 1|Command failed/);
 const initialManifest=writeVerifiedManifest();expectRefusal({verified:true,completedAt:new Date().toISOString(),databaseSha256:"a".repeat(64)},/recent verified version-1 manifest/);expectRefusal({...initialManifest,backupPath:resolve(root,"missing-backup.db")},/source or backup database is missing/);expectRefusal({...initialManifest,createdAt:new Date(Date.now()-8*86_400_000).toISOString()},/recent verified version-1 manifest/);expectRefusal({...initialManifest,sourcePath:backup},/different source database/);expectRefusal({...initialManifest,backupSha256:"b".repeat(64)},/hash does not match/);
 assert.throws(()=>runConfirmed(),(error:unknown)=>{assert.match(String((error as{stderr?:unknown}).stderr??error),/unsafe or non-owned artifact path/);return true;},"Root, parent, and sibling ImportJob paths fail closed before cleanup");
 assert.ok(existsSync(rootSentinel));assert.ok(existsSync(validArtifact));assert.ok(existsSync(protectedSharedArtifact));assert.ok(existsSync(eligibleSharedArtifact));
 verify=new DatabaseSync(file);assert.equal((verify.prepare("SELECT COUNT(*) AS count FROM WorkChangeEvent").get() as{count:number}).count,1,"Unsafe artifact preflight happens before database retention mutations");assert.equal((verify.prepare("SELECT COUNT(*) AS count FROM ImportJob WHERE filePath IS NULL").get() as{count:number}).count,0,"Unsafe cleanup clears no ImportJob reference");verify.exec("DELETE FROM ImportJob WHERE id IN ('unsafe-root','unsafe-parent','unsafe-sibling')");verify.close();

 writeVerifiedManifest();const confirmed=runConfirmed();assert.match(confirmed,/"dryRun": false/);assert.match(confirmed,/"importFiles": 3/);assert.ok(existsSync(rootSentinel),"Storage-root sentinel survives confirmed cleanup");assert.equal(existsSync(validArtifact),false,"One unshared job-owned artifact is removed");assert.equal(existsSync(eligibleSharedArtifact),false,"An artifact referenced only by eligible jobs is removed once");assert.ok(existsSync(protectedSharedArtifact),"A recent/active retry reference protects its shared source artifact");
 verify=new DatabaseSync(file,{readOnly:true});assert.equal((verify.prepare("SELECT COUNT(*) AS count FROM WorkChangeEvent").get() as{count:number}).count,0,"Verified confirmed cleanup removes eligible history");assert.equal((verify.prepare("SELECT COUNT(*) AS count FROM ImportJob WHERE id IN ('valid-old','eligible-shared-a','eligible-shared-b') AND filePath IS NULL").get() as{count:number}).count,3,"Every eligible reference to a removed artifact is cleared consistently");assert.equal((verify.prepare("SELECT COUNT(*) AS count FROM ImportJob WHERE id IN ('shared-old','shared-active-retry') AND filePath IS NOT NULL").get() as{count:number}).count,2,"An eligible source and its active retry both retain the shared path");verify.close();
}finally{rmSync(manifestFile,{force:true});rmSync(backup,{force:true});rmSync(file,{force:true});rmSync(sandbox,{recursive:true,force:true});}

console.log("Operational retention dry-run, forged-proof rejection, strict artifact ownership, shared-retry protection and confirmed cleanup tests passed.");
