import { revalidatePath } from "next/cache";
import { normalizeAwb } from "@/lib/awb";
import { recordAuditLog } from "@/lib/audit";
import { buildConfirmPackedOrderWhere } from "@/lib/operations/packing";
import {
  getMobilePermissionAccountContext,
  getMobileRequestMeta,
  mobileError,
  mobileJson,
  readMobileJsonBody
} from "@/lib/mobile-api";
import { startMobileTiming } from "@/lib/mobile-timing";
import { prisma } from "@/lib/prisma";

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

  const result = await prisma.$transaction(async (tx) => {
    const scopeWhere =
      target.marketplace === "FLIPKART" && target.trackingId
        ? {
            accountId: context.account.id,
            marketplace: "FLIPKART",
            trackingId: target.trackingId
          }
        : {
            id: target.id,
            accountId: context.account.id
          };
    const scopedOrders = await tx.order.findMany({
      where: scopeWhere,
      select: {
        id: true,
        awb: true,
        trackingId: true,
        packStatus: true
      }
    });
    const readyOrders = scopedOrders.filter((order) => order.packStatus === "READY");
    const update = await tx.order.updateMany({
      where: buildConfirmPackedOrderWhere(target, context.account.id),
      data: {
        status: "PACKED",
        packStatus: "PACKED",
        packedAt: new Date()
      }
    });

    if (readyOrders.length > 0 && update.count > 0) {
      await tx.scanLog.createMany({
        data: readyOrders.map((order) => ({
          accountId: context.account.id,
          orderId: order.id,
          awb: order.trackingId ?? order.awb,
          outcome: "PACKED",
          scannedById: context.user.id,
          note: readyOrders.length > 1 ? "Mobile app confirmed Flipkart shipment as packed." : "Mobile app confirmed order as packed."
        }))
      });
    }

    return {
      packedCount: update.count,
      skippedCount: Math.max(0, scopedOrders.length - update.count),
      scopedCount: scopedOrders.length
    };
  });

  await recordAuditLog({
    userId: context.user.id,
    accountId: context.account.id,
    action: "MOBILE_ORDER_PACKED",
    entityType: "Order",
    entityId: target.id,
    metadata: {
      awb: target.awb,
      trackingId: target.trackingId,
      packedCount: result.packedCount,
      skippedCount: result.skippedCount
    },
    request: getMobileRequestMeta(request)
  });

  revalidatePath("/packing");
  revalidatePath("/picker");
  done({ status: 200, packed: result.packedCount, skipped: result.skippedCount });
  return mobileJson({ ok: true, ...result });
}
