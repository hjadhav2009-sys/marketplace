import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type IntegrityReceipt = {
  path: string;
  sha256: string | null;
  hashPolicy?: string;
  evidenceScope?: string;
  finalStatus: string;
  reviewedRanges: string[];
};

const manifestPath = "docs/audits/phase-7-3-5-file-review-manifest.jsonl";
const evidenceScope = "FILE_INTEGRITY_INVENTORY_NOT_SEMANTIC_REVIEW";

const binary = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|7z|gz|tar|woff2?|ttf|otf|xlsx?|xlsm|docx?|pptx?|mp4|webm|mp3|wav)$/i;

function canonicalBody(path: string) {
  const body = readFileSync(path);
  return binary.test(path) ? body : Buffer.from(body.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

function sha256(path: string) {
  return createHash("sha256").update(canonicalBody(path)).digest("hex");
}

function assertReceiptHash(path: string, receipt: Pick<IntegrityReceipt, "sha256" | "hashPolicy">) {
  assert.equal(
    receipt.hashPolicy,
    binary.test(path) ? "RAW_BYTES" : "LF_NORMALIZED_TEXT",
    `Audit receipt hash policy is invalid: ${path}`
  );
  assert.match(receipt.sha256 ?? "", /^[a-f0-9]{64}$/, `Audit receipt hash is invalid: ${path}`);
  assert.equal(receipt.sha256, sha256(path), `Audit receipt hash mismatch: ${path}`);
}

const negativePath = "tests/phase-7-3-5-audit-manifest.test.ts";
const actualHash = sha256(negativePath);
const wrongHash = actualHash === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64);
assert.throws(
  () => assertReceiptHash(negativePath, { sha256: wrongHash, hashPolicy: "LF_NORMALIZED_TEXT" }),
  new RegExp(`Audit receipt hash mismatch: ${negativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  "A changed tracked file must invalidate its receipt without mutating the tracked file"
);
assert.equal(
  createHash("sha256").update(Buffer.from("first\nsecond\n")).digest("hex"),
  createHash("sha256").update(Buffer.from("first\r\nsecond\r\n".replace(/\r\n/g, "\n"))).digest("hex"),
  "Text receipts must be stable across LF and CRLF worktrees"
);

if (process.argv.includes("--negative-only")) {
  console.log("Audit receipt negative hash regression passed against an unchanged tracked file.");
} else {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" })
    .toString("utf8")
    .split("\0")
    .filter((path) => Boolean(path) && existsSync(path))
    .sort();
  const records = readFileSync(manifestPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as IntegrityReceipt);
  const byPath = new Map(records.map((record) => [record.path, record]));

  assert.equal(records.length, new Set(records.map((record) => record.path)).size, "Manifest paths are unique");
  for (const path of tracked) {
    const record = byPath.get(path);
    assert.ok(record, `Missing audit receipt: ${path}`);
    assert.equal(record.evidenceScope, evidenceScope, `Audit receipt scope is misleading or missing: ${path}`);
    assert.ok(record.finalStatus, `Audit receipt inventory status is missing: ${path}`);
    assert.deepEqual(record.reviewedRanges, [], `Integrity inventory must not claim semantic review ranges: ${path}`);
    if (path === manifestPath) assert.equal(record.hashPolicy, "SELF_REFERENTIAL_MANIFEST");
    else assertReceiptHash(path, record);
  }
  assert.equal(records.filter((record) => tracked.includes(record.path)).length, tracked.length, "Manifest has one receipt for every tracked path");
  console.log(`Phase 7.3.5 integrity inventory matches ${tracked.length}/${tracked.length} current tracked files; it is not semantic-review evidence.`);
}
