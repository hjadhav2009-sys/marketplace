"use server";

import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function markProductImageBrokenAction(mappingId: string) {
  const user = await requireUser(["OWNER", "PICKER", "PACKER"]);
  const account = await requireAccount(user);

  await prisma.skuImageMapping.updateMany({
    where: {
      id: mappingId,
      accountId: account.id
    },
    data: {
      imageHealth: "BROKEN"
    }
  });
}

export async function markProductImageMappedAction(mappingId: string) {
  const user = await requireUser(["OWNER", "PICKER", "PACKER"]);
  const account = await requireAccount(user);

  await prisma.skuImageMapping.updateMany({
    where: {
      id: mappingId,
      accountId: account.id
    },
    data: {
      imageHealth: "MAPPED"
    }
  });
}
