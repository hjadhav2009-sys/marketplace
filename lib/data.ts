import type { Account } from "@prisma/client";
import { findAwbSearchMatches } from "./operations/awb-search";
import { buildPickerSkuGroups, decodePickerDimension, filterPickerSkuGroups } from "./operations/picking";
import { prisma } from "./prisma";

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

export async function searchSkuMappings(accountId: string, query?: string, active?: string) {
  return prisma.skuImageMapping.findMany({
    where: {
      accountId,
      active: active === "inactive" ? false : active === "all" ? undefined : true,
      OR: query
        ? [
            { sku: { contains: query } },
            { productName: { contains: query } },
            { notes: { contains: query } }
          ]
        : undefined
    },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getSkuGroups(accountId: string, options: { query?: string; filter?: string } = {}) {
  const orders = await prisma.order.findMany({
    where: {
      accountId,
      packStatus: {
        not: "PACKED"
      }
    },
    orderBy: {
      sku: "asc"
    }
  });

  const mappings = await prisma.skuImageMapping.findMany({
    where: {
      accountId,
      sku: {
        in: Array.from(new Set(orders.map((order) => order.sku)))
      }
    }
  });

  return filterPickerSkuGroups(buildPickerSkuGroups(orders, mappings), options);
}

export async function getSkuDetail(
  accountId: string,
  sku: string,
  options: { color?: string; size?: string } = {}
) {
  const color = decodePickerDimension(options.color);
  const size = decodePickerDimension(options.size);
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
      orderBy: { createdAt: "asc" }
    }),
    prisma.skuImageMapping.findUnique({
      where: {
        accountId_sku: {
          accountId,
          sku
        }
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
    mapping,
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

  const [pendingCount, packedTodayCount, recentScans] = await Promise.all([
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
    }),
    prisma.scanLog.findMany({
      where: { accountId },
      include: {
        order: true,
        scannedBy: true
      },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  return {
    pendingCount,
    packedTodayCount,
    recentScans
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
  const select = {
    id: true,
    accountId: true,
    awb: true,
    sku: true,
    qty: true,
    color: true,
    courier: true,
    packStatus: true,
    imageUrl: true,
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
  const skusMissingImages = Array.from(new Set(matches.filter((order) => !order.imageUrl).map((order) => order.sku)));
  const mappings =
    skusMissingImages.length > 0
      ? await prisma.skuImageMapping.findMany({
          where: {
            accountId,
            sku: { in: skusMissingImages },
            active: true
          },
          select: {
            sku: true,
            imageUrl: true
          }
        })
      : [];
  const imageBySku = new Map(mappings.map((mapping) => [mapping.sku, mapping.imageUrl]));

  return matches.map((order) => ({
    ...order,
    imageUrl: order.imageUrl ?? imageBySku.get(order.sku) ?? null
  }));
}

export async function getOrderWithImage(accountId: string, awb: string) {
  const order = await prisma.order.findFirst({
    where: {
      accountId,
      awb
    },
    include: {
      account: true,
      problemOrders: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { reportedBy: true }
      },
      scanLogs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { scannedBy: true }
      }
    }
  });

  if (!order) {
    return null;
  }

  const mapping = await prisma.skuImageMapping.findUnique({
    where: {
      accountId_sku: {
        accountId,
        sku: order.sku
      }
    }
  });

  return {
    order,
    mapping
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
