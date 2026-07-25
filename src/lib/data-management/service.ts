import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { clearSecurityAttempt, consumeSecurityAttempt } from "@/lib/security-throttle";
import { IMPORT_JOB_STORAGE_DIR, retainedImportJobArtifactPath } from "@/src/lib/import-jobs/runner";
import { consignmentStorageRoot } from "@/src/lib/consignments/storage";

type Client = PrismaClient | Prisma.TransactionClient;

export const DATA_ACTION_KINDS = [
  "QUARANTINE_IMPORT_JOB_FILE",
  "QUARANTINE_IMPORT_SOURCE_FILE",
  "QUARANTINE_GENERATED_REPORTS",
  "QUARANTINE_CONSIGNMENT_FILE",
  "CLEAR_IMAGE_CACHE",
  "ARCHIVE_LISTING",
  "DELETE_UNREFERENCED_LISTING",
  "PURGE_QA_OPERATIONAL_DATA",
  "RESTORE_QUARANTINED_FILES",
  "PURGE_QUARANTINED_FILES"
] as const;

export type DataActionKind = typeof DATA_ACTION_KINDS[number];
export type DataActionScope = {
  accountId?: string;
  importJobId?: string;
  consignmentFileId?: string;
  listingId?: string;
  deletionJobId?: string;
};

type Preview = {
  actionKind: DataActionKind;
  accountId: string | null;
  scope: DataActionScope;
  scopeFingerprint: string;
  typedPhrase: string;
  blockers: string[];
  counts: Record<string, number>;
  bytes: number;
  warnings: string[];
};

type StoredFile = {
  storageKind: "IMPORT_JOB" | "CONSIGNMENT" | "IMAGE_CACHE";
  sourceRelativePath: string;
  quarantineRelativePath: string;
  size: number;
  sha256?: string;
  recordId?: string;
  recordMetadata?: Record<string, string | number | boolean | null>;
};

const ACTIVE_IMPORT_STATES = new Set(["QUEUED", "RUNNING", "PARSING", "MERGING", "NEEDS_MAPPING", "AWAITING_FILE_ROLES"]);
const GRANT_TTL_MS = 5 * 60 * 1000;
const QUARANTINE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const PRIVATE_ROOT = path.resolve(process.env.DATA_QUARANTINE_ROOT ?? path.join(process.cwd(), "storage", "data-quarantine"));

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}
const stableJson = (value: unknown) => JSON.stringify(canonical(value));
const scopeFingerprint = (kind: DataActionKind, scope: DataActionScope) => digest(`${kind}\0${stableJson(scope)}`);
const tokenHash = (token: string) => digest(`owner-action\0${token}`);

function assertBounded(value: string, label: string, max: number) {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function assertRequestId(value: string) {
  if (!REQUEST_ID.test(value)) throw new Error("Client request ID is invalid.");
  return value;
}

async function requireActiveOwner(actorUserId: string, client: Client = prisma) {
  const actor = await client.user.findUnique({ where: { id: actorUserId } });
  if (!actor?.active || actor.role !== "OWNER") throw new Error("Owner authorization is required.");
  if (actor.lockedUntil && actor.lockedUntil > new Date()) throw new Error("Owner reauthentication is temporarily unavailable.");
  return actor;
}

function phraseFor(kind: DataActionKind, scope: DataActionScope) {
  const suffix = scope.importJobId ?? scope.consignmentFileId ?? scope.listingId ?? scope.deletionJobId ?? scope.accountId ?? "SELECTED";
  const verb = kind === "RESTORE_QUARANTINED_FILES" ? "RESTORE"
    : kind === "PURGE_QUARANTINED_FILES" ? "PERMANENTLY PURGE"
    : kind === "ARCHIVE_LISTING" ? "ARCHIVE"
    : kind === "DELETE_UNREFERENCED_LISTING" ? "DELETE"
    : kind === "PURGE_QA_OPERATIONAL_DATA" ? "PURGE QA DATA"
    : "QUARANTINE";
  return `${verb} ${suffix}`;
}

export async function createOwnerActionGrant(input: {
  actorUserId: string;
  sessionId: string;
  actionKind: DataActionKind;
  scopeFingerprint: string;
  password: string;
}) {
  const sessionId = assertBounded(input.sessionId, "Session", 128);
  const actor = await requireActiveOwner(input.actorUserId);
  const throttleIdentity = `${actor.id}:${sessionId}`;
  const attempt = await consumeSecurityAttempt({
    scope: "owner-data-reauth",
    identity: throttleIdentity,
    limit: 5,
    windowMs: 15 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  });
  if (!attempt.allowed) throw new Error("Owner reauthentication is temporarily unavailable.");
  if (!verifyPassword(input.password, actor.passwordHash)) {
    throw new Error("Owner reauthentication failed.");
  }
  await clearSecurityAttempt("owner-data-reauth", throttleIdentity);
  await prisma.ownerActionGrant.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        { usedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
      ]
    }
  });
  const rawToken = randomBytes(32).toString("base64url");
  await prisma.ownerActionGrant.create({
    data: {
      userId: actor.id,
      sessionId,
      actionKind: input.actionKind,
      scopeFingerprint: input.scopeFingerprint,
      tokenHash: tokenHash(rawToken),
      expiresAt: new Date(Date.now() + GRANT_TTL_MS)
    }
  });
  return rawToken;
}

export async function consumeOwnerActionGrant(input: {
  actorUserId: string;
  sessionId: string;
  actionKind: DataActionKind;
  scopeFingerprint: string;
  token: string;
}, client: Client = prisma) {
  await requireActiveOwner(input.actorUserId, client);
  const consumed = await client.ownerActionGrant.updateMany({
    where: {
      userId: input.actorUserId,
      sessionId: input.sessionId,
      actionKind: input.actionKind,
      scopeFingerprint: input.scopeFingerprint,
      tokenHash: tokenHash(input.token),
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    data: { usedAt: new Date() }
  });
  if (consumed.count !== 1) throw new Error("The owner authorization expired, was already used, or does not match this action.");
}

export async function findCompletedDataActionReplay(input: {
  actorUserId: string;
  actionKind: DataActionKind;
  clientRequestId: string;
  scope: DataActionScope;
}) {
  await requireActiveOwner(input.actorUserId);
  assertRequestId(input.clientRequestId);
  const prior = await prisma.dataDeletionJob.findFirst({
    where: { actorUserId: input.actorUserId, actionKind: input.actionKind, clientRequestId: input.clientRequestId }
  });
  if (!prior || !["COMPLETED", "RESTORED", "PURGED", "FAILED_RESTORED"].includes(prior.state)) return null;
  const storedScope = JSON.parse(prior.scopeJson) as DataActionScope;
  if (Object.entries(input.scope).filter(([, value]) => value).some(([key, value]) => storedScope[key as keyof DataActionScope] !== value)) {
    throw new Error("This request ID was already used with different data.");
  }
  return prior;
}

async function accountCounts(accountId: string) {
  const [
    orders, workTasks, consignments, listings, imports, uploads, activeImports, activeWorkTasks, retainedImportArtifacts, retainedConsignmentFiles
  ] = await prisma.$transaction([
    prisma.order.count({ where: { accountId } }),
    prisma.workTask.count({ where: { accountId } }),
    prisma.consignmentBatch.count({ where: { accountId } }),
    prisma.marketplaceListing.count({ where: { accountId } }),
    prisma.importJob.count({ where: { accountId } }),
    prisma.uploadBatch.count({ where: { accountId } }),
    prisma.importJob.count({ where: { accountId, status: { in: [...ACTIVE_IMPORT_STATES] } } }),
    prisma.workTask.count({ where: { accountId, status: { in: ["LOCKED", "READY", "IN_PROGRESS", "PROBLEM"] } } }),
    prisma.importJob.count({ where: { accountId, filePath: { not: null } } }),
    prisma.consignmentImportFile.count({ where: { consignmentBatch: { accountId }, managedRelativePath: { not: null } } })
  ]);
  return { orders, workTasks, consignments, listings, imports, uploads, activeImports, activeWorkTasks, retainedImportArtifacts, retainedConsignmentFiles };
}

export async function previewDataAction(actorUserId: string, actionKind: DataActionKind, scope: DataActionScope): Promise<Preview> {
  await requireActiveOwner(actorUserId);
  if (!DATA_ACTION_KINDS.includes(actionKind)) throw new Error("Unsupported data-management action.");
  const blockers: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  let bytes = 0;
  let accountId = scope.accountId ?? null;

  if (actionKind === "QUARANTINE_IMPORT_JOB_FILE") {
    if (!scope.importJobId) throw new Error("Import job is required.");
    const job = await prisma.importJob.findUnique({ where: { id: scope.importJobId } });
    if (!job) throw new Error("Import job was not found.");
    accountId = job.accountId;
    if (ACTIVE_IMPORT_STATES.has(job.status)) blockers.push("Active or review-required import jobs cannot be archived.");
    const artifact = retainedImportJobArtifactPath(job.filePath);
    if (!artifact) blockers.push("The import artifact is outside managed storage or is already absent.");
    else {
      try { bytes = (await stat(artifact)).size; counts.files = 1; } catch { blockers.push("The retained import artifact is missing."); }
    }
  } else if (actionKind === "QUARANTINE_IMPORT_SOURCE_FILE" || actionKind === "QUARANTINE_GENERATED_REPORTS") {
    if (!scope.importJobId) throw new Error("Import job is required.");
    const job = await prisma.importJob.findUnique({ where: { id: scope.importJobId } });
    if (!job) throw new Error("Import job was not found.");
    accountId = job.accountId;
    if (ACTIVE_IMPORT_STATES.has(job.status)) blockers.push("Active or review-required import jobs cannot lose retained files.");
    const artifact = retainedImportJobArtifactPath(job.filePath);
    if (!artifact) blockers.push("The retained import artifact is outside managed storage or is already absent.");
    else {
      const candidate = actionKind === "QUARANTINE_GENERATED_REPORTS" ? path.join(artifact, "reports") : artifact;
      try {
        const info = await stat(candidate);
        if (actionKind === "QUARANTINE_GENERATED_REPORTS" && !info.isDirectory()) blockers.push("No managed report directory exists for this job.");
        else if (actionKind === "QUARANTINE_IMPORT_SOURCE_FILE" && info.isDirectory()) blockers.push("This job uses a multi-file retained artifact. Archive the job or quarantine its reviewed files separately.");
        else { bytes = info.size; counts.files = 1; }
      } catch { blockers.push(actionKind === "QUARANTINE_GENERATED_REPORTS" ? "No retained generated reports exist." : "The retained import artifact is missing."); }
    }
  } else if (actionKind === "QUARANTINE_CONSIGNMENT_FILE") {
    if (!scope.consignmentFileId) throw new Error("Consignment file is required.");
    const file = await prisma.consignmentImportFile.findUnique({ where: { id: scope.consignmentFileId }, include: { consignmentBatch: true } });
    if (!file) throw new Error("Consignment file was not found.");
    accountId = file.consignmentBatch.accountId;
    if (!file.managedRelativePath) blockers.push("The source file is already absent.");
    if (file.isCurrentSource && ["ACTIVE", "READY_TO_ACTIVATE"].includes(file.consignmentBatch.status)) blockers.push("The current source file cannot be removed from actionable work.");
    counts.files = file.managedRelativePath ? 1 : 0;
    bytes = file.fileSizeBytes;
  } else if (actionKind === "CLEAR_IMAGE_CACHE") {
    if (!accountId) throw new Error("Account is required.");
    const mappings = await prisma.skuImageMapping.findMany({ where: { accountId, cacheFilePath: { not: null } }, select: { cacheFileSizeBytes: true } });
    counts.files = mappings.length;
    bytes = mappings.reduce((sum, item) => sum + (item.cacheFileSizeBytes ?? 0), 0);
    warnings.push("Only regenerable cached images are affected; marketplace image URLs remain.");
  } else if (actionKind === "ARCHIVE_LISTING" || actionKind === "DELETE_UNREFERENCED_LISTING") {
    if (!scope.listingId) throw new Error("Listing is required.");
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: scope.listingId },
      include: { _count: { select: { consignmentLines: true, processRules: true, markingAssetLinks: true } } }
    });
    if (!listing) throw new Error("Listing was not found.");
    accountId = listing.accountId;
    counts.listings = 1;
    counts.references = listing._count.consignmentLines + listing._count.processRules + listing._count.markingAssetLinks;
    counts.activeWork = await prisma.workTask.count({
      where: {
        accountId: listing.accountId,
        status: { in: ["LOCKED", "READY", "IN_PROGRESS", "PROBLEM"] },
        OR: [
          { order: { sku: { in: [...new Set([listing.sellerSkuId, listing.sku])] } } },
          { consignmentLine: { marketplaceListingId: listing.id } }
        ]
      }
    });
    if (actionKind === "DELETE_UNREFERENCED_LISTING" && counts.references > 0) blockers.push("Referenced listings must be archived, not deleted.");
    if (actionKind === "DELETE_UNREFERENCED_LISTING" && counts.activeWork > 0) blockers.push("Listings used by active work must be archived, not deleted.");
  } else if (actionKind === "PURGE_QA_OPERATIONAL_DATA") {
    if (!accountId) throw new Error("Account is required.");
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("Account was not found.");
    if (!/^(QA|STAGE)-/i.test(account.code)) blockers.push("Operational purge is restricted to accounts with a QA- or STAGE- code.");
    Object.assign(counts, await accountCounts(accountId));
    if (counts.activeImports > 0) blockers.push("Stop or safely cancel active import jobs first.");
    if (counts.activeWorkTasks > 0) blockers.push("Complete, cancel, or resolve active work before purging QA operational records.");
    if (counts.retainedImportArtifacts > 0 || counts.retainedConsignmentFiles > 0) blockers.push("Quarantine retained source files before purging QA operational records.");
    warnings.push("Product Inventory listings and account/user access are preserved.");
  } else {
    if (!scope.deletionJobId) throw new Error("Deletion job is required.");
    const job = await prisma.dataDeletionJob.findUnique({ where: { id: scope.deletionJobId } });
    if (!job) throw new Error("Deletion job was not found.");
    accountId = job.accountId;
    counts.files = job.totalFiles;
    bytes = job.totalBytes;
    if (actionKind === "RESTORE_QUARANTINED_FILES" && job.state !== "COMPLETED") blockers.push("Only completed quarantine jobs can be restored.");
    if (actionKind === "PURGE_QUARANTINED_FILES" && (!job.purgeAfter || job.purgeAfter > new Date())) blockers.push("The quarantine retention period has not elapsed.");
  }

  const normalizedScope = { ...scope, ...(accountId ? { accountId } : {}) };
  return {
    actionKind,
    accountId,
    scope: normalizedScope,
    scopeFingerprint: scopeFingerprint(actionKind, normalizedScope),
    typedPhrase: phraseFor(actionKind, normalizedScope),
    blockers,
    counts,
    bytes,
    warnings
  };
}

function rootFor(kind: StoredFile["storageKind"]) {
  if (kind === "IMPORT_JOB") return path.resolve(IMPORT_JOB_STORAGE_DIR);
  if (kind === "CONSIGNMENT") return path.resolve(consignmentStorageRoot());
  return path.resolve(process.env.PRODUCT_IMAGE_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "product-images"));
}

function safeQuarantineChild(...parts: string[]) {
  const candidate = path.resolve(PRIVATE_ROOT, ...parts);
  if (candidate === PRIVATE_ROOT || !candidate.startsWith(`${PRIVATE_ROOT}${path.sep}`)) throw new Error("Quarantine path escapes managed storage.");
  for (const root of [rootFor("IMPORT_JOB"), rootFor("CONSIGNMENT"), rootFor("IMAGE_CACHE")]) {
    if (PRIVATE_ROOT === root || PRIVATE_ROOT.startsWith(`${root}${path.sep}`) || root.startsWith(`${PRIVATE_ROOT}${path.sep}`)) {
      throw new Error("Quarantine storage must be isolated from managed source storage.");
    }
  }
  return candidate;
}

async function safeExistingPath(root: string, relative: string) {
  if (path.isAbsolute(relative)) throw new Error("Managed path must be relative.");
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, relative);
  if (candidate === resolvedRoot || !candidate.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Managed path escapes its storage root.");
  const rootReal = await realpath(resolvedRoot);
  const candidateReal = await realpath(candidate);
  if (!candidateReal.startsWith(`${rootReal}${path.sep}`)) throw new Error("Managed path escapes through a link.");
  if ((await lstat(candidateReal)).isSymbolicLink()) throw new Error("Symbolic links cannot be quarantined.");
  return candidateReal;
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function moveToQuarantine(jobId: string, files: Array<{ kind: StoredFile["storageKind"]; relative: string; recordId?: string; sha256?: string; recordMetadata?: StoredFile["recordMetadata"] }>) {
  const manifest: StoredFile[] = [];
  const jobRoot = safeQuarantineChild(jobId);
  await mkdir(jobRoot, { recursive: true });
  try {
    for (const [index, file] of files.entries()) {
      const source = await safeExistingPath(rootFor(file.kind), file.relative);
      const info = await stat(source);
      const sourceHash = info.isFile() ? await sha256File(source) : undefined;
      if (file.sha256 && sourceHash && file.sha256.toLowerCase() !== sourceHash) throw new Error("Managed file hash does not match its retained record.");
      const quarantineRelativePath = `${index}-${path.basename(source)}`;
      const destination = path.join(jobRoot, quarantineRelativePath);
      await rename(source, destination);
      if (sourceHash && await sha256File(destination) !== sourceHash) {
        await rename(destination, source);
        throw new Error("Quarantine file verification failed.");
      }
      manifest.push({
        storageKind: file.kind,
        sourceRelativePath: file.relative.replace(/\\/g, "/"),
        quarantineRelativePath,
        size: info.size,
        recordId: file.recordId,
        sha256: sourceHash ?? file.sha256,
        recordMetadata: file.recordMetadata
      });
    }
  } catch (error) {
    await restoreManifest(jobId, manifest).catch(() => undefined);
    throw error;
  }
  return manifest;
}

async function restoreManifest(jobId: string, manifest: StoredFile[]) {
  for (const file of [...manifest].reverse()) {
    const root = rootFor(file.storageKind);
    const destination = path.resolve(root, file.sourceRelativePath);
    if (!destination.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Restore destination escapes managed storage.");
    await mkdir(path.dirname(destination), { recursive: true });
    const source = safeQuarantineChild(jobId, file.quarantineRelativePath);
    const sourceInfo = await stat(source);
    if (file.sha256 && sourceInfo.isFile() && await sha256File(source) !== file.sha256) throw new Error("Quarantined file hash verification failed.");
    await rename(source, destination);
    if (file.sha256 && sourceInfo.isFile() && await sha256File(destination) !== file.sha256) {
      await rename(destination, source);
      throw new Error("Restored file hash verification failed.");
    }
  }
  await rm(safeQuarantineChild(jobId), { recursive: true, force: true });
}

async function createAuthorizedJob(input: {
  actorUserId: string;
  sessionId: string;
  grantToken: string;
  clientRequestId: string;
  preview: Preview;
}) {
  assertRequestId(input.clientRequestId);
  const requestFingerprint = digest(stableJson({ actionKind: input.preview.actionKind, scope: input.preview.scope }));
  const replay = await prisma.dataDeletionJob.findFirst({
    where: { actorUserId: input.actorUserId, actionKind: input.preview.actionKind, clientRequestId: input.clientRequestId }
  });
  if (replay) {
    if (replay.requestFingerprint !== requestFingerprint) throw new Error("This request ID was already used with different data.");
    return { job: replay, replay: true };
  }
  return prisma.$transaction(async tx => {
    await consumeOwnerActionGrant({
      actorUserId: input.actorUserId,
      sessionId: input.sessionId,
      actionKind: input.preview.actionKind,
      scopeFingerprint: input.preview.scopeFingerprint,
      token: input.grantToken
    }, tx);
    const job = await tx.dataDeletionJob.create({
      data: {
        accountId: input.preview.accountId,
        actorUserId: input.actorUserId,
        actionKind: input.preview.actionKind,
        state: "AUTHORIZED",
        clientRequestId: input.clientRequestId,
        requestFingerprint,
        scopeFingerprint: input.preview.scopeFingerprint,
        scopeJson: JSON.stringify(input.preview.scope),
        previewJson: JSON.stringify({ counts: input.preview.counts, bytes: input.preview.bytes, warnings: input.preview.warnings })
      }
    });
    return { job, replay: false };
  });
}

export async function executeDataAction(input: {
  actorUserId: string;
  sessionId: string;
  grantToken: string;
  clientRequestId: string;
  actionKind: DataActionKind;
  scope: DataActionScope;
  typedPhrase: string;
}) {
  assertRequestId(input.clientRequestId);
  await requireActiveOwner(input.actorUserId);
  const prior = await prisma.dataDeletionJob.findFirst({
    where: { actorUserId: input.actorUserId, actionKind: input.actionKind, clientRequestId: input.clientRequestId }
  });
  if (prior) {
    const storedScope = JSON.parse(prior.scopeJson) as DataActionScope;
    const requestedEntries = Object.entries(input.scope).filter(([, value]) => value);
    if (requestedEntries.some(([key, value]) => storedScope[key as keyof DataActionScope] !== value)) {
      throw new Error("This request ID was already used with different data.");
    }
    if (["COMPLETED", "RESTORED", "PURGED", "FAILED_RESTORED"].includes(prior.state)) return prior;
    if (["FILES_QUARANTINED", "DELETING_DATABASE_ROWS", "VERIFYING", "FAILED_VERIFYING"].includes(prior.state) && prior.manifestJson) {
      const storedPreview = JSON.parse(prior.previewJson) as { counts?: Record<string, number>; bytes?: number; warnings?: string[] };
      const replayPreview: Preview = {
        actionKind: prior.actionKind as DataActionKind,
        accountId: prior.accountId,
        scope: storedScope,
        scopeFingerprint: prior.scopeFingerprint,
        typedPhrase: phraseFor(prior.actionKind as DataActionKind, storedScope),
        blockers: [],
        counts: storedPreview.counts ?? {},
        bytes: storedPreview.bytes ?? 0,
        warnings: storedPreview.warnings ?? []
      };
      await finalizeQuarantineMetadata(prior.id, input.actorUserId, replayPreview, JSON.parse(prior.manifestJson) as StoredFile[]);
      return prisma.dataDeletionJob.findUniqueOrThrow({ where: { id: prior.id } });
    }
    throw new Error("The prior deletion request is incomplete and requires owner review.");
  }
  const preview = await previewDataAction(input.actorUserId, input.actionKind, input.scope);
  if (preview.blockers.length) throw new Error(preview.blockers[0]);
  if (input.typedPhrase !== preview.typedPhrase) throw new Error(`Type exactly: ${preview.typedPhrase}`);
  const authorized = await createAuthorizedJob({ ...input, preview });
  if (authorized.replay) return authorized.job;
  const jobId = authorized.job.id;

  try {
    if (input.actionKind === "ARCHIVE_LISTING" || input.actionKind === "DELETE_UNREFERENCED_LISTING") {
      await prisma.$transaction(async tx => {
        if (input.actionKind === "ARCHIVE_LISTING") {
          await tx.marketplaceListing.update({ where: { id: preview.scope.listingId! }, data: { listingStatus: "ARCHIVED" } });
        } else {
          await tx.marketplaceListing.delete({ where: { id: preview.scope.listingId! } });
        }
        await tx.auditLog.create({ data: { userId: input.actorUserId, accountId: preview.accountId, action: input.actionKind, entityType: "MarketplaceListing", entityId: preview.scope.listingId, metadata: JSON.stringify({ deletionJobId: jobId }) } });
        await tx.dataDeletionJob.update({ where: { id: jobId }, data: { state: "COMPLETED", completedAt: new Date() } });
      });
    } else if (input.actionKind === "PURGE_QA_OPERATIONAL_DATA") {
      await purgeQaOperationalData(jobId, input.actorUserId, preview.accountId!);
    } else if (input.actionKind === "RESTORE_QUARANTINED_FILES") {
      await restoreDeletionJob(jobId, input.actorUserId, preview.scope.deletionJobId!);
    } else if (input.actionKind === "PURGE_QUARANTINED_FILES") {
      await permanentlyPurgeDeletionJob(jobId, input.actorUserId, preview.scope.deletionJobId!);
    } else {
      await quarantineManagedData(jobId, input.actorUserId, preview);
    }
    return prisma.dataDeletionJob.findUniqueOrThrow({ where: { id: jobId } });
  } catch (error) {
    await prisma.dataDeletionJob.updateMany({
      where: { id: jobId, state: { notIn: ["COMPLETED", "RESTORED", "PURGED", "FAILED_RESTORED", "FAILED_VERIFYING"] } },
      data: { state: "FAILED", errorSummary: error instanceof Error ? error.message.slice(0, 500) : "Data action failed." }
    });
    throw error;
  }
}

async function quarantineManagedData(jobId: string, actorUserId: string, preview: Preview) {
  const files: Array<{ kind: StoredFile["storageKind"]; relative: string; recordId?: string; sha256?: string; recordMetadata?: StoredFile["recordMetadata"] }> = [];
  if (preview.actionKind === "QUARANTINE_IMPORT_JOB_FILE" || preview.actionKind === "QUARANTINE_IMPORT_SOURCE_FILE" || preview.actionKind === "QUARANTINE_GENERATED_REPORTS") {
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: preview.scope.importJobId! } });
    const artifact = retainedImportJobArtifactPath(job.filePath);
    if (!artifact) throw new Error("The import artifact is outside managed storage.");
    const selected = preview.actionKind === "QUARANTINE_GENERATED_REPORTS" ? path.join(artifact, "reports") : artifact;
    files.push({
      kind: "IMPORT_JOB",
      relative: path.relative(IMPORT_JOB_STORAGE_DIR, selected),
      recordId: job.id,
      recordMetadata: { status: job.status, stage: job.stage, reportJson: job.reportJson }
    });
  } else if (preview.actionKind === "QUARANTINE_CONSIGNMENT_FILE") {
    const file = await prisma.consignmentImportFile.findUniqueOrThrow({ where: { id: preview.scope.consignmentFileId! } });
    if (!file.managedRelativePath) throw new Error("The source file is already absent.");
    files.push({ kind: "CONSIGNMENT", relative: file.managedRelativePath, recordId: file.id, sha256: file.sha256, recordMetadata: { notes: file.notes } });
  } else {
    const mappings = await prisma.skuImageMapping.findMany({
      where: { accountId: preview.accountId!, cacheFilePath: { not: null } },
      select: { id: true, cacheFilePath: true, cacheStatus: true, cacheFileSizeBytes: true, cacheCachedAt: true }
    });
    const imageRoot = rootFor("IMAGE_CACHE");
    for (const mapping of mappings) {
      if (!mapping.cacheFilePath) continue;
      const absolute = path.resolve(mapping.cacheFilePath);
      const relative = path.relative(imageRoot, absolute);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("A cached image is outside managed image storage.");
      files.push({
        kind: "IMAGE_CACHE",
        relative,
        recordId: mapping.id,
        recordMetadata: {
          cacheStatus: mapping.cacheStatus,
          cacheFileSizeBytes: mapping.cacheFileSizeBytes,
          cacheCachedAt: mapping.cacheCachedAt?.toISOString() ?? null
        }
      });
    }
  }

  await prisma.dataDeletionJob.update({ where: { id: jobId }, data: { state: "QUARANTINING_FILES" } });
  const manifest = await moveToQuarantine(jobId, files);
  await prisma.dataDeletionJob.update({ where: { id: jobId }, data: { state: "FILES_QUARANTINED", manifestJson: JSON.stringify(manifest), quarantineRelativePath: jobId, totalFiles: manifest.length, totalBytes: manifest.reduce((sum, file) => sum + file.size, 0) } });
  await finalizeQuarantineMetadata(jobId, actorUserId, preview, manifest);
}

async function finalizeQuarantineMetadata(jobId: string, actorUserId: string, preview: Preview, manifest: StoredFile[]) {
  let metadataCommitted = false;
  try {
    const current = await prisma.dataDeletionJob.findUniqueOrThrow({ where: { id: jobId } });
    const verifyingOnly = ["VERIFYING", "FAILED_VERIFYING"].includes(current.state);
    if (!verifyingOnly) {
      await prisma.dataDeletionJob.update({ where: { id: jobId }, data: { state: "DELETING_DATABASE_ROWS" } });
    }
    await prisma.$transaction(async tx => {
      if (!verifyingOnly) {
        if (preview.actionKind === "QUARANTINE_IMPORT_JOB_FILE") {
          await tx.importJob.update({ where: { id: preview.scope.importJobId! }, data: { filePath: null, status: "ARCHIVED", stage: "ARCHIVED" } });
        } else if (preview.actionKind === "QUARANTINE_IMPORT_SOURCE_FILE") {
          await tx.importJob.update({ where: { id: preview.scope.importJobId! }, data: { filePath: null } });
        } else if (preview.actionKind === "QUARANTINE_GENERATED_REPORTS") {
          await tx.importJob.update({ where: { id: preview.scope.importJobId! }, data: { reportJson: null } });
        } else if (preview.actionKind === "QUARANTINE_CONSIGNMENT_FILE") {
          await tx.consignmentImportFile.update({ where: { id: preview.scope.consignmentFileId! }, data: { managedRelativePath: null, notes: "Source file quarantined by owner data management." } });
        } else {
          await tx.skuImageMapping.updateMany({ where: { accountId: preview.accountId! }, data: { cacheFilePath: null, cacheStatus: "NOT_CACHED", cacheFileSizeBytes: null, cacheCachedAt: null } });
        }
        await tx.auditLog.create({ data: { userId: actorUserId, accountId: preview.accountId, action: preview.actionKind, entityType: "DataDeletionJob", entityId: jobId, metadata: JSON.stringify({ fileCount: manifest.length, bytes: manifest.reduce((sum, file) => sum + file.size, 0) }) } });
      }
      await tx.dataDeletionJob.update({ where: { id: jobId }, data: { state: "VERIFYING" } });
    });
    metadataCommitted = true;
    if (preview.actionKind === "QUARANTINE_IMPORT_JOB_FILE" || preview.actionKind === "QUARANTINE_IMPORT_SOURCE_FILE") {
      const job = await prisma.importJob.findUniqueOrThrow({ where: { id: preview.scope.importJobId! } });
      if (job.filePath !== null) throw new Error("Import source metadata verification failed.");
    } else if (preview.actionKind === "QUARANTINE_CONSIGNMENT_FILE") {
      const file = await prisma.consignmentImportFile.findUniqueOrThrow({ where: { id: preview.scope.consignmentFileId! } });
      if (file.managedRelativePath !== null) throw new Error("Consignment source metadata verification failed.");
    } else if (preview.actionKind === "CLEAR_IMAGE_CACHE") {
      if (await prisma.skuImageMapping.count({ where: { accountId: preview.accountId!, cacheFilePath: { not: null } } })) throw new Error("Image cache metadata verification failed.");
    }
    await prisma.dataDeletionJob.update({ where: { id: jobId }, data: { state: "COMPLETED", completedAt: new Date(), purgeAfter: new Date(Date.now() + QUARANTINE_RETENTION_MS) } });
  } catch (error) {
    if (!metadataCommitted) await restoreManifest(jobId, manifest);
    await prisma.dataDeletionJob.update({
      where: { id: jobId },
      data: {
        state: metadataCommitted ? "FAILED_VERIFYING" : "FAILED_RESTORED",
        errorSummary: error instanceof Error ? error.message.slice(0, 500) : "Database phase failed."
      }
    });
    throw error;
  }
}

async function restoreDeletionJob(controlJobId: string, actorUserId: string, targetJobId: string) {
  const target = await prisma.dataDeletionJob.findUniqueOrThrow({ where: { id: targetJobId } });
  const manifest = JSON.parse(target.manifestJson ?? "[]") as StoredFile[];
  await restoreManifest(target.id, manifest);
  await prisma.$transaction(async tx => {
    for (const file of manifest) {
      if (file.storageKind === "IMPORT_JOB" && file.recordId) {
        const destination = path.join(rootFor("IMPORT_JOB"), file.sourceRelativePath);
        if (target.actionKind === "QUARANTINE_GENERATED_REPORTS") {
          await tx.importJob.update({ where: { id: file.recordId }, data: { reportJson: typeof file.recordMetadata?.reportJson === "string" ? file.recordMetadata.reportJson : null } });
        } else {
          await tx.importJob.update({
            where: { id: file.recordId },
            data: {
              filePath: destination,
              ...(typeof file.recordMetadata?.status === "string" ? { status: file.recordMetadata.status } : {}),
              ...(typeof file.recordMetadata?.stage === "string" ? { stage: file.recordMetadata.stage } : {})
            }
          });
        }
      }
      if (file.storageKind === "CONSIGNMENT" && file.recordId) await tx.consignmentImportFile.update({ where: { id: file.recordId }, data: { managedRelativePath: file.sourceRelativePath, notes: typeof file.recordMetadata?.notes === "string" ? file.recordMetadata.notes : null } });
      if (file.storageKind === "IMAGE_CACHE" && file.recordId) {
        await tx.skuImageMapping.update({
          where: { id: file.recordId },
          data: {
            cacheFilePath: path.join(rootFor("IMAGE_CACHE"), file.sourceRelativePath),
            cacheStatus: file.recordMetadata?.cacheStatus === "CACHED" ? "CACHED" : "NOT_CACHED",
            cacheFileSizeBytes: typeof file.recordMetadata?.cacheFileSizeBytes === "number" ? file.recordMetadata.cacheFileSizeBytes : null,
            cacheCachedAt: typeof file.recordMetadata?.cacheCachedAt === "string" ? new Date(file.recordMetadata.cacheCachedAt) : null
          }
        });
      }
    }
    await tx.dataDeletionJob.update({ where: { id: target.id }, data: { state: "RESTORED", completedAt: new Date(), purgeAfter: null } });
    await tx.dataDeletionJob.update({ where: { id: controlJobId }, data: { state: "COMPLETED", completedAt: new Date() } });
    await tx.auditLog.create({ data: { userId: actorUserId, accountId: target.accountId, action: "RESTORE_QUARANTINED_FILES", entityType: "DataDeletionJob", entityId: target.id, metadata: JSON.stringify({ controlJobId, fileCount: manifest.length }) } });
  });
}

async function permanentlyPurgeDeletionJob(controlJobId: string, actorUserId: string, targetJobId: string) {
  const target = await prisma.dataDeletionJob.findUniqueOrThrow({ where: { id: targetJobId } });
  if (!target.purgeAfter || target.purgeAfter > new Date()) throw new Error("The quarantine retention period has not elapsed.");
  await rm(safeQuarantineChild(target.id), { recursive: true, force: true });
  await prisma.$transaction(async tx => {
    await tx.dataDeletionJob.update({ where: { id: target.id }, data: { state: "PURGED", completedAt: new Date(), manifestJson: null, quarantineRelativePath: null } });
    await tx.dataDeletionJob.update({ where: { id: controlJobId }, data: { state: "COMPLETED", completedAt: new Date() } });
    await tx.auditLog.create({ data: { userId: actorUserId, accountId: target.accountId, action: "PURGE_QUARANTINED_FILES", entityType: "DataDeletionJob", entityId: target.id, metadata: JSON.stringify({ controlJobId, fileCount: target.totalFiles }) } });
  });
}

async function purgeQaOperationalData(jobId: string, actorUserId: string, accountId: string) {
  await prisma.$transaction(async tx => {
    await tx.workGroupProjection.deleteMany({ where: { accountId } });
    await tx.workActionLog.deleteMany({ where: { accountId } });
    await tx.workTask.deleteMany({ where: { accountId } });
    await tx.workRouteDecisionRejection.deleteMany({ where: { accountId } });
    await tx.workRouteDecision.deleteMany({ where: { accountId } });
    await tx.workflowActionReceipt.deleteMany({ where: { accountId } });
    await tx.workChangeEvent.deleteMany({ where: { accountId } });
    await tx.workProjectionState.deleteMany({ where: { accountId } });
    await tx.problemOrder.deleteMany({ where: { accountId } });
    await tx.scanLog.deleteMany({ where: { accountId } });
    await tx.order.deleteMany({ where: { accountId } });
    await tx.uploadBatch.deleteMany({ where: { accountId } });
    await tx.consignmentBatch.deleteMany({ where: { accountId } });
    await tx.importJob.deleteMany({ where: { accountId } });
    await tx.auditLog.create({ data: { userId: actorUserId, accountId, action: "PURGE_QA_OPERATIONAL_DATA", entityType: "Account", entityId: accountId, metadata: JSON.stringify({ deletionJobId: jobId, preservedListings: true }) } });
    await tx.dataDeletionJob.update({ where: { id: jobId }, data: { state: "COMPLETED", completedAt: new Date() } });
  });
}

export async function dataManagementOverview(actorUserId: string, accountId?: string) {
  await requireActiveOwner(actorUserId);
  const accountWhere = accountId ? { accountId } : {};
  const [accounts, imports, files, listings, jobs] = await prisma.$transaction([
    prisma.account.count(),
    prisma.importJob.count({ where: accountWhere }),
    prisma.consignmentImportFile.count({ where: accountId ? { consignmentBatch: { accountId } } : {} }),
    prisma.marketplaceListing.count({ where: accountWhere }),
    prisma.dataDeletionJob.findMany({ where: accountId ? { OR: [{ accountId }, { accountId: null }] } : {}, orderBy: { createdAt: "desc" }, take: 50 })
  ]);
  return { accounts, imports, files, listings, jobs };
}

export async function dataManagementInventory(actorUserId: string, accountId?: string) {
  await requireActiveOwner(actorUserId);
  const [imports, consignmentFiles, listings, accounts] = await Promise.all([
    prisma.importJob.findMany({
      where: accountId ? { accountId } : { id: "__ACCOUNT_SELECTION_REQUIRED__" },
      select: { id: true, fileName: true, status: true, importType: true, createdAt: true, filePath: true },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.consignmentImportFile.findMany({
      where: accountId ? { consignmentBatch: { accountId } } : { id: "__ACCOUNT_SELECTION_REQUIRED__" },
      select: {
        id: true, originalFileName: true, fileSizeBytes: true, managedRelativePath: true, isCurrentSource: true, createdAt: true,
        consignmentBatch: { select: { id: true, displayName: true, status: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.marketplaceListing.findMany({
      where: accountId ? { accountId } : { id: "__ACCOUNT_SELECTION_REQUIRED__" },
      select: {
        id: true, sellerSkuId: true, productTitle: true, listingStatus: true,
        _count: { select: { consignmentLines: true, processRules: true, markingAssetLinks: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    }),
    prisma.account.findMany({ select: { id: true, code: true, name: true, active: true }, orderBy: { name: "asc" } })
  ]);
  return { imports, consignmentFiles, listings, accounts };
}
