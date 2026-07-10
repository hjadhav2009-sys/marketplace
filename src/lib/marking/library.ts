import { randomUUID } from "node:crypto";
import type { AttachmentType, Marketplace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import type { RequestMeta } from "@/lib/network";
import { MARKING_ASSET_MAX_FILES, removeFailedManagedMarkingFile, writeMarkingAssetFile } from "./storage";

export function normalizeMasterDesignId(value: unknown) {
  const normalized = String(value ?? "").normalize("NFKC").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.length > 80 || !/^[A-Z0-9][A-Z0-9._-]*$/.test(normalized)) throw new Error("Master Design ID contains unsupported characters.");
  return normalized;
}

export async function createMarkingAsset(input: { name: string; masterDesignId?: string | null; description?: string | null; actorUserId: string; accountId: string; request?: RequestMeta }) {
  const name = input.name.normalize("NFKC").trim().slice(0, 160);
  if (!name) throw new Error("Asset name is required.");
  const asset = await prisma.markingAsset.create({ data: { name, masterDesignId: normalizeMasterDesignId(input.masterDesignId), description: input.description?.trim().slice(0, 4000) || null, createdByUserId: input.actorUserId, updatedByUserId: input.actorUserId } });
  await recordAuditLog({ userId: input.actorUserId, accountId: input.accountId, action: "MARKING_ASSET_CREATED", entityType: "MarkingAsset", entityId: asset.id, metadata: { masterDesignId: asset.masterDesignId }, request: input.request });
  return asset;
}

export async function addMarkingAssetFileVersion(input: { markingAssetId: string; attachmentType: AttachmentType; file: File; actorUserId: string; accountId: string; request?: RequestMeta }) {
  const [asset, fileCount] = await Promise.all([
    prisma.markingAsset.findFirst({ where: { id: input.markingAssetId, active: true }, select: { id: true } }),
    prisma.markingAssetFile.count({ where: { markingAssetId: input.markingAssetId } })
  ]);
  if (!asset) throw new Error("Marking asset not found.");
  if (fileCount >= MARKING_ASSET_MAX_FILES) throw new Error("Marking asset reached its file-version limit.");

  const fileId = `maf_${randomUUID().replace(/-/g, "")}`;
  const stored = await writeMarkingAssetFile({ markingAssetId: asset.id, fileId, file: input.file, attachmentType: input.attachmentType });

  try {
    const duplicate = await prisma.markingAssetFile.findFirst({ where: { markingAssetId: asset.id, attachmentType: input.attachmentType, sha256: stored.sha256 } });
    if (duplicate) throw new Error("This exact file content already exists for the asset.");

    const created = await prisma.$transaction(async (tx) => {
      const latest = await tx.markingAssetFile.findFirst({ where: { markingAssetId: asset.id, attachmentType: input.attachmentType }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
      await tx.markingAssetFile.updateMany({ where: { markingAssetId: asset.id, attachmentType: input.attachmentType, activeVersion: true }, data: { activeVersion: false } });
      return tx.markingAssetFile.create({ data: { id: fileId, markingAssetId: asset.id, attachmentType: input.attachmentType, versionNumber: (latest?.versionNumber ?? 0) + 1, ...stored, uploadedByUserId: input.actorUserId, activeVersion: true } });
    });
    await recordAuditLog({ userId: input.actorUserId, accountId: input.accountId, action: "MARKING_FILE_UPLOADED", entityType: "MarkingAssetFile", entityId: created.id, metadata: { markingAssetId: asset.id, attachmentType: input.attachmentType, safeFileName: created.originalFileName, sha256: created.sha256, versionNumber: created.versionNumber }, request: input.request });
    await recordAuditLog({ userId: input.actorUserId, accountId: input.accountId, action: "MARKING_FILE_VERSION_ACTIVATED", entityType: "MarkingAssetFile", entityId: created.id, metadata: { markingAssetId: asset.id, attachmentType: input.attachmentType, versionNumber: created.versionNumber }, request: input.request });
    return created;
  } catch (error) {
    await removeFailedManagedMarkingFile(stored.managedRelativePath).catch(() => undefined);
    throw error;
  }
}

export async function linkMarkingAssetToListing(input: { markingAssetId: string; marketplaceListingId: string; accountId: string; actorUserId: string; matchMethod: string; identifierSnapshot?: Record<string, unknown>; request?: RequestMeta }) {
  const listing = await prisma.marketplaceListing.findFirst({ where: { id: input.marketplaceListingId, accountId: input.accountId }, select: { id: true, marketplace: true } });
  if (!listing) throw new Error("Listing does not belong to the selected account.");
  const asset = await prisma.markingAsset.findFirst({ where: { id: input.markingAssetId, active: true }, select: { id: true } });
  if (!asset) throw new Error("Marking asset not found.");

  const link = await prisma.markingAssetListingLink.upsert({
    where: { markingAssetId_marketplaceListingId: { markingAssetId: asset.id, marketplaceListingId: listing.id } },
    create: { markingAssetId: asset.id, marketplaceListingId: listing.id, accountId: input.accountId, marketplace: listing.marketplace.toUpperCase() as Marketplace, matchMethod: input.matchMethod.slice(0, 60), confidence: 1, identifierSnapshotJson: input.identifierSnapshot ? JSON.stringify(input.identifierSnapshot) : null, createdByUserId: input.actorUserId, active: true },
    update: { accountId: input.accountId, marketplace: listing.marketplace.toUpperCase() as Marketplace, matchMethod: input.matchMethod.slice(0, 60), identifierSnapshotJson: input.identifierSnapshot ? JSON.stringify(input.identifierSnapshot) : null, active: true }
  });
  await recordAuditLog({ userId: input.actorUserId, accountId: input.accountId, action: "MARKING_LISTING_LINKED", entityType: "MarkingAssetListingLink", entityId: link.id, metadata: { markingAssetId: asset.id, marketplaceListingId: listing.id, matchMethod: link.matchMethod }, request: input.request });
  return link;
}
