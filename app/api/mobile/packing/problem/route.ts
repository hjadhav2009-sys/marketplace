import { revalidatePath } from "next/cache";
import { normalizeAwb } from "@/lib/awb";
import { recordAuditLog } from "@/lib/audit";
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

  const context = await getMobileAccountContext(request, ["OWNER", "PACKER"], body.data.accountId);

  if (!context.ok) {
    return context.response;
  }

  const orderId = String(body.data.orderId ?? "").trim();
  const code = normalizeAwb(body.data.code);
  const reason = String(body.data.reason ?? "").trim();
  const details = String(body.data.details ?? "").trim() || undefined;

  if (reason.length < 3) {
    return mobileError("invalid_problem", "A clear reason is required.", 400);
  }

  const order = orderId
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
          orderBy: { createdAt: "desc" }
        })
      : null;

  if (!order) {
    return mobileError("not_found", "No order found for problem reporting.", 404);
  }

  if (order.packStatus === "PACKED") {
    return mobileError("already_packed", "Already packed items cannot be marked as problem from mobile.", 409);
  }

  const existingProblem = await prisma.problemOrder.findFirst({
    where: {
      accountId: context.account.id,
      orderId: order.id,
      status: "OPEN"
    }
  });

  if (existingProblem) {
    return mobileJson({ ok: true, existing: true, problemId: existingProblem.id });
  }

  const problem = await prisma.$transaction(async (tx) => {
    const created = await tx.problemOrder.create({
      data: {
        accountId: context.account.id,
        orderId: order.id,
        reason,
        details,
        reportedById: context.user.id
      }
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PROBLEM",
        pickStatus: "PROBLEM",
        packStatus: "PROBLEM"
      }
    });

    await tx.scanLog.create({
      data: {
        accountId: context.account.id,
        orderId: order.id,
        awb: order.trackingId ?? order.awb,
        outcome: "PROBLEM",
        scannedById: context.user.id,
        note: reason
      }
    });

    return created;
  });

  await recordAuditLog({
    userId: context.user.id,
    accountId: context.account.id,
    action: "MOBILE_PROBLEM_ORDER_CREATED",
    entityType: "Order",
    entityId: order.id,
    metadata: { awb: order.awb, trackingId: order.trackingId, reason },
    request: getMobileRequestMeta(request)
  });

  revalidatePath("/packing");
  revalidatePath("/problems");
  return mobileJson({ ok: true, existing: false, problemId: problem.id });
}
