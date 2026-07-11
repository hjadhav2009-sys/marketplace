import { revalidatePath } from "next/cache";
import { normalizeAwb } from "@/lib/awb";
import {
  getMobilePermissionAccountContext,
  mobileError,
  mobileJson,
  readMobileJsonBody
} from "@/lib/mobile-api";
import { startMobileTiming } from "@/lib/mobile-timing";
import { prisma } from "@/lib/prisma";
import { packCustomerOrderShipmentSafely } from "@/src/lib/workflow/order-pack-scope";

export async function POST(request: Request) {
  const done = startMobileTiming("/api/mobile/packing/confirm");
  const body = await readMobileJsonBody(request);

  if (!body.ok) {
    done({ status: 400 });
    return body.response;
  }

  const context = await getMobilePermissionAccountContext(request, "canPack", body.data.accountId);

  if (!context.ok) {
    done({ status: 403 });
    return context.response;
  }

  const orderId = String(body.data.orderId ?? "").trim();
  const code = normalizeAwb(body.data.code);
  const target = orderId
    ? await prisma.order.findFirst({
        where: {
          id: orderId,
          accountId: context.account.id
        }
      })
    : code
      ? await prisma.order.findFirst({
          where: {
            accountId: context.account.id,
            OR: [{ trackingId: code }, { awb: code }]
          },
          orderBy: [{ trackingId: "desc" }, { createdAt: "desc" }]
        })
      : null;

  if (!target) {
    done({ status: 404 });
    return mobileError("not_found", "No order found for packing.", 404);
  }

  let result: Awaited<ReturnType<typeof packCustomerOrderShipmentSafely>>;
  try {
    result = await packCustomerOrderShipmentSafely({ actorUserId: context.user.id, accountId: context.account.id, orderId: target.id, source: "mobile-api", clientRequestId: String(body.data.clientRequestId ?? "") });
  } catch (cause) {
    done({ status: 409 });
    return mobileError("packing_blocked", cause instanceof Error ? cause.message : "Packing is not available for this shipment.", 409);
  }

  revalidatePath("/packing");
  revalidatePath("/picker");
  done({ status: 200, packed: result.packedCount, skipped: result.skippedCount });
  return mobileJson({ ok: true, ...result });
}
