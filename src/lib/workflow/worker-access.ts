import type { Prisma, PrismaClient, User } from "@prisma/client";
import { hasWorkPermission } from "@/lib/work-permissions";
import { prisma } from "@/lib/prisma";

type Client = PrismaClient | Prisma.TransactionClient;

export async function assertWorkerAccountAccess(userId: string, accountId: string, client: Client = prisma) {
  const user = await client.user.findUnique({
    where: { id: userId },
    include: { assignedAccounts: { where: { id: accountId, active: true }, select: { id: true } }, account: { select: { id: true, active: true } } }
  });
  if (!user?.active) throw new Error("Worker account is unavailable.");
  const account = await client.account.findFirst({ where: { id: accountId, active: true }, select: { id: true, marketplace: true } });
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
  return hasWorkPermission(user, stagePermissionField(stage));
}

export function userCanManageConsignmentTasks(user: Pick<User, "role" | "canManageConsignments">) {
  return user.role === "OWNER" || user.canManageConsignments;
}

export function userCanViewAllConsignmentWork(user: Pick<User, "role" | "canViewAllWork" | "canManageConsignments">) {
  return user.role === "OWNER" || user.canViewAllWork || user.canManageConsignments;
}

export function userCanResolveConsignmentProblems(user: Pick<User, "role" | "canManageConsignments">) {
  return user.role === "OWNER" || user.canManageConsignments;
}

export function getWorkTaskCapabilities(user: Pick<User, "id" | "role" | "canPick" | "canMark" | "canAssemble" | "canPack" | "canReportProblem" | "canManageConsignments">, task: { stage: "PICK" | "MARK" | "ASSEMBLE" | "PACK"; status: string; assignedUserId: string | null }) {
  const hasStagePermission=userCanMutateStage(user,task.stage);
  const assignmentAllowsMutation=user.role==="OWNER"||!task.assignedUserId||task.assignedUserId===user.id;
  const canProgress=hasStagePermission&&assignmentAllowsMutation&&["READY","IN_PROGRESS"].includes(task.status);
  return {hasStagePermission,assignmentAllowsMutation,canProgress,canClaim:canProgress&&task.status==="READY"&&!task.assignedUserId,canReportProblem:canProgress&&(user.role==="OWNER"||user.canReportProblem),canManage:userCanManageConsignmentTasks(user),readOnly:!canProgress};
}
