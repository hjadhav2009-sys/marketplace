import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const CONSIGNMENT_CSV_MAX_BYTES = Number(process.env.CONSIGNMENT_CSV_MAX_BYTES ?? 20 * 1024 * 1024);
export const CONSIGNMENT_ZIP_MAX_BYTES = Number(process.env.CONSIGNMENT_ZIP_MAX_BYTES ?? 50 * 1024 * 1024);
export const CONSIGNMENT_ZIP_MAX_EXTRACTED_BYTES = Number(process.env.CONSIGNMENT_ZIP_MAX_EXTRACTED_BYTES ?? 100 * 1024 * 1024);
export const CONSIGNMENT_ZIP_MAX_ENTRIES = Number(process.env.CONSIGNMENT_ZIP_MAX_ENTRIES ?? 100);
export const CONSIGNMENT_ZIP_MAX_ENTRY_NAME = 240;

const ALLOWED = new Set([".csv", ".tsv", ".zip", ".txt", ".xlsx", ".xlsm"]);
const BLOCKED = new Set([".exe", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jse", ".msi", ".scr", ".dll", ".lnk", ".reg", ".apk", ".aab"]);

export function consignmentStorageRoot() {
  return path.resolve(process.env.CONSIGNMENT_IMPORT_ROOT ?? path.join(process.cwd(), "storage", "consignment-imports"));
}

export function sanitizeConsignmentFileName(value: string) {
  const safe = path.basename(value.normalize("NFKC")).replace(/[^a-zA-Z0-9._ -]+/g, "_").replace(/\s+/g, " ").trim();
  return (safe || "consignment-file").slice(0, 160);
}

export function validateConsignmentUpload(file: Pick<File, "name" | "size">) {
  const extension = path.extname(file.name).toLowerCase();
  if (!file.size) throw new Error("Consignment file is empty.");
  if (!ALLOWED.has(extension) || BLOCKED.has(extension)) throw new Error("Upload a CSV, TSV, TXT, XLSX, XLSM, or ZIP file.");
  const limit = extension === ".zip" ? CONSIGNMENT_ZIP_MAX_BYTES : CONSIGNMENT_CSV_MAX_BYTES;
  if (file.size > limit) throw new Error(`Consignment ${extension.slice(1).toUpperCase()} exceeds the configured upload limit.`);
  return extension;
}

export function validateArchiveEntryName(value: string) {
  const normalized = value.normalize("NFKC").replace(/\\/g, "/");
  if (!normalized || normalized.length > CONSIGNMENT_ZIP_MAX_ENTRY_NAME || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.split("/").some((part) => part === ".." || part === ".")) throw new Error("ZIP contains an unsafe entry path.");
  const extension = path.extname(normalized).toLowerCase();
  if (BLOCKED.has(extension) || extension === ".zip" || !new Set([".csv", ".txt"]).has(extension)) throw new Error("ZIP contains a blocked or unsupported entry.");
  return normalized;
}

export function resolveConsignmentManagedPath(relativePath: string) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) throw new Error("Invalid consignment storage path.");
  const root = consignmentStorageRoot();
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Consignment path escapes managed storage.");
  return resolved;
}

export async function storeConsignmentBuffer(input: { batchId: string; area: "source" | "supporting"; originalName: string; data: Uint8Array }) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(input.batchId)) throw new Error("Invalid consignment batch identifier.");
  const safeName = sanitizeConsignmentFileName(input.originalName);
  const extension = path.extname(safeName).toLowerCase();
  const directory = path.join(consignmentStorageRoot(), input.batchId, input.area);
  const managedName = `${randomUUID()}${extension}`;
  const destination = path.join(directory, managedName);
  const partial = `${destination}.partial`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(partial, input.data, { flag: "wx" });
    await rename(partial, destination);
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined);
    throw error;
  }
  return {
    originalFileName: safeName,
    managedRelativePath: path.relative(consignmentStorageRoot(), destination).split(path.sep).join("/"),
    fileSizeBytes: input.data.byteLength,
    sha256: createHash("sha256").update(input.data).digest("hex")
  };
}

export async function resolveExistingConsignmentPath(relativePath: string) {
  const root = consignmentStorageRoot();
  const candidate = resolveConsignmentManagedPath(relativePath);
  await access(candidate);
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${path.sep}`)) throw new Error("Consignment file symlink escapes storage.");
  return realCandidate;
}

export async function openConsignmentReadStream(relativePath: string) {
  return createReadStream(await resolveExistingConsignmentPath(relativePath));
}

export async function removeConsignmentBatchFiles(batchId: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(batchId)) throw new Error("Invalid consignment batch identifier.");
  await rm(path.join(consignmentStorageRoot(), batchId), { recursive: true, force: true });
}
