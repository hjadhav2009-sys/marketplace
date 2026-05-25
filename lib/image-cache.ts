import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { User } from "@prisma/client";

export const PRODUCT_CARD_IMAGE_SIZE = 600;
export const PRODUCT_CARD_IMAGE_QUALITY = 82;
export const IMAGE_CACHE_RETENTION_DAYS = 30;
export const IMAGE_CACHE_MAX_MB = 5000;
export const IMAGE_CACHE_DOWNLOAD_TIMEOUT_MS = 10_000;
export const IMAGE_CACHE_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const IMAGE_CACHE_MARKETPLACE = "meesho";
export const IMAGE_CACHE_CONFIRMATION = "DELETE IMAGE CACHE";
export const ALLOWED_CACHED_IMAGE_FILE_NAMES = new Set(["card.webp", "card.jpg", "card.jpeg", "card.png", "card.avif"]);

export type ImageCacheStatus = "CACHED" | "BROKEN" | "NOT_CACHED" | "RECHECK_NEEDED";

export type ProductImageCacheMeta = {
  marketplace: typeof IMAGE_CACHE_MARKETPLACE;
  accountId: string;
  sku: string;
  originalImageUrl: string | null;
  cachedAt: string | null;
  lastUsedAt: string | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  status: ImageCacheStatus;
  error?: string | null;
  contentType?: string | null;
  fileName?: string | null;
  filePath?: string | null;
};

export type CacheableSkuImage = {
  accountId?: string;
  sku?: string;
  imageUrl: string | null;
  cacheStatus?: string | null;
  cacheFilePath?: string | null;
  cacheOriginalImageUrl?: string | null;
  cacheCachedAt?: Date | string | null;
};

export type ImageCacheCleanupCandidate = {
  metaPath: string;
  imagePath: string | null;
  relativeFilePath: string | null;
  accountId: string;
  sku: string;
  lastUsedAt: Date;
  fileSizeBytes: number;
};

export type ProductImageCacheRoutePath = {
  marketplace: typeof IMAGE_CACHE_MARKETPLACE;
  accountId: string;
  safeSku: string;
  fileName: string;
  relativePath: string;
};

type SharpFactory = (input: Buffer) => {
  resize: (options: { width: number; height: number; fit: "cover" }) => {
    webp: (options: { quality: number }) => {
      toBuffer: (options: { resolveWithObject: true }) => Promise<{
        data: Buffer;
        info: { width?: number; height?: number; size?: number };
      }>;
    };
  };
};

function repoRoot(root = process.cwd()) {
  return root;
}

export function productImageCacheRoot(root = process.cwd()) {
  return path.join(repoRoot(root), "storage", "product-images");
}

function hashSegment(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

export function safeImageCacheSegment(value: string | null | undefined, fallback = "item") {
  const raw = String(value ?? "").trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  const base = cleaned || `${fallback}-${hashSegment(raw || fallback)}`;

  if (base.length <= 90 && base !== "." && base !== "..") {
    return base;
  }

  return `${base.slice(0, 76)}-${hashSegment(raw)}`;
}

export function productImageCacheRelativeDir(input: { accountId: string; sku: string; marketplace?: string }) {
  return [
    safeImageCacheSegment(input.marketplace ?? IMAGE_CACHE_MARKETPLACE, "marketplace"),
    safeImageCacheSegment(input.accountId, "account"),
    safeImageCacheSegment(input.sku, "sku")
  ].join("/");
}

export function productImageCacheDir(input: { accountId: string; sku: string; root?: string; marketplace?: string }) {
  return path.join(productImageCacheRoot(input.root), productImageCacheRelativeDir(input));
}

export function productImageCacheMetaPath(input: { accountId: string; sku: string; root?: string; marketplace?: string }) {
  return path.join(productImageCacheDir(input), "meta.json");
}

export function isAllowedCachedImageFileName(fileName: string) {
  return ALLOWED_CACHED_IMAGE_FILE_NAMES.has(fileName);
}

function isSafeRouteSegment(value: string | null | undefined) {
  return Boolean(value) && value !== "." && value !== ".." && !value?.includes("/") && !value?.includes("\\");
}

export function parseProductImageCacheRoutePath(pathSegments: string[] | undefined | null): ProductImageCacheRoutePath | null {
  if (!pathSegments || pathSegments.length !== 4) {
    return null;
  }

  const [marketplace, accountId, safeSku, fileName] = pathSegments;

  if (
    marketplace !== IMAGE_CACHE_MARKETPLACE ||
    !isSafeRouteSegment(accountId) ||
    !isSafeRouteSegment(safeSku) ||
    !isAllowedCachedImageFileName(fileName)
  ) {
    return null;
  }

  return {
    marketplace,
    accountId,
    safeSku,
    fileName,
    relativePath: pathSegments.join("/")
  };
}

export function canUserAccessCachedImage(user: Pick<User, "role" | "accountId"> | null | undefined, accountId: string) {
  if (!user) {
    return false;
  }

  return user.role === "OWNER" || user.accountId === accountId;
}

export async function readImageCacheMeta(input: { accountId: string; sku: string; root?: string; marketplace?: string }) {
  const metaPath = productImageCacheMetaPath(input);

  try {
    return normalizeImageCacheMeta(JSON.parse(await readFile(metaPath, "utf8")));
  } catch {
    return null;
  }
}

export async function writeImageCacheMeta(input: {
  accountId: string;
  sku: string;
  meta: ProductImageCacheMeta;
  root?: string;
  marketplace?: string;
}) {
  const dir = productImageCacheDir(input);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.json"), `${JSON.stringify(input.meta, null, 2)}\n`, "utf8");
}

export function cachedProductImageUrl(mapping: CacheableSkuImage) {
  if (
    mapping.cacheStatus !== "CACHED" ||
    !mapping.cacheFilePath ||
    !mapping.imageUrl ||
    mapping.cacheOriginalImageUrl !== mapping.imageUrl
  ) {
    return null;
  }

  const versionSource = mapping.cacheCachedAt ? new Date(mapping.cacheCachedAt).getTime() : Date.now();
  const segments = mapping.cacheFilePath.replace(/\\/g, "/").split("/").filter(Boolean).map(encodeURIComponent);
  return `/product-images/${segments.join("/")}?v=${Number.isFinite(versionSource) ? versionSource : Date.now()}`;
}

export function imageCacheNeedsRefresh(mapping: CacheableSkuImage) {
  if (!mapping.imageUrl) {
    return false;
  }

  return (
    mapping.cacheStatus !== "CACHED" ||
    !mapping.cacheFilePath ||
    mapping.cacheOriginalImageUrl !== mapping.imageUrl
  );
}

export function isImageCacheCleanupConfirmationValid(value: unknown) {
  return String(value ?? "").trim() === IMAGE_CACHE_CONFIRMATION;
}

function normalizeImageCacheMeta(value: unknown): ProductImageCacheMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Partial<ProductImageCacheMeta>;
  const status = input.status;

  if (status !== "CACHED" && status !== "BROKEN" && status !== "NOT_CACHED" && status !== "RECHECK_NEEDED") {
    return null;
  }

  return {
    marketplace: IMAGE_CACHE_MARKETPLACE,
    accountId: String(input.accountId ?? ""),
    sku: String(input.sku ?? ""),
    originalImageUrl: input.originalImageUrl ?? null,
    cachedAt: input.cachedAt ?? null,
    lastUsedAt: input.lastUsedAt ?? null,
    width: typeof input.width === "number" ? input.width : null,
    height: typeof input.height === "number" ? input.height : null,
    fileSizeBytes: typeof input.fileSizeBytes === "number" ? input.fileSizeBytes : 0,
    status,
    error: input.error ?? null,
    contentType: input.contentType ?? null,
    fileName: input.fileName ?? null,
    filePath: input.filePath ?? null
  };
}

function inferContentType(url: string, responseContentType: string | null) {
  const headerType = responseContentType?.split(";")[0]?.trim().toLowerCase();

  if (headerType?.startsWith("image/")) {
    return headerType;
  }

  const pathname = new URL(url).pathname.toLowerCase();

  if (pathname.endsWith(".webp")) {
    return "image/webp";
  }

  if (pathname.endsWith(".png")) {
    return "image/png";
  }

  if (pathname.endsWith(".avif")) {
    return "image/avif";
  }

  return "image/jpeg";
}

export function cardFileNameForContentType(contentType: string) {
  if (contentType === "image/webp") {
    return "card.webp";
  }

  if (contentType === "image/png") {
    return "card.png";
  }

  if (contentType === "image/avif") {
    return "card.avif";
  }

  return "card.jpg";
}

async function downloadImage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_CACHE_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5"
      }
    });

    if (!response.ok) {
      throw new Error(`Image download failed with HTTP ${response.status}.`);
    }

    const contentLength = Number(response.headers.get("content-length"));

    if (Number.isFinite(contentLength) && contentLength > IMAGE_CACHE_MAX_SOURCE_BYTES) {
      throw new Error(`Source image is larger than ${Math.round(IMAGE_CACHE_MAX_SOURCE_BYTES / 1024 / 1024)} MB.`);
    }

    const contentType = inferContentType(url, response.headers.get("content-type"));

    if (!contentType.startsWith("image/")) {
      throw new Error("URL did not return an image.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > IMAGE_CACHE_MAX_SOURCE_BYTES) {
      throw new Error(`Source image is larger than ${Math.round(IMAGE_CACHE_MAX_SOURCE_BYTES / 1024 / 1024)} MB.`);
    }

    return { buffer, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadSharp() {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<{ default?: SharpFactory }>;
    const mod = await dynamicImport("sharp");
    return typeof mod.default === "function" ? mod.default : null;
  } catch {
    return null;
  }
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function jpegDimensions(buffer: Buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);

    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + length;
  }

  return null;
}

export function imageDimensions(buffer: Buffer, contentType: string) {
  if (contentType === "image/png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (contentType === "image/jpeg") {
    return jpegDimensions(buffer);
  }

  if (contentType === "image/webp" && buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const chunk = buffer.toString("ascii", 12, 16);

    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: readUInt24LE(buffer, 24) + 1,
        height: readUInt24LE(buffer, 27) + 1
      };
    }

    if (chunk === "VP8 " && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff
      };
    }
  }

  return null;
}

async function makeCardImage(downloaded: { buffer: Buffer; contentType: string }) {
  const sharp = await loadSharp();

  if (sharp) {
    try {
      const output = await sharp(downloaded.buffer)
        .resize({ width: PRODUCT_CARD_IMAGE_SIZE, height: PRODUCT_CARD_IMAGE_SIZE, fit: "cover" })
        .webp({ quality: PRODUCT_CARD_IMAGE_QUALITY })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: output.data,
        contentType: "image/webp",
        fileName: "card.webp",
        width: output.info.width ?? PRODUCT_CARD_IMAGE_SIZE,
        height: output.info.height ?? PRODUCT_CARD_IMAGE_SIZE,
        conversionError: null as string | null
      };
    } catch (error) {
      const dimensions = imageDimensions(downloaded.buffer, downloaded.contentType);
      return {
        buffer: downloaded.buffer,
        contentType: downloaded.contentType,
        fileName: cardFileNameForContentType(downloaded.contentType),
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        conversionError: error instanceof Error ? `Image conversion failed; cached original. ${error.message}` : "Image conversion failed; cached original."
      };
    }
  }

  const dimensions = imageDimensions(downloaded.buffer, downloaded.contentType);

  return {
    buffer: downloaded.buffer,
    contentType: downloaded.contentType,
    fileName: cardFileNameForContentType(downloaded.contentType),
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    conversionError: "Image conversion unavailable; cached original."
  };
}

async function removeOldCardFiles(dir: string) {
  if (!existsSync(dir)) {
    return;
  }

  const entries = await readdir(dir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("card."))
      .map((entry) => rm(path.join(dir, entry.name), { force: true }))
  );
}

export async function cacheProductCardImage(input: {
  accountId: string;
  sku: string;
  originalImageUrl: string;
  root?: string;
}) {
  const now = new Date();
  const dir = productImageCacheDir(input);
  const relativeDir = productImageCacheRelativeDir(input);

  await mkdir(dir, { recursive: true });

  try {
    const downloaded = await downloadImage(input.originalImageUrl);
    const card = await makeCardImage(downloaded);
    await removeOldCardFiles(dir);

    const filePath = path.join(dir, card.fileName);
    await writeFile(filePath, card.buffer);
    const fileStat = await stat(filePath);
    const relativeFilePath = `${relativeDir}/${card.fileName}`;
    const meta: ProductImageCacheMeta = {
      marketplace: IMAGE_CACHE_MARKETPLACE,
      accountId: input.accountId,
      sku: input.sku,
      originalImageUrl: input.originalImageUrl,
      cachedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      width: card.width,
      height: card.height,
      fileSizeBytes: fileStat.size,
      status: "CACHED",
      error: card.conversionError,
      contentType: card.contentType,
      fileName: card.fileName,
      filePath: relativeFilePath
    };

    await writeImageCacheMeta({ ...input, meta });
    return meta;
  } catch (error) {
    const meta: ProductImageCacheMeta = {
      marketplace: IMAGE_CACHE_MARKETPLACE,
      accountId: input.accountId,
      sku: input.sku,
      originalImageUrl: input.originalImageUrl,
      cachedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      width: null,
      height: null,
      fileSizeBytes: 0,
      status: "BROKEN",
      error: error instanceof Error ? error.message : "Image cache failed.",
      contentType: null,
      fileName: null,
      filePath: null
    };

    await writeImageCacheMeta({ ...input, meta });
    return meta;
  }
}

export function absoluteCachedImagePath(relativePath: string, root = process.cwd()) {
  const cacheRoot = productImageCacheRoot(root);
  const resolved = path.resolve(cacheRoot, relativePath);
  const resolvedRoot = path.resolve(cacheRoot);

  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }

  return resolved;
}

function fallbackContentTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".webp") {
    return "image/webp";
  }

  if (ext === ".png") {
    return "image/png";
  }

  if (ext === ".avif") {
    return "image/avif";
  }

  return "image/jpeg";
}

export async function contentTypeForCachedImage(filePath: string) {
  const metaPath = path.join(path.dirname(filePath), "meta.json");

  try {
    const meta = normalizeImageCacheMeta(JSON.parse(await readFile(metaPath, "utf8")));

    if (meta?.contentType) {
      return meta.contentType;
    }
  } catch {
    // The file can still be served safely by extension if the sidecar is missing.
  }

  return fallbackContentTypeFromPath(filePath);
}

function cacheCutoff(now = new Date()) {
  return new Date(now.getTime() - IMAGE_CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

async function walkMetaFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return walkMetaFiles(entryPath);
      }

      return entry.isFile() && entry.name === "meta.json" ? [entryPath] : [];
    })
  );

  return nested.flat();
}

function dateFromMeta(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function findImageCacheCleanupCandidates(root = process.cwd(), now = new Date()) {
  const cutoff = cacheCutoff(now);
  const metaPaths = await walkMetaFiles(productImageCacheRoot(root));
  const candidates: ImageCacheCleanupCandidate[] = [];

  for (const metaPath of metaPaths) {
    let meta: ProductImageCacheMeta | null = null;

    try {
      meta = normalizeImageCacheMeta(JSON.parse(await readFile(metaPath, "utf8")));
    } catch {
      meta = null;
    }

    if (!meta || meta.status !== "CACHED") {
      continue;
    }

    const lastUsedAt = dateFromMeta(meta.lastUsedAt) ?? dateFromMeta(meta.cachedAt) ?? new Date(0);

    if (lastUsedAt >= cutoff) {
      continue;
    }

    const imagePath = meta.filePath ? absoluteCachedImagePath(meta.filePath, root) : null;
    const fileSizeBytes = imagePath && existsSync(imagePath) ? (await stat(imagePath)).size : meta.fileSizeBytes;

    candidates.push({
      metaPath,
      imagePath,
      relativeFilePath: meta.filePath ?? null,
      accountId: meta.accountId,
      sku: meta.sku,
      lastUsedAt,
      fileSizeBytes
    });
  }

  return candidates;
}

async function removeEmptyParents(startDir: string, stopDir: string) {
  let current = startDir;
  const resolvedStop = path.resolve(stopDir);

  while (path.resolve(current).startsWith(resolvedStop) && path.resolve(current) !== resolvedStop) {
    try {
      await rm(current, { recursive: false });
    } catch {
      return;
    }

    current = path.dirname(current);
  }
}

export async function deleteImageCacheCandidates(candidates: ImageCacheCleanupCandidate[], root = process.cwd()) {
  const cacheRoot = productImageCacheRoot(root);

  for (const candidate of candidates) {
    if (candidate.imagePath) {
      await rm(candidate.imagePath, { force: true });
    }

    await rm(candidate.metaPath, { force: true });
    await removeEmptyParents(path.dirname(candidate.metaPath), cacheRoot);
  }

  return {
    count: candidates.length,
    fileSizeBytes: candidates.reduce((sum, candidate) => sum + candidate.fileSizeBytes, 0),
    relativeFilePaths: candidates.flatMap((candidate) => (candidate.relativeFilePath ? [candidate.relativeFilePath] : []))
  };
}

export function bytesToMegabytes(bytes: number) {
  return bytes / 1024 / 1024;
}
