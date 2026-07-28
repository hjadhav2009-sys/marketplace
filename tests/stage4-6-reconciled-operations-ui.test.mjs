import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");

const consignments = read("app/owner/consignments/page.tsx");
const consignmentDetail = read("app/owner/consignments/[batchId]/page.tsx");
const consignmentIssues = read("app/owner/consignments/[batchId]/issues/page.tsx");
const newConsignment = read("app/owner/consignments/new/page.tsx");
const imports = read("app/owner/imports/page.tsx");
const importDetail = read("app/owner/imports/[jobId]/page.tsx");
const importProgress = read("components/ImportJobProgress.tsx");
const uploadField = read("components/FileUploadField.tsx");
const format = read("lib/format.ts");
const users = read("app/owner/users/page.tsx");
const accounts = read("app/owner/accounts/page.tsx");
const reports = read("app/reports/page.tsx");

assert.match(consignments, /Review and activate/);
assert.match(consignments, /View completion record/);
assert.match(consignments, /Valid lines/);
assert.match(consignments, /Required units/);
assert.match(consignments, /Generated tasks|Problem tasks/);
assert.match(consignmentDetail, /Matched listings/);
assert.match(consignmentDetail, /Replace and reparse draft/);
assert.match(consignmentIssues, /encodeURIComponent\(group\.issueType\)/);
assert.match(consignmentIssues, /INFORMATION/);
assert.match(consignmentIssues, /aria-disabled="true"/);
assert.match(newConsignment, /Safe upload sequence/);
assert.match(newConsignment, /No worker tasks are created/);

assert.match(imports, /marketplace === "AMAZON" \? undefined/);
assert.match(imports, /Not enabled in this release/);
assert.match(imports, /More counts and downloads/);
assert.match(imports, /Rows processed/);
assert.match(imports, /Warning\/error rows/);
assert.match(importDetail, /Start another import/);
assert.match(importDetail, /Request safe cancellation/);
assert.match(importProgress, /Support reference: IMP-/);
assert.match(importProgress, /Source files processed/);
assert.doesNotMatch(importProgress, /href="\/picker"/);

assert.match(uploadField, /type="file"/);
assert.match(uploadField, /aria-live="polite"/);
assert.match(uploadField, /No file selected/);
assert.match(uploadField, /file\.size/);
assert.match(format, /timeZone: "Asia\/Kolkata"/);
assert.match(format, /timeZoneName: "short"/);
assert.match(users, /Manage access, password and recent sessions/);
assert.match(users, /Create a new user/);
assert.match(accounts, /Edit account details/);
assert.match(accounts, /Locked because marketplace data exists/);
assert.match(accounts, /Open scoped view/);
assert.match(reports, /Report scope · live as of/);
assert.match(reports, /Open problems count the selected account scope regardless of date/);
assert.match(reports, /Exports unavailable: no rows for current filters/);
assert.match(reports, /aria-disabled="true"/);

console.log("Stage 4.6 reconciled owner-operations UI contract tests passed.");
