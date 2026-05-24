"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function resolveProblemOrderAction(formData: FormData) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const problemId = String(formData.get("problemId") ?? "");

  const problem = await prisma.problemOrder.findFirst({
    where: {
      id: problemId,
      accountId: account.id
    },
    include: {
      order: true
    }
  });

  if (!problem) {
    redirect("/problems?error=invalid");
  }

  await prisma.$transaction([
    prisma.problemOrder.update({
      where: { id: problem.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date()
      }
    }),
    prisma.order.update({
      where: { id: problem.orderId },
      data: {
        status: "READY"
      }
    }),
    prisma.scanLog.create({
      data: {
        accountId: account.id,
        orderId: problem.orderId,
        awb: problem.order.awb,
        outcome: "FOUND",
        scannedById: user.id,
        note: "Problem resolved; order returned to ready queue."
      }
    })
  ]);

  revalidatePath("/problems");
  revalidatePath("/picker");
  redirect("/problems?resolved=1");
}
