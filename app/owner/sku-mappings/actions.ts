"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { cacheProductCardImage, imageCacheNeedsRefresh } from "@/lib/image-cache";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { skuImageMappingSchema } from "@/lib/validators";

export async function upsertSkuImageMappingAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const parsed = skuImageMappingSchema.safeParse({
    sku: formData.get("sku"),
    imageUrl: formData.get("imageUrl"),
    productName: formData.get("productName") || undefined,
    color: formData.get("color") || undefined,
    size: formData.get("size") || undefined,
    notes: formData.get("notes") || undefined,
    active: formData.get("active") === "on"
  });

  if (!parsed.success) {
    redirect("/owner/sku-mappings?error=invalid");
  }

  const existing = await prisma.skuImageMapping.findUnique({
    where: {
      accountId_sku: {
        accountId: account.id,
        sku: parsed.data.sku
      }
    },
    select: {
      imageUrl: true,
      cacheStatus: true
    }
  });
  const imageUrlChanged = Boolean(existing && existing.imageUrl !== parsed.data.imageUrl);

  await prisma.skuImageMapping.upsert({
    where: {
      accountId_sku: {
        accountId: account.id,
        sku: parsed.data.sku
      }
    },
    update: {
      imageUrl: parsed.data.imageUrl,
      productName: parsed.data.productName,
      color: parsed.data.color,
      size: parsed.data.size,
      notes: parsed.data.notes,
      active: parsed.data.active,
      source: "manual",
      imageHealth: imageUrlChanged ? "UNKNOWN" : undefined,
      cacheStatus: imageUrlChanged ? "RECHECK_NEEDED" : undefined,
      cacheOriginalImageUrl: imageUrlChanged ? null : undefined,
      cacheError: imageUrlChanged ? null : undefined
    },
    create: {
      accountId: account.id,
      sku: parsed.data.sku,
      imageUrl: parsed.data.imageUrl,
      productName: parsed.data.productName,
      color: parsed.data.color,
      size: parsed.data.size,
      notes: parsed.data.notes,
      active: parsed.data.active,
      source: "manual",
      imageHealth: "UNKNOWN",
      cacheStatus: "NOT_CACHED"
    }
  });

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "SKU_MAPPING_UPSERT",
    entityType: "SkuImageMapping",
    entityId: parsed.data.sku,
    metadata: { sku: parsed.data.sku, active: parsed.data.active },
    request
  });

  revalidatePath("/owner/sku-mappings");
  revalidatePath("/picker");
  redirect("/owner/sku-mappings?saved=1");
}

async function cacheMapping(mapping: {
  id: string;
  accountId: string;
  sku: string;
  imageUrl: string;
}) {
  const meta = await cacheProductCardImage({
    accountId: mapping.accountId,
    sku: mapping.sku,
    originalImageUrl: mapping.imageUrl
  });

  await prisma.skuImageMapping.update({
    where: { id: mapping.id },
    data: {
      imageHealth: meta.status === "CACHED" ? "MAPPED" : "BROKEN",
      cacheStatus: meta.status,
      cacheFilePath: meta.filePath,
      cacheContentType: meta.contentType,
      cacheOriginalImageUrl: meta.originalImageUrl,
      cacheCachedAt: meta.cachedAt ? new Date(meta.cachedAt) : null,
      cacheLastUsedAt: meta.lastUsedAt ? new Date(meta.lastUsedAt) : null,
      cacheWidth: meta.width,
      cacheHeight: meta.height,
      cacheFileSizeBytes: meta.fileSizeBytes,
      cacheError: meta.error
    }
  });

  return meta.status;
}

async function cacheMappings(input: { accountId: string; mappingIds: string[]; force?: boolean }) {
  const mappings = await prisma.skuImageMapping.findMany({
    where: {
      accountId: input.accountId,
      id: { in: input.mappingIds },
      active: true
    },
    select: {
      id: true,
      accountId: true,
      sku: true,
      imageUrl: true,
      cacheStatus: true,
      cacheFilePath: true,
      cacheOriginalImageUrl: true,
      cacheCachedAt: true
    }
  });
  let alreadyCached = 0;
  let newlyCached = 0;
  let failed = 0;
  let noImageUrl = 0;

  for (const mapping of mappings) {
    if (!mapping.imageUrl) {
      noImageUrl += 1;
      continue;
    }

    if (!input.force && !imageCacheNeedsRefresh(mapping)) {
      alreadyCached += 1;
      await prisma.skuImageMapping.update({
        where: { id: mapping.id },
        data: { cacheLastUsedAt: new Date() }
      });
      continue;
    }

    const status = await cacheMapping(mapping);

    if (status === "CACHED") {
      newlyCached += 1;
    } else {
      failed += 1;
    }
  }

  return {
    requested: input.mappingIds.length,
    alreadyCached,
    newlyCached,
    failed,
    noImageUrl
  };
}

export async function cacheSkuImageAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const mappingId = String(formData.get("mappingId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/owner/sku-mappings");

  if (!mappingId) {
    redirect("/owner/sku-mappings?cacheError=invalid");
  }

  const result = await cacheMappings({
    accountId: account.id,
    mappingIds: [mappingId],
    force: true
  });

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "SKU_IMAGE_CACHE",
    entityType: "SkuImageMapping",
    entityId: mappingId,
    metadata: result,
    request
  });

  revalidatePath("/owner/sku-mappings");
  revalidatePath("/picker");
  revalidatePath("/packing");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}cached=${result.newlyCached}&failed=${result.failed}`);
}

export async function cacheVisibleSkuImagesAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const mappingIds = formData.getAll("mappingId").filter((value): value is string => typeof value === "string" && value.length > 0);
  const returnTo = String(formData.get("returnTo") ?? "/owner/sku-mappings");

  const result = await cacheMappings({
    accountId: account.id,
    mappingIds
  });

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "SKU_IMAGE_CACHE_VISIBLE",
    entityType: "SkuImageMapping",
    metadata: result,
    request
  });

  revalidatePath("/owner/sku-mappings");
  revalidatePath("/picker");
  revalidatePath("/packing");
  redirect(
    `${returnTo}${returnTo.includes("?") ? "&" : "?"}cached=${result.newlyCached}&already=${result.alreadyCached}&failed=${result.failed}`
  );
}

export async function recheckVisibleSkuImagesAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const mappingIds = formData.getAll("mappingId").filter((value): value is string => typeof value === "string" && value.length > 0);
  const returnTo = String(formData.get("returnTo") ?? "/owner/sku-mappings");

  if (mappingIds.length > 0) {
    const result = await prisma.skuImageMapping.updateMany({
      where: {
        accountId: account.id,
        id: { in: mappingIds },
        imageHealth: "BROKEN"
      },
      data: {
        imageHealth: "UNKNOWN"
      }
    });

    await recordAuditLog({
      userId: user.id,
      accountId: account.id,
      action: "SKU_IMAGE_RECHECK",
      entityType: "SkuImageMapping",
      metadata: { requestedRows: mappingIds.length, resetRows: result.count },
      request
    });
  }

  revalidatePath("/owner/sku-mappings");
  revalidatePath("/picker");
  redirect(returnTo.startsWith("/owner/sku-mappings") ? returnTo : "/owner/sku-mappings");
}
