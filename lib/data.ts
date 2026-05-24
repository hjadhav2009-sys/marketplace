import type { Account } from "@prisma/client";
import { prisma } from "./prisma";

export async function getDashboardStats(accountId: string) {
  const [readyOrders, packedOrders, problemOrders, skuMappings, batches] = await Promise.all([
    prisma.order.count({ where: { accountId, status: "READY" } }),
    prisma.order.count({ where: { accountId, status: "PACKED" } }),
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
      uploadedBy: true,
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
    where: { accountId },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getSkuGroups(accountId: string) {
  const grouped = await prisma.order.groupBy({
    by: ["sku", "color"],
    where: {
      accountId,
      status: "READY"
    },
    _sum: {
      quantity: true
    },
    _count: {
      id: true
    },
    orderBy: {
      sku: "asc"
    }
  });

  const mappings = await prisma.skuImageMapping.findMany({
    where: {
      accountId,
      sku: {
        in: grouped.map((group) => group.sku)
      }
    }
  });

  const mappingBySku = new Map(mappings.map((mapping) => [mapping.sku, mapping]));

  return grouped.map((group) => ({
    sku: group.sku,
    color: group.color,
    totalQuantity: group._sum.quantity ?? 0,
    orderCount: group._count.id,
    mapping: mappingBySku.get(group.sku) ?? null
  }));
}

export async function getSkuDetail(accountId: string, sku: string) {
  const [orders, mapping] = await Promise.all([
    prisma.order.findMany({
      where: {
        accountId,
        sku,
        status: "READY"
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

  return {
    orders,
    mapping,
    totalQuantity: orders.reduce((sum, order) => sum + order.quantity, 0)
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

export async function getOrderWithImage(accountId: string, awb: string) {
  const order = await prisma.order.findFirst({
    where: {
      accountId,
      awb
    },
    include: {
      account: true,
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
  const [ordersByStatus, scansToday, batches] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { accountId },
      _count: { id: true }
    }),
    prisma.scanLog.count({
      where: {
        accountId,
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
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
    })
  ]);

  return {
    ordersByStatus,
    scansToday,
    batches
  };
}
