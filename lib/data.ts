import type { Account } from "@prisma/client";
import { cachedProductImageUrl } from "./image-cache";
import { findAwbSearchMatches } from "./operations/awb-search";
import { buildPickerSkuGroups, decodePickerDimension, filterPickerSkuGroups, paginatePickerSkuGroups } from "./operations/picking";
import { buildWorkQueueOrderWhere, startOfWorkDay } from "./operations/work-queue";
import { withDevTiming } from "./perf";
import { prisma } from "./prisma";
import { buildListingImageGallery, normalizeSkuMappingImageFilter } from "./product-image";
import { normalizeSkuForMatching } from "./sku";

type DisplayListing = {
  sku: string;
  sellerSkuId: string;
  productTitle: string | null;
  liveTitle: string | null;
  liveBrand: string | null;
  liveCategory: string | null;
  subCategory: string | null;
  fsn: string | null;
  listingId: string | null;
  mrp?: number | null;
  sellingPrice?: number | null;
  livePrice?: number | null;
  liveMrp?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  productHighlights?: string | null;
  description?: string | null;
  allSpecifications?: string | null;
  mainImageUrl: string | null;
  imageUrl1?: string | null;
  imageUrl2?: string | null;
  imageUrl3?: string | null;
  imageUrl4?: string | null;
  imageUrl5?: string | null;
  imageUrl6?: string | null;
  imageUrl7?: string | null;
  imageUrl8?: string | null;
  imageUrl9?: string | null;
  imageUrl10?: string | null;
  image1366Url1?: string | null;
  image1366Url2?: string | null;
  image1366Url3?: string | null;
  image1366Url4?: string | null;
  image1366Url5?: string | null;
  image1366Url6?: string | null;
  image1366Url7?: string | null;
  image1366Url8?: string | null;
  image1366Url9?: string | null;
  image1366Url10?: string | null;
};

type DisplayImageMapping = {
  id?: string;
  accountId?: string;
  sku: string;
  imageUrl: string | null;
  productName?: string | null;
  color?: string | null;
  size?: string | null;
  imageHealth?: string | null;
  cacheStatus?: string | null;
  cacheFilePath?: string | null;
  cacheOriginalImageUrl?: string | null;
  cacheCachedAt?: Date | null;
};

function listingDisplayName(listing: DisplayListing | null | undefined) {
  return listing?.productTitle ?? listing?.liveTitle ?? null;
}

function listingDisplayCategory(listing: DisplayListing | null | undefined) {
  return listing?.liveCategory ?? listing?.subCategory ?? null;
}

function displayImageUrl(mapping: DisplayImageMapping | null | undefined, listing: DisplayListing | null | undefined) {
  return (mapping ? cachedProductImageUrl(mapping) : null) ?? listing?.mainImageUrl ?? mapping?.imageUrl ?? null;
}

function mergeDisplayMappings(input: {
  skus: string[];
  mappings: DisplayImageMapping[];
  listings: DisplayListing[];
}) {
  const mappingBySku = new Map(input.mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping]));
  const listingBySku = new Map(input.listings.map((listing) => [normalizeSkuForMatching(listing.sku), listing]));

  return input.skus.map((sku) => {
    const normalizedSku = normalizeSkuForMatching(sku);
    const mapping = mappingBySku.get(normalizedSku) ?? null;
    const listing = listingBySku.get(normalizedSku) ?? null;
    const imageUrl = displayImageUrl(mapping, listing);
    const galleryImages = buildListingImageGallery(listing, imageUrl);

    return {
      id: mapping?.id,
      sku,
      imageUrl: listing?.mainImageUrl ?? mapping?.imageUrl ?? null,
      cachedImageUrl: imageUrl,
      galleryImages,
      productName: listingDisplayName(listing) ?? mapping?.productName ?? null,
      color: mapping?.color ?? null,
      size: mapping?.size ?? null,
      imageHealth: mapping?.imageHealth ?? null,
      cacheStatus: mapping?.cacheStatus ?? (listing?.mainImageUrl ? "NOT_CACHED" : null),
      listing
    };
  });
}

export async function getDashboardStats(accountId: string) {
  const [readyOrders, packedOrders, problemOrders, skuMappings, batches] = await Promise.all([
    prisma.order.count({ where: { accountId, packStatus: "READY" } }),
    prisma.order.count({ where: { accountId, packStatus: "PACKED" } }),
    prisma.problemOrder.count({ where: { accountId, status: "OPEN" } }),
    prisma.skuImageMapping.count({ where: { accountId } }),
    prisma.uploadBatch.count({ where: { accountId } })
  ]);

  return {
    readyOrders,
    packedOrders,
    problemOrders,
    skuMappings,
    batches
  };
}

export async function getRecentOrders(accountId: string) {
  return prisma.order.findMany({
    where: { accountId },
    select: {
      id: true,
      sku: true,
      qty: true,
      courier: true,
      packStatus: true
    },
    orderBy: { createdAt: "desc" },
    take: 8
  });
}

export async function getRecentBatches(accountId: string) {
  return prisma.uploadBatch.findMany({
    where: { accountId },
    include: {
      createdBy: true,
      _count: {
        select: { orders: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });
}

export async function getSkuMappings(accountId: string) {
  return prisma.skuImageMapping.findMany({
    where: { accountId, active: true },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getLatestImportedBatch(accountId: string) {
  return prisma.uploadBatch.findFirst({
    where: {
      accountId,
      orders: {
        some: {}
      }
    },
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function searchSkuMappings(accountId: string, query?: string, active?: string, image?: string) {
  const imageFilter = normalizeSkuMappingImageFilter(image);
  const imageWhere =
    imageFilter === "cached"
      ? { cacheStatus: "CACHED" as const }
      : imageFilter === "not-cached"
        ? { cacheStatus: "NOT_CACHED" as const }
        : imageFilter === "recheck-needed"
          ? { cacheStatus: "RECHECK_NEEDED" as const }
          : imageFilter === "broken"
            ? { OR: [{ cacheStatus: "BROKEN" as const }, { imageHealth: "BROKEN" as const }] }
            : {};
  const queryWhere = query
    ? {
        OR: [
          { sku: { contains: query } },
          { productName: { contains: query } },
          { notes: { contains: query } }
        ]
      }
    : {};

  return prisma.skuImageMapping.findMany({
    where: {
      accountId,
      active: active === "inactive" ? false : active === "all" ? undefined : true,
      AND: [imageWhere, queryWhere]
    },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getSkuGroups(
  accountId: string,
  options: { query?: string; filter?: string; page?: string; limit?: string; work?: string; batchId?: string } = {}
) {
  const orders = await withDevTiming("picker orders", () =>
    prisma.order.findMany({
      where: buildWorkQueueOrderWhere(accountId, {
        work: options.work,
        batchId: options.batchId
      }),
      select: {
        id: true,
        awb: true,
        marketplace: true,
        shipmentId: true,
        orderItemId: true,
        fsn: true,
        trackingId: true,
        sku: true,
        qty: true,
        color: true,
        size: true,
        courier: true,
        orderNo: true,
        productDescription: true,
        imageUrl: true,
        pickStatus: true,
        packStatus: true
      },
      orderBy: {
        sku: "asc"
      }
    }),
    800
  );
  const orderSkus = Array.from(new Set(orders.flatMap((order) => [order.sku, normalizeSkuForMatching(order.sku)].filter(Boolean))));

  const [mappings, listings] = await Promise.all([
    withDevTiming("picker image mappings", () =>
      prisma.skuImageMapping.findMany({
        where: {
          accountId,
          sku: {
            in: orderSkus
          },
          active: true
        },
        select: {
          id: true,
          accountId: true,
          sku: true,
          imageUrl: true,
          productName: true,
          color: true,
          size: true,
          imageHealth: true,
          cacheStatus: true,
          cacheFilePath: true,
          cacheOriginalImageUrl: true,
          cacheCachedAt: true
        }
      }),
      800
    ),
    withDevTiming("picker listing master", () =>
      prisma.marketplaceListing.findMany({
        where: {
          accountId,
          marketplace: "FLIPKART",
          sku: {
            in: orderSkus
          }
        },
        select: {
          sku: true,
          sellerSkuId: true,
          productTitle: true,
          liveTitle: true,
          liveBrand: true,
          liveCategory: true,
          subCategory: true,
          fsn: true,
          listingId: true,
          mainImageUrl: true,
          imageUrl1: true,
          imageUrl2: true,
          imageUrl3: true,
          imageUrl4: true,
          imageUrl5: true,
          imageUrl6: true,
          imageUrl7: true,
          imageUrl8: true,
          imageUrl9: true,
          imageUrl10: true,
          image1366Url1: true,
          image1366Url2: true,
          image1366Url3: true,
          image1366Url4: true,
          image1366Url5: true,
          image1366Url6: true,
          image1366Url7: true,
          image1366Url8: true,
          image1366Url9: true,
          image1366Url10: true
        }
      }),
      800
    )
  ]);
  const displayMappings = mergeDisplayMappings({ skus: orderSkus, mappings, listings });

  return paginatePickerSkuGroups(
    filterPickerSkuGroups(
      buildPickerSkuGroups(orders, displayMappings),
      options
    ),
    options
  );
}

export async function getSkuDetail(
  accountId: string,
  sku: string,
  options: { color?: string; size?: string } = {}
) {
  const color = decodePickerDimension(options.color);
  const size = decodePickerDimension(options.size);
  const normalizedSku = normalizeSkuForMatching(sku);
  const [orders, mapping, listing] = await Promise.all([
    prisma.order.findMany({
      where: {
        accountId,
        sku,
        color: color === undefined ? undefined : color,
        size: size === undefined ? undefined : size,
        packStatus: {
          not: "PACKED"
        }
      },
      select: {
        id: true,
        awb: true,
        marketplace: true,
        shipmentId: true,
        orderItemId: true,
        fsn: true,
        trackingId: true,
        sku: true,
        qty: true,
        color: true,
        size: true,
        courier: true,
        orderNo: true,
        productDescription: true,
        imageUrl: true,
        pickStatus: true,
        packStatus: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.skuImageMapping.findFirst({
      where: {
        accountId,
        active: true,
        sku: { in: Array.from(new Set([sku, normalizedSku].filter(Boolean))) }
      },
      select: {
        id: true,
        accountId: true,
        sku: true,
        imageUrl: true,
        productName: true,
        color: true,
        size: true,
        imageHealth: true,
        cacheStatus: true,
        cacheFilePath: true,
        cacheOriginalImageUrl: true,
        cacheCachedAt: true
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.marketplaceListing.findFirst({
      where: {
        accountId,
        marketplace: "FLIPKART",
        sku: { in: Array.from(new Set([sku, normalizedSku].filter(Boolean))) }
      },
      select: {
        sku: true,
        sellerSkuId: true,
        productTitle: true,
        liveTitle: true,
        liveBrand: true,
        liveCategory: true,
        subCategory: true,
        fsn: true,
        listingId: true,
        mrp: true,
        sellingPrice: true,
        livePrice: true,
        liveMrp: true,
        rating: true,
        reviewCount: true,
        productHighlights: true,
        description: true,
        allSpecifications: true,
        mainImageUrl: true,
        imageUrl1: true,
        imageUrl2: true,
        imageUrl3: true,
        imageUrl4: true,
        imageUrl5: true,
        imageUrl6: true,
        imageUrl7: true,
        imageUrl8: true,
        imageUrl9: true,
        imageUrl10: true,
        image1366Url1: true,
        image1366Url2: true,
        image1366Url3: true,
        image1366Url4: true,
        image1366Url5: true,
        image1366Url6: true,
        image1366Url7: true,
        image1366Url8: true,
        image1366Url9: true,
        image1366Url10: true
      }
    })
  ]);

  const courierCounts = orders.reduce<Record<string, number>>((counts, order) => {
    const courier = order.courier ?? "Unknown";
    counts[courier] = (counts[courier] ?? 0) + 1;
    return counts;
  }, {});

  return {
    orders,
    mapping: mergeDisplayMappings({
      skus: [sku],
      mappings: mapping ? [mapping] : [],
      listings: listing ? [listing] : []
    })[0] ?? null,
    listing,
    totalQuantity: orders.reduce((sum, order) => sum + order.qty, 0),
    pickedCount: orders.filter((order) => order.pickStatus === "PICKED").length,
    pendingCount: orders.filter((order) => order.pickStatus === "READY").length,
    problemCount: orders.filter((order) => order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM").length,
    courierCounts
  };
}

export async function getPackingDashboard(accountId: string) {
  const startOfDay = startOfWorkDay();

  const [todayReadyCount, oldPendingCount, packedTodayCount, problemCount] = await withDevTiming("packing dashboard", () => Promise.all([
    prisma.order.count({
      where: {
        accountId,
        packStatus: "READY",
        importedAt: {
          gte: startOfDay
        }
      }
    }),
    prisma.order.count({
      where: {
        accountId,
        packStatus: "READY",
        importedAt: {
          lt: startOfDay
        }
      }
    }),
    prisma.order.count({
      where: {
        accountId,
        packStatus: "PACKED",
        packedAt: {
          gte: startOfDay
        }
      }
    }),
    prisma.order.count({
      where: {
        accountId,
        OR: [{ pickStatus: "PROBLEM" }, { packStatus: "PROBLEM" }, { status: "PROBLEM" }]
      }
    })
  ]), 500);

  return {
    todayReadyCount,
    oldPendingCount,
    pendingCount: todayReadyCount + oldPendingCount,
    packedTodayCount,
    problemCount
  };
}

export async function getOrderByAwb(account: Account, awb: string) {
  return prisma.order.findFirst({
    where: {
      accountId: account.id,
      awb
    },
    include: {
      account: true,
      uploadBatch: true
    }
  });
}

export async function searchOrdersByAwbFragment(accountId: string, query: string, limit = 10) {
  return withDevTiming("packing awb search", async () => {
    const select = {
      id: true,
      accountId: true,
      awb: true,
      trackingId: true,
      sku: true,
      qty: true,
      color: true,
      courier: true,
      packStatus: true,
      createdAt: true
    } as const;
    const exact = await prisma.order.findMany({
      where: {
        accountId,
        packStatus: "READY",
        OR: [{ awb: query }, { trackingId: query }]
      },
      select,
      orderBy: { createdAt: "desc" },
      take: limit
    });
    const exactIds = exact.map((order) => order.id);
    const suffix =
      exact.length < limit
        ? await prisma.order.findMany({
            where: {
              accountId,
              packStatus: "READY",
              id: { notIn: exactIds },
              OR: [
                {
                  awb: {
                    endsWith: query
                  }
                },
                {
                  trackingId: {
                    endsWith: query
                  }
                }
              ]
            },
            select,
            orderBy: { createdAt: "desc" },
            take: limit - exact.length
          })
        : [];
    const exactAndSuffixIds = [...exactIds, ...suffix.map((order) => order.id)];
    const contains =
      exact.length + suffix.length < limit
        ? await prisma.order.findMany({
            where: {
              accountId,
              packStatus: "READY",
              id: { notIn: exactAndSuffixIds },
              OR: [
                {
                  awb: {
                    contains: query
                  }
                },
                {
                  trackingId: {
                    contains: query
                  }
                }
              ]
            },
            select,
            orderBy: { createdAt: "desc" },
            take: limit - exact.length - suffix.length
          })
        : [];
    const candidates = [...exact, ...suffix, ...contains];
    const matches = findAwbSearchMatches({
      candidates,
      accountId,
      query,
      limit
    });
    const matchSkus = Array.from(new Set(matches.flatMap((order) => [order.sku, normalizeSkuForMatching(order.sku)].filter(Boolean))));
    const [mappings, listings] =
      matchSkus.length > 0
        ? await Promise.all([
            prisma.skuImageMapping.findMany({
              where: {
                accountId,
                sku: { in: matchSkus },
                active: true
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
                sku: { in: matchSkus }
              },
              select: {
                sku: true,
                sellerSkuId: true,
                productTitle: true,
                liveTitle: true,
                liveBrand: true,
                liveCategory: true,
                subCategory: true,
                fsn: true,
                listingId: true,
                mainImageUrl: true
              }
            })
          ])
        : [[], []];
    const listingBySku = new Map(listings.map((listing) => [normalizeSkuForMatching(listing.sku), listing]));
    const imageBySku = new Map(
      mappings.map((mapping) => {
        const listing = listingBySku.get(normalizeSkuForMatching(mapping.sku));
        return [normalizeSkuForMatching(mapping.sku), displayImageUrl(mapping, listing)];
      })
    );
    const cacheStatusBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping.cacheStatus]));

    return matches.map((order) => ({
      ...order,
      cachedImageUrl: imageBySku.get(normalizeSkuForMatching(order.sku)) ?? listingBySku.get(normalizeSkuForMatching(order.sku))?.mainImageUrl ?? null,
      cacheStatus: cacheStatusBySku.get(normalizeSkuForMatching(order.sku)) ?? null,
      listingTitle: listingDisplayName(listingBySku.get(normalizeSkuForMatching(order.sku))) ?? null,
      listingId: listingBySku.get(normalizeSkuForMatching(order.sku))?.listingId ?? null,
      listingCategory: listingDisplayCategory(listingBySku.get(normalizeSkuForMatching(order.sku))) ?? null
    }));
  }, 500);
}

export async function getOrderWithImage(accountId: string, awb: string) {
  const order = await withDevTiming("packing order result", () => prisma.order.findFirst({
    where: {
      accountId,
      awb
    },
    select: {
      id: true,
      awb: true,
      marketplace: true,
      shipmentId: true,
      orderItemId: true,
      fsn: true,
      trackingId: true,
      accountId: true,
      sku: true,
      qty: true,
      color: true,
      size: true,
      courier: true,
      orderNo: true,
      productDescription: true,
      imageUrl: true,
      paymentType: true,
      city: true,
      state: true,
      packStatus: true,
      packedAt: true,
      account: {
        select: {
          name: true
        }
      },
      problemOrders: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          reason: true,
          createdAt: true,
          reportedBy: {
            select: {
              name: true
            }
          }
        }
      },
      scanLogs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          outcome: true,
          createdAt: true,
          scannedBy: {
            select: {
              name: true
            }
          }
        }
      }
    }
  }), 500);

  if (!order) {
    return null;
  }

  const skuValues = Array.from(new Set([order.sku, normalizeSkuForMatching(order.sku)].filter(Boolean)));
  const [mapping, listing] = await Promise.all([
    prisma.skuImageMapping.findFirst({
      where: {
        accountId,
        active: true,
        sku: { in: skuValues }
      },
      select: {
        id: true,
        accountId: true,
        sku: true,
        imageUrl: true,
        productName: true,
        color: true,
        size: true,
        imageHealth: true,
        cacheStatus: true,
        cacheFilePath: true,
        cacheOriginalImageUrl: true,
        cacheCachedAt: true
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.marketplaceListing.findFirst({
      where: {
        accountId,
        marketplace: "FLIPKART",
        sku: { in: skuValues }
      },
      select: {
        sku: true,
        sellerSkuId: true,
        productTitle: true,
        liveTitle: true,
        liveBrand: true,
        liveCategory: true,
        subCategory: true,
        fsn: true,
        listingId: true,
        mrp: true,
        sellingPrice: true,
        livePrice: true,
        liveMrp: true,
        rating: true,
        reviewCount: true,
        productHighlights: true,
        description: true,
        allSpecifications: true,
        mainImageUrl: true,
        imageUrl1: true,
        imageUrl2: true,
        imageUrl3: true,
        imageUrl4: true,
        imageUrl5: true,
        imageUrl6: true,
        imageUrl7: true,
        imageUrl8: true,
        imageUrl9: true,
        imageUrl10: true,
        image1366Url1: true,
        image1366Url2: true,
        image1366Url3: true,
        image1366Url4: true,
        image1366Url5: true,
        image1366Url6: true,
        image1366Url7: true,
        image1366Url8: true,
        image1366Url9: true,
        image1366Url10: true
      }
    })
  ]);

  return {
    order,
    shipmentItems:
      order.marketplace === "FLIPKART" && order.trackingId
        ? await prisma.order.findMany({
            where: {
              accountId,
              marketplace: "FLIPKART",
              trackingId: order.trackingId,
              packStatus: "READY"
            },
            select: {
              id: true,
              awb: true,
              trackingId: true,
              shipmentId: true,
              orderItemId: true,
              sku: true,
              qty: true,
              productDescription: true,
              packStatus: true
            },
            orderBy: { sku: "asc" }
          })
        : [],
    mapping: mergeDisplayMappings({
      skus: [order.sku],
      mappings: mapping ? [mapping] : [],
      listings: listing ? [listing] : []
    })[0] ?? null,
    listing
  };
}

export async function getProblemOrders(accountId: string) {
  return prisma.problemOrder.findMany({
    where: { accountId },
    include: {
      order: true,
      reportedBy: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function getReportSummary(accountId: string) {
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const [ordersByStatus, scansToday, batches, duplicateIssuesToday, missingImageMappings, brokenImageMappings, auditLogs] = await Promise.all([
    prisma.order.groupBy({
      by: ["packStatus"],
      where: { accountId },
      _count: { id: true }
    }),
    prisma.scanLog.count({
      where: {
        accountId,
        createdAt: {
          gte: startOfDay
        }
      }
    }),
    prisma.uploadBatch.findMany({
      where: { accountId },
      include: {
        _count: {
          select: { orders: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.importRowIssue.count({
      where: {
        issueType: "DUPLICATE_SKIPPED",
        batch: {
          accountId
        },
        createdAt: {
          gte: startOfDay
        }
      }
    }),
    prisma.order.findMany({
      where: {
        accountId,
        packStatus: "READY",
        OR: [{ imageUrl: null }, { imageUrl: "" }]
      },
      distinct: ["sku"],
      take: 20,
      orderBy: { createdAt: "desc" }
    }),
    prisma.skuImageMapping.findMany({
      where: {
        accountId,
        imageHealth: "BROKEN"
      },
      take: 20,
      orderBy: { updatedAt: "desc" }
    }),
    prisma.auditLog.findMany({
      where: { accountId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  return {
    ordersByStatus,
    scansToday,
    batches,
    duplicateIssuesToday,
    missingImageMappings,
    brokenImageMappings,
    auditLogs
  };
}
