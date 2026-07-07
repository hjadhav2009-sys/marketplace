import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@/lib/audit";
import { decodePickerDimension } from "@/lib/operations/picking";
import {
  getMobileAccountContext,
  getMobileRequestMeta,
  mobileError,
  mobileJson,
  readMobileJsonBody
} from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await readMobileJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const context = await getMobileAccountContext(request, ["OWNER", "PICKER"], body.data.accountId);

  if (!context.ok) {
    return context.response;
  }

  const sku = String(body.data.sku ?? "").trim();

  if (!sku) {
    return mobileError("invalid_sku", "SKU is required.", 400);
  }

  const color = decodePickerDimension(String(body.data.color ?? ""));
  const size = decodePickerDimension(String(body.data.size ?? ""));
  const result = await prisma.order.updateMany({
    where: {
      accountId: context.account.id,
      sku,
      color: color === undefined ? undefined : color,
      size: size === undefined ? undefined : size,
      pickStatus: "READY",
      packStatus: "READY"
    },
    data: {
      pickStatus: "PICKED"
    }
  });

  await recordAuditLog({
    userId: context.user.id,
    accountId: context.account.id,
    action: "MOBILE_SKU_GROUP_PICKED",
    entityType: "Order",
    metadata: {
      sku,
      color,
      size,
      updatedRows: result.count
    },
    request: getMobileRequestMeta(request)
  });

  revalidatePath("/picker");
  return mobileJson({ ok: true, updatedRows: result.count });
}
