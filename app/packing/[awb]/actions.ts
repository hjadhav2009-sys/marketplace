"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { problemOrderSchema } from "@/lib/validators";

export async function confirmPackedAction(formData: FormData) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
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

  if (order.status !== "READY") {
    redirect(`/packing/${encodeURIComponent(order.awb)}`);
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PACKED",
        packedAt: new Date()
      }
    }),
    prisma.scanLog.create({
      data: {
        accountId: account.id,
        orderId: order.id,
        awb: order.awb,
        outcome: "PACKED",
        scannedById: user.id,
        note: "Packer confirmed order as packed."
      }
    })
  ]);

  revalidatePath("/picker");
  revalidatePath("/packing");
  redirect(`/packing/${encodeURIComponent(order.awb)}?packed=1`);
}

export async function reportProblemFromScanAction(formData: FormData) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
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
      data: { status: "PROBLEM" }
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

  revalidatePath("/problems");
  revalidatePath("/picker");
  redirect(`/packing/${encodeURIComponent(order.awb)}?problem=1`);
}
