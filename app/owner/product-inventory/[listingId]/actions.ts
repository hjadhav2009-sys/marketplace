"use server";

import { revalidatePath } from "next/cache";
import { requireAccount, requireUser } from "@/lib/auth";
import { updateManualMarketplaceListingLocks } from "@/src/lib/catalog/manual-listing";

export async function saveCatalogFieldLocksAction(formData: FormData) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const marketplaceListingId = String(formData.get("marketplaceListingId") ?? "");
  await updateManualMarketplaceListingLocks({
    actorUserId: user.id,
    accountId: account.id,
    marketplaceListingId,
    expectedUpdatedAt: String(formData.get("expectedUpdatedAt") ?? ""),
    clientRequestId: String(formData.get("clientRequestId") ?? ""),
    lockedFields: formData.getAll("lockedField")
  });
  revalidatePath(`/owner/product-inventory/${marketplaceListingId}`);
}
