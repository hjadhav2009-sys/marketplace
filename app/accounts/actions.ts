"use server";

import { redirect } from "next/navigation";
import { capabilityHomePath, requireUser, setSelectedAccount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountSelectionSchema } from "@/lib/validators";

export async function selectAccountAction(formData: FormData) {
  const user = await requireUser();
  const parsed = accountSelectionSchema.safeParse({
    accountId: formData.get("accountId")
  });

  if (!parsed.success) {
    redirect("/accounts?error=missing");
  }

  const account = await prisma.account.findFirst({
    where: {
      id: parsed.data.accountId,
      active: true,
      OR:
        user.role === "OWNER"
          ? undefined
          : [
              { users: { some: { id: user.id } } },
              { assignedUsers: { some: { id: user.id } } }
            ]
    }
  });

  if (!account) {
    redirect("/accounts?error=not-found");
  }

  await setSelectedAccount(account.id);
  redirect(capabilityHomePath(user));
}
