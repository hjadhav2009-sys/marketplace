import { getMobilePermissionAccountContext, mobileJson } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const context = await getMobilePermissionAccountContext(request, "canManageListings");

  if (!context.ok) {
    return context.response;
  }

  const [totalListings, activeListings, missingImageCount, latestListingImport, recentListings] = await Promise.all([
    prisma.marketplaceListing.count({ where: { accountId: context.account.id } }),
    prisma.marketplaceListing.count({ where: { accountId: context.account.id, listingStatus: { in: ["Active", "ACTIVE", "active"] } } }),
    prisma.marketplaceListing.count({
      where: {
        accountId: context.account.id,
        OR: [{ mainImageUrl: null }, { mainImageUrl: "" }]
      }
    }),
    prisma.importJob.findFirst({
      where: { accountId: context.account.id, importType: "FLIPKART_LISTING_MASTER" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, updatedAt: true, totalRows: true }
    }),
    prisma.marketplaceListing.findMany({
      where: { accountId: context.account.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        sku: true,
        productTitle: true,
        listingStatus: true,
        mainImageUrl: true,
        updatedAt: true
      }
    })
  ]);

  return mobileJson({
    ok: true,
    totalListings,
    activeListings,
    missingImageCount,
    latestListingImport,
    recentListings
  });
}
