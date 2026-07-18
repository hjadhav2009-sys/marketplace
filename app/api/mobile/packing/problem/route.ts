import { revalidatePath } from "next/cache";
import { normalizeAwb } from "@/lib/awb";
import {
  getMobilePermissionAccountContext,
  mobileError,
  mobileJson,
  readMobileJsonBody
} from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";
import { reportOrderWorkflowProblem } from "@/src/lib/workflow/order-problems";

export async function POST(request: Request) {
  const body = await readMobileJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const context = await getMobilePermissionAccountContext(request, "canReportProblem", body.data.accountId);

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

  let result;
  try {
    result = await reportOrderWorkflowProblem({
      actorUserId: context.user.id,
      accountId: context.account.id,
      orderId: order.id,
      stage: "PACK",
      reason,
      note: details,
      clientRequestId: String(body.data.clientRequestId ?? "")
    });
  } catch (cause) {
    return mobileError("problem_rejected", cause instanceof Error ? cause.message : "Problem could not be saved.", 409);
  }

  revalidatePath("/packing");
  revalidatePath("/problems");
  return mobileJson({ ok: true, existing: result.idempotent, problemId: result.problemId });
}
