import { getMobilePermissionAccountContext, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const context = await getMobilePermissionAccountContext(request, "canViewReports");
  if (!context.ok) {
    return context.response;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalOrders,
    todayReady,
    todayPicked,
    todayPacked,
    openProblems,
    oldPending,
    skuGroups,
    courierGroups
  ] = await Promise.all([
    prisma.order.count({ where: { accountId: context.account.id } }),
    prisma.order.count({ where: { accountId: context.account.id, packStatus: "READY", createdAt: { gte: today } } }),
    prisma.order.count({ where: { accountId: context.account.id, pickStatus: "PICKED", updatedAt: { gte: today } } }),
    prisma.order.count({ where: { accountId: context.account.id, packStatus: "PACKED", packedAt: { gte: today } } }),
    prisma.problemOrder.count({ where: { accountId: context.account.id, status: "OPEN" } }),
    prisma.order.count({ where: { accountId: context.account.id, oldPendingReviewStatus: { not: "NONE" } } }),
    prisma.order.groupBy({
      by: ["sku"],
      where: { accountId: context.account.id },
      _sum: { qty: true },
      _count: { _all: true },
      orderBy: { _count: { sku: "desc" } },
      take: 8
    }),
    prisma.order.groupBy({
      by: ["courier"],
      where: { accountId: context.account.id },
      _sum: { qty: true },
      _count: { _all: true },
      orderBy: { _count: { courier: "desc" } },
      take: 8
    })
  ]);

  const orderSkuRows = await prisma.order.findMany({
    where: { accountId: context.account.id },
    distinct: ["sku"],
    select: { sku: true }
  });
  const orderSkus = orderSkuRows.map((row) => row.sku);
  const listingsBySku = new Map<string, { mainImageUrl: string | null }>();

  for (let index = 0; index < orderSkus.length; index += 500) {
    const skuChunk = orderSkus.slice(index, index + 500);
    const listingRows = await prisma.marketplaceListing.findMany({
      where: {
        accountId: context.account.id,
        sku: { in: skuChunk }
      },
      select: { sku: true, mainImageUrl: true }
    });

    for (const listing of listingRows) {
      listingsBySku.set(listing.sku, { mainImageUrl: listing.mainImageUrl });
    }
  }

  const missingListingCurrent = orderSkus.filter((sku) => !listingsBySku.has(sku)).length;
  const missingImageCurrent = orderSkus.filter((sku) => {
    const listing = listingsBySku.get(sku);
    return listing ? !listing.mainImageUrl : false;
  }).length;

  return mobileJson({
    ok: true,
    summary: {
      totalOrders,
      todayReady,
      todayPicked,
      todayPacked,
      openProblems,
      oldPending,
      missingListingCurrent,
      missingImageCurrent
    },
    skuSummary: skuGroups.map((row) => ({ sku: row.sku, orders: row._count._all, qty: row._sum.qty ?? 0 })),
    courierSummary: courierGroups.map((row) => ({ courier: row.courier ?? "Unknown", orders: row._count._all, qty: row._sum.qty ?? 0 }))
  });
}
