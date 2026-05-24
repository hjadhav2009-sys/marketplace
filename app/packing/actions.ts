"use server";

import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { getOrderByAwb } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { awbSearchSchema } from "@/lib/validators";

export async function searchAwbAction(formData: FormData) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const parsed = awbSearchSchema.safeParse({
    awb: formData.get("awb")
  });

  if (!parsed.success) {
    redirect("/packing?error=invalid");
  }

  const order = await getOrderByAwb(account, parsed.data.awb);

  await prisma.scanLog.create({
    data: {
      accountId: account.id,
      orderId: order?.id,
      awb: parsed.data.awb,
      outcome: order ? "FOUND" : "NOT_FOUND",
      scannedById: user.id,
      note: order ? "AWB lookup matched an order." : "AWB lookup did not match an order."
    }
  });

  if (!order) {
    redirect(`/packing?notFound=${encodeURIComponent(parsed.data.awb)}`);
  }

  redirect(`/packing/${encodeURIComponent(order.awb)}`);
}
