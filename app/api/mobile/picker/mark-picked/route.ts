import { revalidatePath } from "next/cache";
import { decodePickerDimension } from "@/lib/operations/picking";
import {
  getMobilePermissionAccountContext,
  mobileError,
  mobileJson,
  readMobileJsonBody
} from "@/lib/mobile-api";
import { markCustomerOrdersPickedSafely } from "@/src/lib/workflow/order-picking";

export async function POST(request: Request) {
  const body = await readMobileJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const context = await getMobilePermissionAccountContext(request, "canPick", body.data.accountId);

  if (!context.ok) {
    return context.response;
  }

  const sku = String(body.data.sku ?? "").trim();

  if (!sku) {
    return mobileError("invalid_sku", "SKU is required.", 400);
  }

  const color = decodePickerDimension(String(body.data.color ?? ""));
  const size = decodePickerDimension(String(body.data.size ?? ""));
  const result = await markCustomerOrdersPickedSafely({ actorUserId: context.user.id, accountId: context.account.id, where: { sku, color: color === undefined ? undefined : color, size: size === undefined ? undefined : size }, source: "mobile-api", clientRequestId: String(body.data.clientRequestId ?? "") });

  revalidatePath("/picker");
  return mobileJson({ ok: true, updatedRows: result.updatedCount, assemblyTasksCreated: result.assemblyTaskCount });
}
