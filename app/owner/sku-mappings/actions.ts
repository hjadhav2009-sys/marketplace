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
