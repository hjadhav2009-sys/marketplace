import { inspectDatabase, resolveRealDatabasePath, safeDatabaseSummary } from "./safety.mjs";

const snapshot=inspectDatabase(resolveRealDatabasePath());
console.log(JSON.stringify(safeDatabaseSummary(snapshot),null,2));
if(snapshot.integrity.join(",")!=="ok"||snapshot.foreignKeyViolationCount)process.exit(1);
