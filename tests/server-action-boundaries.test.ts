import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { sanitizePublicActionError } from "../src/lib/import-jobs/safe-error";

const actionPaths = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter((path) => /^app\/.+\/actions\.tsx?$/.test(path));

const caughtRedirects: string[] = [];
for (const path of actionPaths) {
  const source = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node: ts.Node) => {
    if (ts.isTryStatement(node)) {
      const inspectTry = (candidate: ts.Node) => {
        if (ts.isCallExpression(candidate) && ts.isIdentifier(candidate.expression) && candidate.expression.text === "redirect") {
          const { line } = file.getLineAndCharacterOfPosition(candidate.getStart(file));
          caughtRedirects.push(`${path}:${line + 1}`);
        }
        ts.forEachChild(candidate, inspectTry);
      };
      inspectTry(node.tryBlock);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}

assert.deepEqual(caughtRedirects, [], `Next redirect() must execute after the surrounding try/catch: ${caughtRedirects.join(", ")}`);

const privacyBoundaries = [
  "app/owner/consignments/actions.ts",
  "app/owner/imports/[jobId]/actions.ts",
  "app/owner/marking-library/actions.ts",
  "app/owner/process-rules/actions.ts",
  "app/owner/product-inventory/refresh/actions.ts",
  "app/owner/uploads/actions.ts"
];
for (const path of privacyBoundaries) {
  const source = readFileSync(path, "utf8");
  assert.doesNotMatch(source, /error\s+instanceof\s+Error\s*\?\s*error\.message/, `${path} must not expose raw exception messages`);
}

for (const unsafe of [
  "C:\\private data\\orders.db failed",
  "\\\\server\\private share\\source.xlsx failed",
  "file:///private/source.csv failed",
  "/home/private/source.csv failed",
  "PrismaClientKnownRequestError P2002",
  "SQLITE_CONSTRAINT: database is locked"
]) {
  assert.equal(sanitizePublicActionError(new Error(unsafe), "Operation failed safely."), "Operation failed safely.");
}
assert.equal(sanitizePublicActionError(new Error("Select an active account."), "Operation failed safely."), "Select an active account.");

console.log(`Server-action redirect and public-error boundaries passed across ${actionPaths.length} action modules.`);
