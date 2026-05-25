"use server";

import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { normalizeAwb, isValidAwb } from "@/lib/awb";
import { getOrderByAwb, searchOrdersByAwbFragment } from "@/lib/data";
import { prisma } from "@/lib/prisma";

export async function searchAwbAction(formData: FormData) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const query = normalizeAwb(formData.get("awb"));

  if (query.length < 5) {
    redirect("/packing?error=invalid");
  }

  const order = isValidAwb(query)
    ? await getOrderByAwb(account, query)
    : null;
  const matches = order ? [order] : await searchOrdersByAwbFragment(account.id, query, 10);

  if (!order && matches.length !== 1) {
    if (matches.length > 1) {
      redirect(`/packing?q=${encodeURIComponent(query)}&multiple=1`);
    }

    await prisma.scanLog.create({
      data: {
        accountId: account.id,
        awb: query,
        outcome: "NOT_FOUND",
        scannedById: user.id,
        note: "AWB lookup did not match an order."
      }
    });

    redirect(`/packing?notFound=${encodeURIComponent(query)}`);
  }

  const matchedOrder = order ?? matches[0];

  if (!matchedOrder) {
    redirect(`/packing?notFound=${encodeURIComponent(query)}`);
  }

  await prisma.scanLog.create({
    data: {
      accountId: account.id,
      orderId: matchedOrder.id,
      awb: matchedOrder.awb,
      outcome: "FOUND",
      scannedById: user.id,
      note: query === matchedOrder.awb ? "AWB lookup matched an order." : `Partial AWB lookup "${query}" matched an order.`
    }
  });

  redirect(`/packing/${encodeURIComponent(matchedOrder.awb)}`);
}
