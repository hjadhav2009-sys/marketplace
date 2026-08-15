import type { Account, WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startOfWorkDay } from "@/lib/operations/work-queue";
import { titleCase } from "@/lib/format";
import { importJobProgressPercent } from "@/src/lib/import-jobs/progress";
import type { ImportJobRecord } from "@/src/lib/import-jobs/store";
import { definitionForImportJob } from "@/src/lib/imports/import-purpose-definitions";
import { marketplaceCapabilities } from "@/src/lib/marketplace-capabilities";
import { getSmartStageSummary } from "@/src/lib/workflow/grouped-work";

const DASHBOARD_STAGES = ["PICK", "MARK", "ASSEMBLE", "PACK"] as const satisfies readonly WorkStage[];
const IMPORT_ACTION_STATUSES = ["NEEDS_MAPPING", "AWAITING_FILE_ROLES", "FAILED"] as const;
const CATALOG_IMPORT_TYPES = {
  FLIPKART: ["FLIPKART_PRODUCT_INVENTORY", "FLIPKART_LISTING_MASTER", "PRODUCT_INVENTORY"],
  AMAZON: ["AMAZON_PRODUCT_INVENTORY", "PRODUCT_INVENTORY"],
} as const;

type DashboardAccount = Pick<Account, "id" | "marketplace">;
type StageSummary = Awaited<ReturnType<typeof getSmartStageSummary>>;

export type DashboardStage = {
  stage: WorkStage;
  href: string;
  label: string;
  cardCount: number | null;
  itemCount: number | null;
  requiredQuantity: number | null;
  orderCards: number | null;
  consignmentCards: number | null;
  showConsignments: boolean;
  showOrders: boolean;
  unavailable: boolean;
};

export type DashboardAction = {
  href: string;
  label: string;
  variant: "primary" | "secondary" | "quiet";
};

export function dashboardImportTypeLabel(job: { marketplace: string; importType: string }) {
  const definition = definitionForImportJob(job as Pick<ImportJobRecord, "marketplace" | "importType">);
  return definition?.label ?? titleCase(job.importType);
}

export function dashboardActions(marketplace: Account["marketplace"]) {
  const capabilities = marketplaceCapabilities(marketplace);
  const operations: DashboardAction[] = [
    { href: "/work", label: "Open Work Hub", variant: "primary" },
    { href: "/work/scan", label: "Universal Scan", variant: "secondary" },
  ];
  const imports: DashboardAction[] = [];

  if (capabilities.productCatalog) {
    imports.push({ href: "/owner/product-inventory/refresh", label: "Refresh Product Inventory", variant: "secondary" });
  }
  if (capabilities.dailyOrders) {
    imports.push({ href: "/owner/uploads/new", label: "Import Daily Orders", variant: "secondary" });
  }
  if (capabilities.consignments) {
    imports.push({ href: "/owner/consignments/new", label: "New Consignment", variant: "secondary" });
    imports.push({ href: "/owner/consignments", label: "View Consignments", variant: "quiet" });
  }
  imports.push({ href: "/owner/imports", label: "Import History", variant: "quiet" });

  return { operations, imports };
}

function stageHref(stage: WorkStage) {
  if (stage === "PICK") return "/work/pick?source=ORDER";
  if (stage === "MARK") return "/work/mark";
  if (stage === "ASSEMBLE") return "/work/assemble";
  return "/work/pack";
}

function stageLabel(stage: WorkStage) {
  return stage === "ASSEMBLE" ? "Assembly" : titleCase(stage);
}

export function dashboardStage(
  stage: WorkStage,
  summary: StageSummary | null,
  sources: { consignments: boolean; dailyOrders: boolean } = { consignments: true, dailyOrders: true },
): DashboardStage {
  const unavailable = !summary || summary.ORDER.projectionUnavailable || summary.CONSIGNMENT.projectionUnavailable;
  if (unavailable) {
    return {
      stage,
      href: stage === "PICK" && !sources.dailyOrders ? "/work" : stageHref(stage),
      label: stageLabel(stage),
      cardCount: null,
      itemCount: null,
      requiredQuantity: null,
      orderCards: null,
      consignmentCards: null,
      showConsignments: sources.consignments,
      showOrders: sources.dailyOrders,
      unavailable: true,
    };
  }

  return {
    stage,
    href: stage === "PICK" && !sources.dailyOrders ? "/work" : stageHref(stage),
    label: stageLabel(stage),
    cardCount: summary.ORDER.cardCount + summary.CONSIGNMENT.cardCount,
    itemCount: summary.ORDER.itemCount + summary.CONSIGNMENT.itemCount,
    requiredQuantity: summary.ORDER.requiredQuantity + summary.CONSIGNMENT.requiredQuantity,
    orderCards: summary.ORDER.cardCount,
    consignmentCards: summary.CONSIGNMENT.cardCount,
    showConsignments: sources.consignments,
    showOrders: sources.dailyOrders,
    unavailable: false,
  };
}

export async function getDashboardOverview(input: { account: DashboardAccount; actorUserId: string }) {
  const capabilities = marketplaceCapabilities(input.account.marketplace);
  const startOfDay = startOfWorkDay();
  const catalogTypes = input.account.marketplace === "AMAZON" ? CATALOG_IMPORT_TYPES.AMAZON : CATALOG_IMPORT_TYPES.FLIPKART;
  const stagePromises = DASHBOARD_STAGES.map(async (stage) => {
    try {
      return await getSmartStageSummary({ actorUserId: input.actorUserId, accountId: input.account.id, stage });
    } catch {
      return null;
    }
  });

  const [stageSummaries, packedToday, openProblemsToday, importStatusGroups, recentImports, latestCatalogImport, latestDailyOrderImport] = await Promise.all([
    Promise.all(stagePromises),
    capabilities.dailyOrders
      ? prisma.order.count({ where: { accountId: input.account.id, packStatus: "PACKED", packedAt: { gte: startOfDay } } })
      : Promise.resolve(null),
    capabilities.dailyOrders
      ? prisma.problemOrder.count({ where: { accountId: input.account.id, status: "OPEN", createdAt: { gte: startOfDay } } })
      : Promise.resolve(null),
    prisma.importJob.groupBy({ by: ["status"], where: { accountId: input.account.id }, _count: { _all: true } }),
    prisma.importJob.findMany({
      where: { accountId: input.account.id },
      select: {
        id: true,
        marketplace: true,
        importType: true,
        fileName: true,
        status: true,
        totalRows: true,
        processedRows: true,
        warningRows: true,
        errorRows: true,
        createdAt: true,
        finishedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    capabilities.productCatalog
      ? prisma.importJob.findFirst({
          where: { accountId: input.account.id, marketplace: input.account.marketplace, importType: { in: [...catalogTypes] } },
          select: { createdAt: true, status: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
    capabilities.dailyOrders
      ? prisma.importJob.findFirst({
          where: { accountId: input.account.id, marketplace: input.account.marketplace, importType: "FLIPKART_ORDER" },
          select: { createdAt: true, status: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  const statusCounts = new Map(importStatusGroups.map((group) => [group.status, group._count._all]));
  const importsNeedingAction = IMPORT_ACTION_STATUSES.reduce((total, status) => total + (statusCounts.get(status) ?? 0), 0);
  const importsWithWarnings = statusCounts.get("COMPLETED_WITH_WARNINGS") ?? 0;

  return {
    capabilities,
    actions: dashboardActions(input.account.marketplace),
    stages: DASHBOARD_STAGES.map((stage, index) => dashboardStage(stage, stageSummaries[index], capabilities)),
    today: { packed: packedToday, openProblems: openProblemsToday },
    importAttention: { needsAction: importsNeedingAction, completedWithWarnings: importsWithWarnings },
    latestCatalogImport,
    latestDailyOrderImport,
    recentImports: recentImports.map((job) => ({
      ...job,
      label: dashboardImportTypeLabel(job),
      progressPercent: ["RUNNING", "QUEUED"].includes(job.status) ? importJobProgressPercent(job) : null,
    })),
  };
}
