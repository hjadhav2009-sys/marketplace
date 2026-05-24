"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount, requireUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getRequestMeta } from "@/lib/request-context";

export async function deactivateUserAction(formData: FormData) {
  const owner = await requireUser(["OWNER"]);
  const account = await requireAccount(owner);
  const request = await getRequestMeta();
  const userId = String(formData.get("userId") ?? "");

  if (!userId || userId === owner.id) {
    redirect("/owner/users?error=invalid");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    redirect("/owner/users?error=invalid");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { active: false }
    }),
    prisma.userDeviceSession.updateMany({
      where: { userId: user.id },
      data: { active: false, lastSeenAt: new Date() }
    })
  ]);

  await recordAuditLog({
    userId: owner.id,
    accountId: account.id,
    action: "USER_DEACTIVATED",
    entityType: "User",
    entityId: user.id,
    metadata: { username: user.username },
    request
  });

  revalidatePath("/owner/users");
  redirect("/owner/users?deactivated=1");
}
