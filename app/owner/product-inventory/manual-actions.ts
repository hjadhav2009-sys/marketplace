"use server";

import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import {
  createManualMarketplaceListing,
  updateManualMarketplaceListing,
  type ManualListingCommonInput
} from "@/src/lib/catalog/manual-listing";

function common(formData: FormData): ManualListingCommonInput {
  return {
    productTitle: formData.get("productTitle"),
    brand: formData.get("brand"),
    category: formData.get("category"),
    subCategory: formData.get("subCategory"),
    fsn: formData.get("fsn"),
    listingId: formData.get("listingIdentifier"),
    listingStatus: formData.get("listingStatus"),
    mrp: formData.get("mrp"),
    sellingPrice: formData.get("sellingPrice"),
    mainImageUrl: formData.get("mainImageUrl"),
    description: formData.get("description")
  };
}

export async function createManualListingAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const result = await createManualMarketplaceListing({
    actorUserId: user.id,
    accountId: account.id,
    clientRequestId: String(formData.get("clientRequestId") ?? ""),
    sellerSku: formData.get("sellerSku"),
    common: common(formData),
    manualLocked: formData.get("manualLocked") === "on"
  });
  redirect(`/owner/product-inventory/${result.listingId}`);
}

export async function updateManualListingAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const result = await updateManualMarketplaceListing({
    actorUserId: user.id,
    accountId: account.id,
    clientRequestId: String(formData.get("clientRequestId") ?? ""),
    marketplaceListingId: String(formData.get("marketplaceListingId") ?? ""),
    expectedUpdatedAt: String(formData.get("expectedUpdatedAt") ?? ""),
    sellerSku: formData.get("sellerSku"),
    common: common(formData),
    manualLocked: formData.get("manualLocked") === "on"
  });
  redirect(`/owner/product-inventory/${result.listingId}`);
}
