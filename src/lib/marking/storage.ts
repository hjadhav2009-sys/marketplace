import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttachmentType } from "@prisma/client";

export const MARKING_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const MARKING_ASSET_MAX_FILES = 50;

const BLOCKED_EXTENSIONS = new Set([".exe", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jse", ".msi", ".scr", ".dll", ".lnk", ".reg"]);
const ALLOWED_BY_TYPE: Record<AttachmentType, Set<string>> = {
  MARKING_FILE: new Set([".ezd", ".dxf", ".svg", ".ai", ".cdr", ".plt", ".hpgl", ".gcode", ".nc", ".pdf", ".zip"]),
  MARKING_PREVIEW: new Set([".png", ".jpg", ".jpeg", ".webp"]),
  MARKING_REPORT: new Set([".pdf", ".txt", ".csv"]),
  ASSEMBLY_GUIDE: new Set([".pdf", ".txt"]),
  ASSEMBLY_IMAGE: new Set([".png", ".jpg", ".jpeg", ".webp"]),
  OTHER: new Set([".pdf", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".webp", ".zip"])
};

export function getMarkingStorageRoot() {
  return path.resolve(process.env.MARKING_LIBRARY_ROOT ?? path.join(process.cwd(), "storage", "marking-library"));
}

export function buildMarkingAssetDirectory(markingAssetId: string, fileId: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(markingAssetId) || !/^[a-zA-Z0-9_-]{8,80}$/.test(fileId)) throw new Error("Invalid managed file identifier.");
  return path.join(getMarkingStorageRoot(), markingAssetId, fileId);
}

export function sanitizeMarkingFileName(value: string) {
  const base = path.basename(value.normalize("NFKC")).replace(/[^a-zA-Z0-9._ -]+/g, "_").replace(/\s+/g, " ").trim();
  return (base || "marking-file").slice(0, 120);
}

export function resolveManagedMarkingPath(relativePath: string) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) throw new Error("Invalid managed marking path.");
  const root = getMarkingStorageRoot();
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Managed marking path escapes storage root.");
  return resolved;
}

export function calculateSha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

export function validateMarkingFileMetadata(input: { name: string; size: number; attachmentType: AttachmentType }) {
  const extension = path.extname(input.name).toLowerCase();
  if (input.size <= 0) throw new Error("Marking file is empty.");
  if (input.size > MARKING_FILE_MAX_BYTES) throw new Error("Marking file exceeds the 50 MB limit.");
  if (BLOCKED_EXTENSIONS.has(extension)) throw new Error("Executable and script files are not allowed.");
  if (!ALLOWED_BY_TYPE[input.attachmentType].has(extension)) throw new Error(`File type ${extension || "unknown"} is not allowed for ${input.attachmentType}.`);
  return extension;
}

export async function writeMarkingAssetFile(input: { markingAssetId: string; fileId?: string; file: File; attachmentType: AttachmentType }) {
  const fileId = input.fileId ?? randomUUID();
  const extension = validateMarkingFileMetadata({ name: input.file.name, size: input.file.size, attachmentType: input.attachmentType });
  const data = new Uint8Array(await input.file.arrayBuffer());
  if (data.byteLength !== input.file.size) throw new Error("Uploaded file size changed while reading.");

  const directory = buildMarkingAssetDirectory(input.markingAssetId, fileId);
  const managedName = `${randomUUID()}${extension}`;
  const finalPath = path.join(directory, managedName);
  const tempPath = `${finalPath}.partial`;
  await mkdir(directory, { recursive: true });

  try {
    await writeFile(tempPath, data, { flag: "wx" });
    await rename(tempPath, finalPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    managedRelativePath: path.relative(getMarkingStorageRoot(), finalPath).split(path.sep).join("/"),
    originalFileName: sanitizeMarkingFileName(input.file.name),
    fileExtension: extension,
    fileSizeBytes: data.byteLength,
    sha256: calculateSha256(data),
    contentType: safeMarkingContentType(input.file.type, extension)
  };
}

export async function resolveExistingManagedMarkingPath(relativePath: string) {
  const root = getMarkingStorageRoot();
  const candidate = resolveManagedMarkingPath(relativePath);
  await access(candidate);
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${path.sep}`)) throw new Error("Managed file symlink escapes storage root.");
  return realCandidate;
}

export async function openMarkingAssetReadStream(relativePath: string) {
  return createReadStream(await resolveExistingManagedMarkingPath(relativePath));
}

export async function removeFailedManagedMarkingFile(relativePath: string) {
  const target = resolveManagedMarkingPath(relativePath);
  await rm(target, { force: true });
}

export async function deleteTemporaryUpload(relativePath: string) {
  const tempRoot = path.resolve(process.cwd(), "storage", "marking-temp");
  const target = path.resolve(tempRoot, relativePath);
  if (target !== tempRoot && !target.startsWith(`${tempRoot}${path.sep}`)) throw new Error("Temporary path escapes storage root.");
  await rm(target, { force: true });
}

export function safeMarkingContentType(contentType: string, extension: string) {
  const known: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".zip": "application/zip" };
  return known[extension] ?? (contentType.startsWith("application/") ? contentType.slice(0, 100) : "application/octet-stream");
}
