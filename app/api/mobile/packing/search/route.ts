import { normalizeAwb } from "@/lib/awb";
import { cachedProductImageUrl } from "@/lib/image-cache";
import {
  checkMobileRateLimit,
  getMobilePermissionAccountContext,
  mobileError,
  mobileJson
} from "@/lib/mobile-api";
import { startMobileTiming } from "@/lib/mobile-timing";
import { prisma } from "@/lib/prisma";
import { normalizeSkuForMatching } from "@/lib/sku";
import type { MobilePackingSearchResult } from "@/src/lib/mobile-api/types";

async function hydrateResults(accountId: string, orders: Array<{
  id: string;
  awb: string;
  marketplace: string;
  trackingId: string | null;
  sku: string;
  qty: number;
  color: string | null;
  size: string | null;
  courier: string | null;
  packStatus: string;
}>) {
  const skus = Array.from(new Set(orders.flatMap((order) => [order.sku, normalizeSkuForMatching(order.sku)].filter(Boolean))));
  const [mappings, listings] =
    skus.length > 0
      ? await Promise.all([
          prisma.skuImageMapping.findMany({
            where: {
              accountId,
              active: true,
              sku: { in: skus }
            },
            select: {
              accountId: true,
              sku: true,
              imageUrl: true,
              cacheStatus: true,
              cacheFilePath: true,
              cacheOriginalImageUrl: true,
              cacheCachedAt: true
            }
          }),
          prisma.marketplaceListing.findMany({
            where: {
              accountId,
              marketplace: "FLIPKART",
              sku: { in: skus }
            },
            select: {
              sku: true,
              productTitle: true,
              liveTitle: true,
              mainImageUrl: true
            }
          })
        ])
      : [[], []];
  const listingBySku = new Map(listings.map((listing) => [normalizeSkuForMatching(listing.sku), listing]));
  const mappingBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping]));

  return orders.map((order): MobilePackingSearchResult => {
    const normalizedSku = normalizeSkuForMatching(order.sku);
    const listing = listingBySku.get(normalizedSku);
    const mapping = mappingBySku.get(normalizedSku);

    return {
      orderId: order.id,
      awb: order.awb,
      trackingId: order.trackingId,
      marketplace: order.marketplace,
      sku: order.sku,
      title: listing?.productTitle ?? listing?.liveTitle ?? null,
      qty: order.qty,
      color: order.color,
      size: order.size,
      courier: order.courier,
      packStatus: order.packStatus,
      canPack: order.packStatus === "READY",
      mainImageUrl: (mapping ? cachedProductImageUrl(mapping) : null) ?? listing?.mainImageUrl ?? mapping?.imageUrl ?? null,
      cacheStatus: mapping?.cacheStatus ?? null
    };
  });
}

export async function GET(request: Request) {
  const done = startMobileTiming("/api/mobile/packing/search");
  const limited = checkMobileRateLimit(request, "mobile-packing-search", 60, 60_000);

  if (limited) {
    done({ status: 429 });
    return limited;
  }

  const context = await getMobilePermissionAccountContext(request, "canPack");

  if (!context.ok) {
    done({ status: 403 });
    return context.response;
  }

  const url = new URL(request.url);
  const code = normalizeAwb(url.searchParams.get("code"));

  if (code.length < 5) {
    done({ status: 400 });
    return mobileError("invalid_code", "Scan or enter a valid Tracking ID or AWB.", 400);
  }

  const select = {
    id: true,
    awb: true,
    marketplace: true,
    trackingId: true,
    sku: true,
    qty: true,
    color: true,
    size: true,
    courier: true,
    packStatus: true
  } as const;
  let matchMode: "tracking" | "awb" | "partial" | "none" = "none";
  let orders = await prisma.order.findMany({
    where: {
      accountId: context.account.id,
      trackingId: code
    },
    select,
    orderBy: [{ packStatus: "asc" }, { sku: "asc" }],
    take: 50
  });

  if (orders.length > 0) {
    matchMode = "tracking";
  } else {
    const awbMatch = await prisma.order.findFirst({
      where: {
        accountId: context.account.id,
        awb: code
      },
      select,
      orderBy: { createdAt: "desc" }
    });

    if (awbMatch) {
      matchMode = "awb";
      orders = [awbMatch];
    } else {
      matchMode = "partial";
      orders = await prisma.order.findMany({
        where: {
          accountId: context.account.id,
          OR: [
            { awb: { endsWith: code } },
            { trackingId: { endsWith: code } },
            { awb: { contains: code } },
            { trackingId: { contains: code } }
          ]
        },
        select,
        orderBy: { createdAt: "desc" },
        take: 10
      });
    }
  }

  await prisma.scanLog.create({
    data: {
      accountId: context.account.id,
      orderId: orders[0]?.id,
      awb: orders[0]?.trackingId ?? orders[0]?.awb ?? code,
      outcome: orders.length > 0 ? "FOUND" : "NOT_FOUND",
      scannedById: context.user.id,
      note: orders.length > 0 ? `Mobile ${matchMode} lookup matched ${orders.length} item(s).` : "Mobile lookup did not match an order."
    }
  }).catch(() => undefined);

  done({ status: 200, rows: orders.length, mode: matchMode });
  return mobileJson({
    ok: true,
    accountId: context.account.id,
    code,
    matchMode,
    results: await hydrateResults(context.account.id, orders)
  });
}
