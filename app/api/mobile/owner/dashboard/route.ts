import { getMobilePermissionAccountContext, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const context = await getMobilePermissionAccountContext(request, "canViewDashboard");

  if (!context.ok) {
    return context.response;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayReady, packedToday, problemsOpen, oldPending, latestListingImport, latestOrderImport] = await Promise.all([
    prisma.order.count({
      where: {
        accountId: context.account.id,
        packStatus: "READY",
        createdAt: { gte: today }
      }
    }),
    prisma.order.count({
      where: {
        accountId: context.account.id,
        packStatus: "PACKED",
        packedAt: { gte: today }
      }
    }),
    prisma.problemOrder.count({
      where: {
        accountId: context.account.id,
        status: "OPEN"
      }
    }),
    prisma.order.count({
      where: {
        accountId: context.account.id,
        oldPendingReviewStatus: { not: "NONE" }
      }
    }),
    prisma.importJob.findFirst({
      where: {
        accountId: context.account.id,
        importType: "FLIPKART_LISTING_MASTER"
      },
      select: { id: true, status: true, updatedAt: true, totalRows: true },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.importJob.findFirst({
      where: {
        accountId: context.account.id,
        importType: "FLIPKART_ORDER"
      },
      select: { id: true, status: true, updatedAt: true, totalRows: true },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  return mobileJson({
    ok: true,
    account: {
      id: context.account.id,
      companyName: context.account.companyName,
      marketplace: context.account.marketplace,
      name: context.account.accountDisplayName ?? context.account.name,
      code: context.account.accountCode ?? context.account.code
    },
    stats: {
      todayReady,
      packedToday,
      problemsOpen,
      oldPending
    },
    latestImports: {
      listing: latestListingImport,
      orders: latestOrderImport
    }
  });
}
