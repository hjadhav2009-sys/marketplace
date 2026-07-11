import type { Prisma, PrismaClient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Client = PrismaClient | Prisma.TransactionClient;

export async function assertWorkerAccountAccess(userId: string, accountId: string, client: Client = prisma) {
  const user = await client.user.findUnique({
    where: { id: userId },
    include: { assignedAccounts: { where: { id: accountId, active: true }, select: { id: true } }, account: { select: { id: true, active: true } } }
  });
  if (!user?.active) throw new Error("Worker account is unavailable.");
  const account = await client.account.findFirst({ where: { id: accountId, active: true }, select: { id: true } });
  if (!account) throw new Error("Selected account is unavailable.");
  if (user.role !== "OWNER" && !user.assignedAccounts.some((item) => item.id === accountId) && !(user.accountId === accountId && user.account?.active)) throw new Error("Worker is not assigned to the selected account.");
  return { user, account };
}

export function stagePermissionField(stage: "PICK" | "MARK" | "ASSEMBLE" | "PACK") {
  if (stage === "PICK") return "canPick" as const;
  if (stage === "MARK") return "canMark" as const;
  if (stage === "ASSEMBLE") return "canAssemble" as const;
  return "canPack" as const;
}

export function userCanMutateStage(user: Pick<User, "role" | "canPick" | "canMark" | "canAssemble" | "canPack">, stage: "PICK" | "MARK" | "ASSEMBLE" | "PACK") {
  if (user.role === "OWNER") return true;
  if (stage === "PICK" && user.role === "PICKER") return true;
  if (stage === "PACK" && user.role === "PACKER") return true;
  return user[stagePermissionField(stage)];
}

export function userCanManageConsignmentTasks(user: Pick<User, "role" | "canManageConsignments">) {
  return user.role === "OWNER" || user.canManageConsignments;
}
