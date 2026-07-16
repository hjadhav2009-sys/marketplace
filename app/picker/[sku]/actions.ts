"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { decodePickerDimension, pickerDetailPath } from "@/lib/operations/picking";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";
import { hasWorkPermission } from "@/lib/work-permissions";
import { completePickWithNextRoute } from "@/src/lib/workflow/route-selection";

function groupWhere(accountId: string, formData: FormData) {
  const sku = String(formData.get("sku") ?? "").trim();
  const color = decodePickerDimension(String(formData.get("color") ?? ""));
  const size = decodePickerDimension(String(formData.get("size") ?? ""));

  if (!sku) {
    redirect("/picker?error=invalid");
  }

  return {
    sku,
    color,
    size,
    where: {
      accountId,
      sku,
      color: color === undefined ? undefined : color,
      size: size === undefined ? undefined : size,
      packStatus: {
        not: "PACKED" as const
      }
    }
  };
}

export async function markSkuGroupPickedAction(formData: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPick")) redirect("/dashboard");
  const group = groupWhere(account.id, formData);
  const orders = await prisma.order.findMany({ where: group.where, select: { id: true } });
  const result = await completePickWithNextRoute({ sourceType:"ORDER", actorUserId: user.id, accountId: account.id, orderIds: orders.map((order) => order.id), route: String(formData.get("route") ?? ""), clientRequestId: String(formData.get("clientRequestId") ?? "") || undefined });

  revalidatePath("/picker");
  redirect(`${pickerDetailPath(group.sku, group.color, group.size)}&picked=${result.updatedCount > 0 ? "1" : "already"}`);
}

export async function markSkuGroupPickedInlineAction(formData: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPick")) return { ok: false, updatedRows: 0 };
  const group = groupWhere(account.id, formData);
  return { ok: false, updatedRows: 0, error: `Open ${pickerDetailPath(group.sku, group.color, group.size)} to choose the next route.` };
}

export async function markSkuGroupProblemAction(formData: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPick")) redirect("/dashboard");
  const request = await getRequestMeta();
  const group = groupWhere(account.id, formData);
  const reason = String(formData.get("reason") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim() || undefined;

  if (reason.length < 3) {
    redirect(`${pickerDetailPath(group.sku, group.color, group.size)}&error=problem`);
  }

  const orders = await prisma.order.findMany({
    where: group.where,
    select: { id: true, awb: true }
  });

  if (orders.length === 0) {
    redirect("/picker?error=invalid");
  }

  const existingProblems = await prisma.problemOrder.findMany({
    where: {
      accountId: account.id,
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
      where: group.where,
      data: {
        status: "PROBLEM",
        pickStatus: "PROBLEM",
        packStatus: "PROBLEM"
      }
    });

    for (const order of ordersNeedingProblems) {
      await tx.problemOrder.create({
        data: {
          accountId: account.id,
          orderId: order.id,
          reason,
          details,
          reportedById: user.id
        }
      });
    }
  });

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "PICK_PROBLEM_CREATED",
    entityType: "Order",
    metadata: {
      sku: group.sku,
      color: group.color,
      size: group.size,
      reason,
      affectedOrders: orders.length,
      createdProblems: ordersNeedingProblems.length
    },
    request
  });

  revalidatePath("/picker");
  revalidatePath("/problems");
  redirect(`${pickerDetailPath(group.sku, group.color, group.size)}&problem=1`);
}

export async function markSkuGroupProblemInlineAction(formData: FormData) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPick")) return { ok: false, error: "Picking permission is required." };
  const request = await getRequestMeta();
  const group = groupWhere(account.id, formData);
  const reason = String(formData.get("reason") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim() || undefined;

  if (reason.length < 3) {
    return { ok: false, error: "Add a clear reason." };
  }

  const orders = await prisma.order.findMany({
    where: group.where,
    select: { id: true, awb: true }
  });

  if (orders.length === 0) {
    return { ok: false, error: "No active orders found for this SKU group." };
  }

  const existingProblems = await prisma.problemOrder.findMany({
    where: {
      accountId: account.id,
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
      where: group.where,
      data: {
        status: "PROBLEM",
        pickStatus: "PROBLEM",
        packStatus: "PROBLEM"
      }
    });

    for (const order of ordersNeedingProblems) {
      await tx.problemOrder.create({
        data: {
          accountId: account.id,
          orderId: order.id,
          reason,
          details,
          reportedById: user.id
        }
      });
    }
  });

  await recordAuditLog({
    userId: user.id,
    accountId: account.id,
    action: "PICK_PROBLEM_CREATED",
    entityType: "Order",
    metadata: {
      sku: group.sku,
      color: group.color,
      size: group.size,
      reason,
      affectedOrders: orders.length,
      createdProblems: ordersNeedingProblems.length,
      source: "picker-card"
    },
    request
  });

  revalidatePath("/picker");
  revalidatePath("/problems");
  return { ok: true, affectedOrders: orders.length, createdProblems: ordersNeedingProblems.length };
}
