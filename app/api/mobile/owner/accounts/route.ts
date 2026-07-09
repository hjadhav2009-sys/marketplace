import { getMobilePermissionUser, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await getMobilePermissionUser("canManageAccounts");

  if (!auth.ok) {
    return auth.response;
  }

  const accounts = await prisma.account.findMany({
    orderBy: [{ marketplace: "asc" }, { accountDisplayName: "asc" }, { name: "asc" }],
    select: {
      id: true,
      companyName: true,
      marketplace: true,
      accountDisplayName: true,
      accountCode: true,
      name: true,
      code: true,
      active: true,
      _count: {
        select: {
          assignedUsers: true,
          orders: true,
          marketplaceListings: true,
          importJobs: true
        }
      }
    }
  });

  return mobileJson({
    ok: true,
    accounts: accounts.map((account) => ({
      id: account.id,
      companyName: account.companyName,
      marketplace: account.marketplace,
      name: account.accountDisplayName ?? account.name,
      code: account.accountCode ?? account.code,
      active: account.active,
      users: account._count.assignedUsers,
      orders: account._count.orders,
      listings: account._count.marketplaceListings,
      imports: account._count.importJobs
    }))
  });
}
