"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
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
    notes: formData.get("notes") || undefined,
    active: formData.get("active") === "on"
  });

  if (!parsed.success) {
    redirect("/owner/sku-mappings?error=invalid");
  }

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
      notes: parsed.data.notes,
      active: parsed.data.active,
      source: "manual",
      imageHealth: "MAPPED"
    },
    create: {
      accountId: account.id,
      sku: parsed.data.sku,
      imageUrl: parsed.data.imageUrl,
      productName: parsed.data.productName,
      color: parsed.data.color,
      notes: parsed.data.notes,
      active: parsed.data.active,
      source: "manual",
      imageHealth: "MAPPED"
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
