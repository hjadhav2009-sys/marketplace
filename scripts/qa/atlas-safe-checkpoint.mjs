import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

const TRANSIENT_WINDOWS_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function appendJournal(journalPath, entry) {
  const handle = await open(journalPath, "a");
  try {
    await handle.writeFile(`${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function retryTransient(operation, {
  attempts = 7,
  initialDelayMs = 20,
  maximumDelayMs = 640,
  onAttempt,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await onAttempt?.(attempt);
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!TRANSIENT_WINDOWS_CODES.has(error?.code) || attempt === attempts) throw error;
      await delay(Math.min(maximumDelayMs, initialDelayMs * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

async function writeAndSync(filePath, bytes) {
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function verifyFile(filePath, expectedHash) {
  const actual = sha256Bytes(await readFile(filePath));
  if (actual !== expectedHash) throw new Error(`Checkpoint hash mismatch for ${filePath}.`);
}

export async function readSafeCheckpoint(destination, fallback = null) {
  const journalPath = `${destination}.journal.jsonl`;
  const candidates = [];
  if (await exists(destination)) candidates.push(destination);
  if (await exists(journalPath)) {
    const lines = String(await readFile(journalPath, "utf8")).split(/\r?\n/).filter(Boolean);
    for (const line of lines.reverse()) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.phase === "COMMITTED" && typeof entry.versionPath === "string" && typeof entry.sha256 === "string") {
        candidates.push(entry.versionPath);
      }
    }
  }
  for (const candidate of [...new Set(candidates)]) {
    try {
      const bytes = await readFile(candidate);
      return JSON.parse(String(bytes));
    } catch {}
  }
  return fallback;
}

export async function writeSafeCheckpoint(destination, value, options = {}) {
  const directory = path.dirname(destination);
  const base = path.basename(destination);
  const versionsDirectory = path.join(directory, `${base}.versions`);
  const journalPath = `${destination}.journal.jsonl`;
  await mkdir(versionsDirectory, { recursive: true });

  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const hash = sha256Bytes(bytes);
  const token = `${Date.now()}-${process.pid}-${randomUUID()}`;
  const temporaryPath = path.join(directory, `.${base}.${token}.tmp`);
  const versionPath = path.join(versionsDirectory, `${token}-${hash}.json`);

  await appendJournal(journalPath, { phase: "PREPARE", temporaryPath, versionPath, destination, sha256: hash });
  await writeAndSync(temporaryPath, bytes);
  await options.onPhase?.("TEMP_SYNCED", { temporaryPath, versionPath, destination, sha256: hash });

  await retryTransient(
    () => rename(temporaryPath, versionPath),
    { ...options.retry, onAttempt: options.onRenameAttempt },
  );
  await verifyFile(versionPath, hash);
  await appendJournal(journalPath, { phase: "COMMITTED", versionPath, destination, sha256: hash });
  await options.onPhase?.("VERSION_COMMITTED", { versionPath, destination, sha256: hash });

  let materialized = false;
  try {
    await retryTransient(async () => {
      const materializedTemp = path.join(directory, `.${base}.${token}.materialize.tmp`);
      await rm(materializedTemp, { force: true });
      await copyFile(versionPath, materializedTemp, fsConstants.COPYFILE_EXCL);
      const handle = await open(materializedTemp, "r");
      try { await handle.sync(); } finally { await handle.close(); }
      try {
        await rename(materializedTemp, destination);
      } catch (error) {
        if (error?.code === "EEXIST" || error?.code === "EPERM" || error?.code === "EACCES") {
          await rm(destination, { force: true });
          await rename(materializedTemp, destination);
        } else {
          throw error;
        }
      }
    }, { ...options.retry, onAttempt: options.onReplaceAttempt });
    await verifyFile(destination, hash);
    materialized = true;
  } catch (error) {
    if (!TRANSIENT_WINDOWS_CODES.has(error?.code)) throw error;
  }

  await appendJournal(journalPath, {
    phase: materialized ? "MATERIALIZED" : "MATERIALIZATION_DEFERRED",
    versionPath,
    destination,
    sha256: hash,
  });
  return { destination, versionPath, journalPath, sha256: hash, materialized };
}

export async function cleanupStaleCheckpointTemps(destination, {
  olderThanMs = 24 * 60 * 60_000,
  now = Date.now(),
} = {}) {
  const directory = path.dirname(destination);
  const prefix = `.${path.basename(destination)}.`;
  const removed = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(prefix) || !entry.name.endsWith(".tmp")) continue;
    const absolute = path.join(directory, entry.name);
    const info = await stat(absolute);
    if (now - info.mtimeMs < olderThanMs) continue;
    await rm(absolute, { force: true });
    removed.push(absolute);
  }
  return removed;
}

async function exists(filePath) {
  try { await stat(filePath); return true; } catch { return false; }
}

export const checkpointInternals = {
  TRANSIENT_WINDOWS_CODES,
  retryTransient,
};
