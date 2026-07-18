import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";

const output = "docs/audits/phase-7-3-5-file-review-manifest.jsonl";
const evidenceScope = "FILE_INTEGRITY_INVENTORY_NOT_SEMANTIC_REVIEW";
const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter((path) => Boolean(path) && existsSync(path))
  .sort();
if (!listed.includes(output)) listed.push(output);

const generated = /^(?:package-lock\.json|docs\/history\/)/;
const binary = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|7z|gz|tar|woff2?|ttf|otf|xlsx?|xlsm|docx?|pptx?|mp4|webm|mp3|wav)$/i;
const security = /(?:auth|security|password|session|permission|api|middleware|upload|import|prisma|migration)/i;
const mutation = /(?:action|service|store|workflow|import|merge|account|prisma|migration|script)/i;
const records = listed.sort().map((path) => {
  if (path === output) {
    return {
      path,
      sha256: null,
      hashPolicy: "SELF_REFERENTIAL_MANIFEST",
      evidenceScope,
      type: "jsonl",
      bytes: 0,
      lines: 0,
      inventoryRanges: [],
      reviewedRanges: [],
      inventoryPasses: ["PATH_INVENTORY"],
      reviewPasses: [],
      findingIds: [],
      securitySensitive: false,
      mutationSensitive: false,
      finalStatus: "SELF_REFERENTIAL_INVENTORY_RECORD"
    };
  }
  const body = readFileSync(path);
  const isBinary = binary.test(path);
  const text = isBinary ? null : body.toString("utf8").replace(/\r\n/g, "\n");
  const hashBody = text === null ? body : Buffer.from(text, "utf8");
  const lines = text === null ? 0 : (text.match(/\n/g)?.length ?? 0) + (text.length ? 1 : 0);
  const inventoryRanges = [];
  for (let start = 1; start <= lines; start += 500) inventoryRanges.push(`${start}-${Math.min(lines, start + 499)}`);
  const type = extname(path).slice(1).toLowerCase() || "text";
  const isGenerated = generated.test(path);
  return {
    path,
    sha256: createHash("sha256").update(hashBody).digest("hex"),
    hashPolicy: isBinary ? "RAW_BYTES" : "LF_NORMALIZED_TEXT",
    evidenceScope,
    type,
    bytes: hashBody.length,
    lines,
    inventoryRanges,
    reviewedRanges: [],
    inventoryPasses: isBinary ? ["PATH_INVENTORY", "CONTENT_HASH"] : ["PATH_INVENTORY", "CONTENT_HASH", "LINE_RANGE_INVENTORY"],
    reviewPasses: [],
    findingIds: [],
    securitySensitive: security.test(path),
    mutationSensitive: mutation.test(path),
    finalStatus: isBinary ? "NON_EXECUTABLE_ASSET_INVENTORIED" : isGenerated ? "GENERATED_FILE_INVENTORIED" : "INTEGRITY_INVENTORIED"
  };
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
console.log(JSON.stringify({ trackedAndUntrackedFiles: records.length, integrityInventoried: records.length, evidenceScope, output }, null, 2));
