import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@/lib/audit";
import { decodePickerDimension } from "@/lib/operations/picking";
import {
  getMobilePermissionAccountContext,
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

  const context = await getMobilePermissionAccountContext(request, "canReportProblem", body.data.accountId);

  if (!context.ok) {
    return context.response;
  }

  const sku = String(body.data.sku ?? "").trim();
  const reason = String(body.data.reason ?? "").trim();
  const details = String(body.data.details ?? "").trim() || undefined;

  if (!sku || reason.length < 3) {
    return mobileError("invalid_problem", "SKU and a clear reason are required.", 400);
  }

  const color = decodePickerDimension(String(body.data.color ?? ""));
  const size = decodePickerDimension(String(body.data.size ?? ""));
  const groupWhere = {
    accountId: context.account.id,
    sku,
    color: color === undefined ? undefined : color,
    size: size === undefined ? undefined : size,
    packStatus: {
      not: "PACKED" as const
    }
  };
  const orders = await prisma.order.findMany({
    where: groupWhere,
    select: { id: true }
  });

  if (orders.length === 0) {
    return mobileError("not_found", "No active orders found for this SKU group.", 404);
  }

  const existingProblems = await prisma.problemOrder.findMany({
    where: {
      accountId: context.account.id,
      orderId: {
        in: orders.map((order) => order.id)
      },
      status: "OPEN"
    },
    select: { orderId: true }
  });
  const existingOrderIds = new Set(existingProblems.map((problem) => problem.orderId));
  const ordersNeedingProblems = orders.filter((order) => !existingOrderIds.has(order.id));

  await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: groupWhere,
      data: {
        status: "PROBLEM",
        pickStatus: "PROBLEM",
        packStatus: "PROBLEM"
      }
    });

    for (const order of ordersNeedingProblems) {
      await tx.problemOrder.create({
        data: {
          accountId: context.account.id,
          orderId: order.id,
          reason,
          details,
          reportedById: context.user.id
        }
      });
    }
  });

  await recordAuditLog({
    userId: context.user.id,
    accountId: context.account.id,
    action: "MOBILE_PICK_PROBLEM_CREATED",
    entityType: "Order",
    metadata: {
      sku,
      color,
      size,
      reason,
      affectedOrders: orders.length,
      createdProblems: ordersNeedingProblems.length
    },
    request: getMobileRequestMeta(request)
  });

  revalidatePath("/picker");
  revalidatePath("/problems");
  return mobileJson({ ok: true, affectedOrders: orders.length, createdProblems: ordersNeedingProblems.length });
}
