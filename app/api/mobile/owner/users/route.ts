import { getMobilePermissionUser, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await getMobilePermissionUser("canManageUsers");

  if (!auth.ok) {
    return auth.response;
  }

  const [users, resetRequests] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ active: "desc" }, { role: "asc" }, { username: "asc" }],
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        active: true,
        canPick: true,
        canPack: true,
        canReportProblem: true,
        mustChangePassword: true,
        lastLoginAt: true,
        assignedAccounts: {
          select: {
            id: true,
            companyName: true,
            marketplace: true,
            accountDisplayName: true,
            name: true
          }
        }
      }
    }),
    prisma.passwordResetRequest.groupBy({
      by: ["userId"],
      where: { status: "OPEN" },
      _count: { _all: true }
    })
  ]);

  const openResetRequests = new Map(resetRequests.map((request) => [request.userId, request._count._all]));

  return mobileJson({
    ok: true,
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      active: user.active,
      canPick: user.canPick,
      canPack: user.canPack,
      canReportProblem: user.canReportProblem,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      openPasswordResetRequests: openResetRequests.get(user.id) ?? 0,
      assignedAccounts: user.assignedAccounts.map((account) => ({
        id: account.id,
        companyName: account.companyName,
        marketplace: account.marketplace,
        name: account.accountDisplayName ?? account.name
      }))
    }))
  });
}
