import type { Account } from "@prisma/client";
import { cachedProductImageUrl } from "./image-cache";
import { findAwbSearchMatches } from "./operations/awb-search";
import { buildPickerSkuGroups, decodePickerDimension, filterPickerSkuGroups, paginatePickerSkuGroups } from "./operations/picking";
import { withDevTiming } from "./perf";
import { prisma } from "./prisma";
import { normalizeSkuMappingImageFilter } from "./product-image";
import { normalizeSkuForMatching } from "./sku";

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
    include: {
      account: true,
      uploadBatch: true
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
  options: { query?: string; filter?: string; page?: string; limit?: string } = {}
) {
  const orders = await withDevTiming("picker orders", () =>
    prisma.order.findMany({
      where: {
        accountId,
        packStatus: {
          not: "PACKED"
        }
      },
      select: {
        id: true,
        awb: true,
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

  const mappings = await withDevTiming("picker image mappings", () =>
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
  );

  return paginatePickerSkuGroups(
    filterPickerSkuGroups(
      buildPickerSkuGroups(
        orders,
        mappings.map((mapping) => ({
          ...mapping,
          cachedImageUrl: cachedProductImageUrl(mapping)
        }))
      ),
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
  const [orders, mapping] = await Promise.all([
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
    })
  ]);

  const courierCounts = orders.reduce<Record<string, number>>((counts, order) => {
    const courier = order.courier ?? "Unknown";
    counts[courier] = (counts[courier] ?? 0) + 1;
    return counts;
  }, {});

  return {
    orders,
    mapping: mapping
      ? {
          ...mapping,
          cachedImageUrl: cachedProductImageUrl(mapping)
        }
      : null,
    totalQuantity: orders.reduce((sum, order) => sum + order.qty, 0),
    pickedCount: orders.filter((order) => order.pickStatus === "PICKED").length,
    pendingCount: orders.filter((order) => order.pickStatus === "READY").length,
    problemCount: orders.filter((order) => order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM").length,
    courierCounts
  };
}

export async function getPackingDashboard(accountId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [pendingCount, packedTodayCount] = await withDevTiming("packing dashboard", () => Promise.all([
    prisma.order.count({
      where: {
        accountId,
        packStatus: "READY"
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
    })
  ]), 500);

  return {
    pendingCount,
    packedTodayCount
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
      sku: true,
      qty: true,
      color: true,
      courier: true,
      packStatus: true,
      createdAt: true
    } as const;
    const exact = await prisma.order.findMany({
      where: { accountId, awb: query },
      select,
      orderBy: { createdAt: "desc" },
      take: limit
    });
    const exactAwbs = exact.map((order) => order.awb);
    const suffix =
      exact.length < limit
        ? await prisma.order.findMany({
            where: {
              accountId,
              awb: {
                endsWith: query,
                notIn: exactAwbs
              }
            },
            select,
            orderBy: { createdAt: "desc" },
            take: limit - exact.length
          })
        : [];
    const exactAndSuffixAwbs = [...exactAwbs, ...suffix.map((order) => order.awb)];
    const contains =
      exact.length + suffix.length < limit
        ? await prisma.order.findMany({
            where: {
              accountId,
              awb: {
                contains: query,
                notIn: exactAndSuffixAwbs
              }
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
    const mappings =
      matchSkus.length > 0
        ? await prisma.skuImageMapping.findMany({
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
          })
        : [];
    const imageBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), cachedProductImageUrl(mapping)]));
    const cacheStatusBySku = new Map(mappings.map((mapping) => [normalizeSkuForMatching(mapping.sku), mapping.cacheStatus]));

    return matches.map((order) => ({
      ...order,
      cachedImageUrl: imageBySku.get(normalizeSkuForMatching(order.sku)) ?? null,
      cacheStatus: cacheStatusBySku.get(normalizeSkuForMatching(order.sku)) ?? null
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

  const mapping = await prisma.skuImageMapping.findFirst({
    where: {
      accountId,
      active: true,
      sku: { in: Array.from(new Set([order.sku, normalizeSkuForMatching(order.sku)].filter(Boolean))) }
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
  });

  return {
    order,
    mapping: mapping
      ? {
          ...mapping,
          cachedImageUrl: cachedProductImageUrl(mapping)
        }
      : null
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
