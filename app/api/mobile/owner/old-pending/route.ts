import { getMobilePermissionAccountContext, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const context = await getMobilePermissionAccountContext(request, "canReviewOldPending");

  if (!context.ok) {
    return context.response;
  }

  const [total, statusGroups, orders] = await Promise.all([
    prisma.order.count({
      where: {
        accountId: context.account.id,
        oldPendingReviewStatus: { not: "NONE" }
      }
    }),
    prisma.order.groupBy({
      by: ["oldPendingReviewStatus"],
      where: {
        accountId: context.account.id,
        oldPendingReviewStatus: { not: "NONE" }
      },
      _count: { _all: true }
    }),
    prisma.order.findMany({
      where: {
        accountId: context.account.id,
        oldPendingReviewStatus: { not: "NONE" }
      },
      orderBy: { importedAt: "asc" },
      take: 25,
      select: {
        id: true,
        marketplace: true,
        sku: true,
        qty: true,
        trackingId: true,
        awb: true,
        packStatus: true,
        pickStatus: true,
        oldPendingReviewStatus: true,
        importedAt: true
      }
    })
  ]);

  return mobileJson({
    ok: true,
    total,
    statusGroups: statusGroups.map((group) => ({ status: group.oldPendingReviewStatus, count: group._count._all })),
    orders
  });
}
