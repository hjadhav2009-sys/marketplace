"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { cleanupTarget } from "@/lib/cleanup";
import {
  bytesToMegabytes,
  deleteImageCacheCandidates,
  findImageCacheCleanupCandidates,
  isImageCacheCleanupConfirmationValid
} from "@/lib/image-cache";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { cleanupTargetLabels, isCleanupConfirmationValid, isCleanupTarget } from "@/lib/retention";

export async function cleanupDataAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const target = String(formData.get("target") ?? "");
  const confirmation = formData.get("confirmation");

  if (!isCleanupTarget(target) || !isCleanupConfirmationValid(confirmation)) {
    redirect("/owner/cleanup?error=confirm");
  }

  const result = await cleanupTarget(target);

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "CLEANUP_OLD_DATA",
    entityType: "Cleanup",
    entityId: target,
    metadata: {
      target,
      label: cleanupTargetLabels[target],
      deletedRows: result.count
    },
    request
  });

  revalidatePath("/owner/cleanup");
  revalidatePath("/owner/system");
  redirect(`/owner/cleanup?cleaned=${target}&count=${result.count}`);
}

export async function cleanupImageCacheAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const confirmation = formData.get("confirmation");

  if (!isImageCacheCleanupConfirmationValid(confirmation)) {
    redirect("/owner/cleanup?error=confirm");
  }

  const candidates = await findImageCacheCleanupCandidates();
  const result = await deleteImageCacheCandidates(candidates);

  if (result.relativeFilePaths.length > 0) {
    await prisma.skuImageMapping.updateMany({
      where: {
        cacheFilePath: { in: result.relativeFilePaths }
      },
      data: {
        cacheStatus: "NOT_CACHED",
        cacheFilePath: null,
        cacheContentType: null,
        cacheOriginalImageUrl: null,
        cacheCachedAt: null,
        cacheWidth: null,
        cacheHeight: null,
        cacheFileSizeBytes: null,
        cacheError: null
      }
    });
  }

  const freedMb = bytesToMegabytes(result.fileSizeBytes).toFixed(1);

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "CLEANUP_IMAGE_CACHE",
    entityType: "Cleanup",
    entityId: "image-cache",
    metadata: {
      deletedFiles: result.count,
      freedMb
    },
    request
  });

  revalidatePath("/owner/cleanup");
  revalidatePath("/owner/system");
  revalidatePath("/owner/sku-mappings");
  revalidatePath("/picker");
  revalidatePath("/packing");
  redirect(`/owner/cleanup?cleaned=image-cache&count=${result.count}&mb=${freedMb}`);
}
