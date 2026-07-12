import { spawnSync } from "node:child_process";
import { inspectDatabase, MIGRATION_RESULT_PATH, prepareMigrationTestCopy, compareSnapshots, writeJson } from "./safety.mjs";

function run(command,args,env){const executable=process.platform==="win32"?"cmd.exe":command;const executableArgs=process.platform==="win32"?["/d","/s","/c",command,...args]:args;const result=spawnSync(executable,executableArgs,{cwd:process.cwd(),env,stdio:"inherit"});if(result.status!==0)throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status??1}.`);}
const prepared=await prepareMigrationTestCopy();
const env={...process.env,DATABASE_URL:`file:${prepared.testPath.replace(/\\/g,"/")}`};
run(process.platform==="win32"?"npx.cmd":"npx",["prisma","migrate","deploy","--schema","prisma/schema.prisma"],env);
run(process.platform==="win32"?"npx.cmd":"npx",["prisma","migrate","status","--schema","prisma/schema.prisma"],env);
const after=inspectDatabase(prepared.testPath);const comparison=compareSnapshots(prepared.before,after);const passed=after.integrity.join(",")==="ok"&&after.foreignKeyViolationCount===0&&after.pendingMigrations.length===0&&comparison.ok;
const result={version:1,passed,applicationSuitesPassed:false,createdAt:new Date().toISOString(),sourcePath:prepared.manifest.sourcePath,backupPath:prepared.manifest.backupPath,backupSha256:prepared.manifest.backupSha256,testPath:prepared.testPath,before:prepared.before,after,comparison};writeJson(MIGRATION_RESULT_PATH,result);
console.log(JSON.stringify({testPath:prepared.testPath,passed,integrity:after.integrity,foreignKeyViolationCount:after.foreignKeyViolationCount,pendingMigrations:after.pendingMigrations,comparison},null,2));if(!passed)process.exit(1);
for(const suite of ["test:validators","consignment:test","workflow:test","universal-scan:test","assembly:test","amazon-consignment:test"])run(process.platform==="win32"?"npm.cmd":"npm",["run",suite],env);
result.applicationSuitesPassed=true;writeJson(MIGRATION_RESULT_PATH,result);console.log("Copied-database migrations and targeted application suites passed.");
