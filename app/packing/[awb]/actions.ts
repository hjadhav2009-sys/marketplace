"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { canConfirmPacked } from "@/lib/operations/packing";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { problemOrderSchema } from "@/lib/validators";

export async function confirmPackedAction(formData: FormData) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const orderId = String(formData.get("orderId") ?? "");

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      accountId: account.id
    }
  });

  if (!order) {
    redirect("/packing?error=invalid");
  }

  if (!canConfirmPacked(order)) {
    redirect(`/packing/${encodeURIComponent(order.awb)}?packed=already`);
  }

  const packed = await prisma.$transaction(async (tx) => {
    const update = await tx.order.updateMany({
      where: {
        id: order.id,
        accountId: account.id,
        packStatus: "READY"
      },
      data: {
        status: "PACKED",
        packStatus: "PACKED",
        packedAt: new Date()
      }
    });

    if (update.count === 0) {
      return false;
    }

    await tx.scanLog.create({
      data: {
        accountId: account.id,
        orderId: order.id,
        awb: order.awb,
        outcome: "PACKED",
        scannedById: user.id,
        note: "Packer confirmed order as packed."
      }
    });

    return true;
  });

  if (!packed) {
    redirect(`/packing/${encodeURIComponent(order.awb)}?packed=already`);
  }

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "ORDER_PACKED",
    entityType: "Order",
    entityId: order.id,
    metadata: { awb: order.awb },
    request
  });

  revalidatePath("/picker");
  revalidatePath("/packing");
  redirect(`/packing/${encodeURIComponent(order.awb)}?packed=1`);
}

export async function reportProblemFromScanAction(formData: FormData) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const request = await getRequestMeta();
  const parsed = problemOrderSchema.safeParse({
    orderId: formData.get("orderId"),
    reason: formData.get("reason"),
    details: formData.get("details") || undefined
  });

  if (!parsed.success) {
    redirect("/packing?error=invalid");
  }

  const order = await prisma.order.findFirst({
    where: {
      id: parsed.data.orderId,
      accountId: account.id
    }
  });

  if (!order) {
    redirect("/packing?error=invalid");
  }

  if (order.packStatus === "PACKED") {
    redirect(`/packing/${encodeURIComponent(order.awb)}?packed=already`);
  }

  const existingProblem = await prisma.problemOrder.findFirst({
    where: {
      accountId: account.id,
      orderId: order.id,
      status: "OPEN"
    }
  });

  if (existingProblem) {
    redirect(`/packing/${encodeURIComponent(order.awb)}?problem=existing`);
  }

  await prisma.$transaction([
    prisma.problemOrder.create({
      data: {
        accountId: account.id,
        orderId: order.id,
        reason: parsed.data.reason,
        details: parsed.data.details,
        reportedById: user.id
      }
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { status: "PROBLEM", packStatus: "PROBLEM", pickStatus: "PROBLEM" }
    }),
    prisma.scanLog.create({
      data: {
        accountId: account.id,
        orderId: order.id,
        awb: order.awb,
        outcome: "PROBLEM",
        scannedById: user.id,
        note: parsed.data.reason
      }
    })
  ]);

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "PROBLEM_ORDER_CREATED",
    entityType: "Order",
    entityId: order.id,
    metadata: { awb: order.awb, reason: parsed.data.reason },
    request
  });

  revalidatePath("/problems");
  revalidatePath("/picker");
  redirect(`/packing/${encodeURIComponent(order.awb)}?problem=1`);
}
