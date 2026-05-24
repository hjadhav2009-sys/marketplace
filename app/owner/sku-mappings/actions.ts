"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { skuImageMappingSchema } from "@/lib/validators";

export async function upsertSkuImageMappingAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const parsed = skuImageMappingSchema.safeParse({
    sku: formData.get("sku"),
    imageUrl: formData.get("imageUrl"),
    productName: formData.get("productName") || undefined,
    color: formData.get("color") || undefined
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
      color: parsed.data.color
    },
    create: {
      accountId: account.id,
      sku: parsed.data.sku,
      imageUrl: parsed.data.imageUrl,
      productName: parsed.data.productName,
      color: parsed.data.color
    }
  });

  revalidatePath("/owner/sku-mappings");
  revalidatePath("/picker");
  redirect("/owner/sku-mappings?saved=1");
}
