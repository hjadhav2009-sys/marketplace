"use server";

import type { AttachmentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { requireWorkPermission } from "@/lib/work-permissions";
import { markingAssetAccessWhere } from "@/src/lib/marking/access";
import { addMarkingAssetFileVersion, createMarkingAsset, linkMarkingAssetToListing, normalizeMasterDesignId } from "@/src/lib/marking/library";

function text(formData: FormData, name: string, max = 4000) {
  return String(formData.get(name) ?? "").normalize("NFKC").trim().slice(0, max) || null;
}

function number(formData: FormData, name: string, options: { min?: number; max?: number; integer?: boolean } = {}) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  const parsed = Number(value);
  const min = options.min ?? 0;
  if (!Number.isFinite(parsed) || parsed < min || (options.max !== undefined && parsed > options.max) || (options.integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} is outside the supported range.`);
  }
  return parsed;
}

function settingsJson(formData: FormData) {
  const raw = text(formData, "settingsJson", 8000);
  if (!raw) return null;
  try {
    JSON.parse(raw);
    return JSON.stringify(JSON.parse(raw));
  } catch {
    throw new Error("Settings JSON must be valid JSON.");
  }
}

async function accessibleAsset(user: Awaited<ReturnType<typeof requireWorkPermission>>, accountId: string, assetId: string) {
  return prisma.markingAsset.findFirst({ where: { id: assetId, ...markingAssetAccessWhere(user, accountId) } });
}

export async function createMarkingAssetAction(formData: FormData) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  try {
    const asset = await createMarkingAsset({ name: text(formData, "name", 160) ?? "", masterDesignId: text(formData, "masterDesignId", 80), description: text(formData, "description"), actorUserId: user.id, accountId: account.id, request });
    redirect(`/owner/marking-library/${asset.id}?created=1`);
  } catch (error) {
    redirect(`/owner/marking-library/new?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not create asset.")}`);
  }
}

export async function updateMarkingAssetAction(formData: FormData) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const assetId = text(formData, "assetId", 80);
  if (!assetId || !(await accessibleAsset(user, account.id, assetId))) redirect("/owner/marking-library?error=forbidden");

  try {
    const name = text(formData, "name", 160);
    if (!name) throw new Error("Asset name is required.");
    const status = text(formData, "status", 40) ?? "DRAFT";
    if (!["DRAFT", "ACTIVE", "ARCHIVED"].includes(status)) throw new Error("Unsupported marking asset status.");
    const asset = await prisma.markingAsset.update({
      where: { id: assetId },
      data: {
        name,
        masterDesignId: normalizeMasterDesignId(text(formData, "masterDesignId", 80)),
        description: text(formData, "description"),
        machineType: text(formData, "machineType", 120),
        softwareName: text(formData, "softwareName", 120),
        material: text(formData, "material", 120),
        markingPosition: text(formData, "markingPosition", 160),
        markingWidthMm: number(formData, "markingWidthMm"),
        markingHeightMm: number(formData, "markingHeightMm"),
        powerSetting: number(formData, "powerSetting", { max: 100 }),
        speedSetting: number(formData, "speedSetting", { max: 100000 }),
        frequencySetting: number(formData, "frequencySetting", { max: 1000 }),
        passes: number(formData, "passes", { min: 1, max: 1000, integer: true }),
        instructions: text(formData, "instructions", 8000),
        settingsJson: settingsJson(formData),
        status,
        updatedByUserId: user.id
      }
    });
    await recordAuditLog({ userId: user.id, accountId: account.id, action: "MARKING_ASSET_UPDATED", entityType: "MarkingAsset", entityId: asset.id, metadata: { masterDesignId: asset.masterDesignId, status: asset.status }, request });
    revalidatePath(`/owner/marking-library/${asset.id}`);
    redirect(`/owner/marking-library/${asset.id}?updated=1`);
  } catch (error) {
    redirect(`/owner/marking-library/${assetId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not update asset.")}`);
  }
}

export async function uploadMarkingAssetFileAction(formData: FormData) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const assetId = text(formData, "assetId", 80);
  const attachmentType = text(formData, "attachmentType", 40) as AttachmentType | null;
  const file = formData.get("file");
  const allowed: AttachmentType[] = ["MARKING_FILE", "MARKING_PREVIEW", "MARKING_REPORT"];
  if (!assetId || !(await accessibleAsset(user, account.id, assetId))) redirect("/owner/marking-library?error=forbidden");
  if (!(file instanceof File) || !attachmentType || !allowed.includes(attachmentType)) redirect(`/owner/marking-library/${assetId}?error=invalid-file`);

  try {
    await addMarkingAssetFileVersion({ markingAssetId: assetId, attachmentType, file, actorUserId: user.id, accountId: account.id, request });
    revalidatePath(`/owner/marking-library/${assetId}`);
    redirect(`/owner/marking-library/${assetId}?uploaded=1`);
  } catch (error) {
    redirect(`/owner/marking-library/${assetId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Upload failed.")}`);
  }
}

export async function linkMarkingListingAction(formData: FormData) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const assetId = text(formData, "assetId", 80);
  const listingId = text(formData, "listingId", 80);
  if (!assetId || !listingId || !(await accessibleAsset(user, account.id, assetId))) redirect("/owner/marking-library?error=forbidden");
  try {
    await linkMarkingAssetToListing({ markingAssetId: assetId, marketplaceListingId: listingId, accountId: account.id, actorUserId: user.id, matchMethod: text(formData, "matchMethod", 60) ?? "OWNER_SELECTED", request });
    revalidatePath(`/owner/marking-library/${assetId}`);
    redirect(`/owner/marking-library/${assetId}?linked=1`);
  } catch (error) {
    redirect(`/owner/marking-library/${assetId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not link listing.")}`);
  }
}

export async function unlinkMarkingListingAction(formData: FormData) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const assetId = text(formData, "assetId", 80);
  const linkId = text(formData, "linkId", 80);
  if (!assetId || !linkId || !(await accessibleAsset(user, account.id, assetId))) redirect("/owner/marking-library?error=forbidden");
  const result = await prisma.markingAssetListingLink.updateMany({ where: { id: linkId, markingAssetId: assetId, accountId: account.id }, data: { active: false } });
  if (result.count) await recordAuditLog({ userId: user.id, accountId: account.id, action: "MARKING_LISTING_UNLINKED", entityType: "MarkingAssetListingLink", entityId: linkId, metadata: { markingAssetId: assetId }, request });
  revalidatePath(`/owner/marking-library/${assetId}`);
  redirect(`/owner/marking-library/${assetId}?unlinked=1`);
}

export async function archiveMarkingAssetAction(formData: FormData) {
  const user = await requireWorkPermission("canManageMarkingLibrary");
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const assetId = text(formData, "assetId", 80);
  if (!assetId || !(await accessibleAsset(user, account.id, assetId))) redirect("/owner/marking-library?error=forbidden");
  await prisma.markingAsset.update({ where: { id: assetId }, data: { active: false, status: "ARCHIVED", updatedByUserId: user.id } });
  await recordAuditLog({ userId: user.id, accountId: account.id, action: "MARKING_ASSET_ARCHIVED", entityType: "MarkingAsset", entityId: assetId, metadata: { originalFilesPreserved: true }, request });
  revalidatePath("/owner/marking-library");
  redirect("/owner/marking-library?archived=1");
}
