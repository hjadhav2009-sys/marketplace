import { performance } from "node:perf_hooks";
import type { Prisma, PrismaClient, ProcessRoute, User, WorkStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasWorkPermission } from "@/lib/work-permissions";
import { normalizeListingIdentifier } from "@/src/lib/marking/identifiers";
import { getWorkTaskCapabilities, userCanViewAllConsignmentWork } from "./worker-access";
import { canOfferManualAssemblyDiversion, getOrderAssemblyPackingGate } from "./order-assembly";
import { parseOrderAssemblyMetadata } from "./order-assembly-metadata";
import type { OrderAssemblyPolicy } from "./order-assembly-policy";
import { parseOrderMarkingMetadata } from "./route-task-metadata";
import { resolveConsignmentLineWorkflowPrerequisites, resolveOrderShipmentWorkflowPrerequisites, type WorkflowPrerequisiteSummary } from "./workflow-prerequisites";
import { parseImmutableRouteProvenance, type ImmutableRouteProvenance } from "./route-provenance";
import type { PostPickRoute } from "./route-selection";

type Client = PrismaClient | Prisma.TransactionClient;
export type UniversalScanIntent = "ANY" | "PICK" | "MARK" | "ASSEMBLE" | "PACK";
export type UniversalSourceFilter = "ALL" | "CUSTOMER_ORDERS" | "CONSIGNMENTS";

export type UniversalWorkCandidate = {
  candidateKey: string;
  sourceType: "CUSTOMER_ORDER" | "CUSTOMER_ORDER_SHIPMENT" | "CONSIGNMENT_TASK";
  actionType: "ORDER_PICK" | "ORDER_MARK" | "ORDER_PACK" | "ORDER_SEND_TO_ASSEMBLY" | "ORDER_ASSEMBLY" | "ORDER_WAITING_ASSEMBLY" | "CONSIGNMENT_PICK" | "CONSIGNMENT_MARK" | "CONSIGNMENT_ASSEMBLE" | "CONSIGNMENT_PACK" | "PROBLEM" | "READ_ONLY";
  sourceId: string;
  taskId?: string;
  workGroupKey?: string;
  orderId?: string;
  consignmentLineId?: string;
  accountId: string;
  accountName: string;
  marketplace: string;
  sourceLabel: string;
  displayReference: string;
  taskReference?: string;
  consignmentNumber?: string;
  itemReference?: string;
  matchType: string;
  matchedIdentifierMasked?: string;
  productTitle: string | null;
  productImageUrl: string | null;
  productSummary?: string;
  sellerSku: string | null;
  awb?: string | null;
  trackingId?: string | null;
  orderNumber?: string | null;
  shipmentId?: string | null;
  fsn?: string | null;
  listingId?: string | null;
  asin?: string | null;
  fnsku?: string | null;
  stage?: WorkStage;
  status: string;
  requiredQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  shipmentItemCount?: number;
  shipmentTotalQuantity?: number;
  pickedItemCount?: number;
  unpickedItemCount?: number;
  productCount?: number;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  markingMasterDesignId?: string | null;
  markingAssetName?: string | null;
  markingPosition?: string | null;
  markingWidthMm?: number | null;
  markingHeightMm?: number | null;
  markingPower?: number | null;
  markingSpeed?: number | null;
  markingFrequency?: number | null;
  markingPasses?: number | null;
  markingInstructions?: string | null;
  markingPreviewAvailable?: boolean;
  assemblyTitle?: string | null;
  assemblyInstructions?: string | null;
  assemblySource?: string | null;
  assemblyInstructionsRequired?: boolean;
  canAct: boolean;
  readOnlyReason?: string | null;
  packedByName?: string | null;
  packedAt?: Date | null;
  problemReason?: string | null;
  workflowPrerequisites?: WorkflowPrerequisiteSummary;
  missingInstructionStages?: WorkStage[];
  routeDecision?: UniversalScannerRouteDecision;
};

export type UniversalScannerRouteDecision = {
  recommendationSource: "EXPLICIT_SAVED_ROUTE" | "SYSTEM_FALLBACK";
  savedProcessRoute: ProcessRoute | null;
  savedRoute: PostPickRoute;
  options: Array<{ route: PostPickRoute; reasonRequired: boolean; missingInstructionStages: WorkStage[] }>;
};

const PROCESS_ROUTE_CHOICE: Record<ProcessRoute, PostPickRoute> = {
  PICK_PACK: "DIRECT_PACK",
  PICK_MARK_PACK: "MARK",
  PICK_ASSEMBLE_PACK: "ASSEMBLE",
  PICK_MARK_ASSEMBLE_PACK: "MARK_ASSEMBLE"
};
const SCANNER_ROUTES: PostPickRoute[] = ["DIRECT_PACK", "MARK", "ASSEMBLE", "MARK_ASSEMBLE"];
function scannerRouteDecision(provenance: ImmutableRouteProvenance | null): UniversalScannerRouteDecision {
  const explicit = Boolean(provenance?.hasExplicitSavedRoute && provenance.savedProcessRoute);
  const savedRoute = explicit ? PROCESS_ROUTE_CHOICE[provenance!.savedProcessRoute!] : "DIRECT_PACK";
  return {
    recommendationSource: explicit ? "EXPLICIT_SAVED_ROUTE" : "SYSTEM_FALLBACK",
    savedProcessRoute: explicit ? provenance!.savedProcessRoute : null,
    savedRoute,
    options: SCANNER_ROUTES.map((route) => ({
      route,
      reasonRequired: explicit && route !== savedRoute,
      missingInstructionStages: [
        ...(route === "MARK" || route === "MARK_ASSEMBLE" ? (!provenance?.markingInstructionSnapshot ? ["MARK" as const] : []) : []),
        ...(route === "ASSEMBLE" || route === "MARK_ASSEMBLE" ? (!provenance?.assemblyInstructionSnapshot ? ["ASSEMBLE" as const] : []) : [])
      ]
    }))
  };
}

export const LISTING_IDENTIFIER_PRIORITY = [
  "FNSKU",
  "SELLER_SKU",
  "FSN",
  "ASIN",
  "LISTING_ID",
  "LID",
  "EAN",
  "UPC",
  "GTIN",
  "BARCODE",
  "INTERNAL_SKU",
  "EXTERNAL_ID"
] as const;

const MATCH_PRIORITY = ["AWB", "TRACKING_ID", ...LISTING_IDENTIFIER_PRIORITY, "ORDER_NUMBER", "SHIPMENT_ID", "ORDER_ITEM_ID", "WORK_TASK_ID", "CONSIGNMENT_NUMBER"];

export function normalizeUniversalScanCode(value: string) {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) throw new Error("Enter or scan a code.");
  if (normalized.length > 160 || /[\u0000-\u001F\u007F]/.test(normalized)) throw new Error("Scanned code is invalid.");
  return normalized;
}

function mask(value: string) {
  return value.length <= 4 ? value : `...${value.slice(-4)}`;
}

function identifierRank(identifierType: string) {
  const index = LISTING_IDENTIFIER_PRIORITY.indexOf(identifierType as (typeof LISTING_IDENTIFIER_PRIORITY)[number]);
  return index < 0 ? LISTING_IDENTIFIER_PRIORITY.length : index;
}

export function highestPriorityIdentifierType(rows: Array<{ identifierType: string }>) {
  return [...rows].sort((left, right) => identifierRank(left.identifierType) - identifierRank(right.identifierType) || left.identifierType.localeCompare(right.identifierType))[0]?.identifierType;
}

export async function getAuthorizedWorkAccounts(actorUserId: string, client: Client = prisma) {
  const user = await client.user.findUnique({
    where: { id: actorUserId },
    include: {
      assignedAccounts: { where: { active: true }, select: { id: true, name: true, accountDisplayName: true, marketplace: true, active: true } },
      account: { select: { id: true, name: true, accountDisplayName: true, marketplace: true, active: true } }
    }
  });
  if (!user?.active) throw new Error("Worker account is unavailable.");
  const accounts = user.role === "OWNER"
    ? await client.account.findMany({ where: { active: true }, select: { id: true, name: true, accountDisplayName: true, marketplace: true, active: true }, orderBy: [{ marketplace: "asc" }, { name: "asc" }] })
    : [...user.assignedAccounts, ...(user.account?.active ? [user.account] : [])];
  return { user, accounts: [...new Map(accounts.map((account) => [account.id, account])).values()] };
}

export function canViewCustomerOrderProblem(
  user: Pick<User, "id" | "role" | "canPack" | "canViewAllWork">,
  problem: { reportedByIds: string[] }
) {
  return user.role === "OWNER" || user.canPack || user.canViewAllWork || problem.reportedByIds.includes(user.id);
}

function orderMatchType(order: { awb: string; trackingId: string | null; orderNo: string; shipmentId: string | null; orderItemId: string | null; sku: string }, code: string) {
  const upper = code.toUpperCase();
  if (order.awb.toUpperCase() === upper) return "AWB";
  if (order.trackingId?.toUpperCase() === upper) return "TRACKING_ID";
  if (order.orderNo.toUpperCase() === upper) return "ORDER_NUMBER";
  if (order.shipmentId?.toUpperCase() === upper) return "SHIPMENT_ID";
  if (order.orderItemId?.toUpperCase() === upper) return "ORDER_ITEM_ID";
  return order.sku.toUpperCase() === upper ? "SELLER_SKU" : "EXACT";
}

function taskAction(stage: WorkStage, status: string) {
  if (status === "PROBLEM") return "PROBLEM" as const;
  if (stage === "PICK") return "CONSIGNMENT_PICK" as const;
  if (stage === "MARK") return "CONSIGNMENT_MARK" as const;
  if (stage === "ASSEMBLE") return "CONSIGNMENT_ASSEMBLE" as const;
  if (stage === "PACK") return "CONSIGNMENT_PACK" as const;
  return "READ_ONLY" as const;
}

function matchRank(matchType: string) {
  const index = MATCH_PRIORITY.indexOf(matchType);
  return index < 0 ? MATCH_PRIORITY.length : index;
}

function shortTaskReference(taskId: string) {
  return `Task ${taskId.slice(-8)}`;
}

function summarize(values: Array<string | null | undefined>, max = 3) {
  const unique = [...new Set(values.filter((value): value is string => Boolean(value)))];
  if (!unique.length) return null;
  return unique.length <= max ? unique.join(", ") : `${unique.slice(0, max).join(", ")} +${unique.length - max} more`;
}

function shipmentKey(order: { accountId: string; marketplace: string; trackingId: string | null }) {
  return ["FLIPKART", "AMAZON"].includes(order.marketplace) && order.trackingId ? `${order.accountId}\u0000${order.marketplace}\u0000${order.trackingId}` : null;
}

export async function resolveUniversalWork(
  input: { actorUserId: string; code: string; accountId?: string; intent?: UniversalScanIntent; sourceFilter?: UniversalSourceFilter; includeCompleted?: boolean; limit?: number },
  client: Client = prisma
) {
  const started = performance.now();
  const code = normalizeUniversalScanCode(input.code);
  const intent = input.intent ?? "ANY";
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
  const scope = await getAuthorizedWorkAccounts(input.actorUserId, client);
  let accounts = scope.accounts;
  if (input.accountId) {
    if (!accounts.some((account) => account.id === input.accountId)) throw new Error("Selected account is outside your work access.");
    accounts = accounts.filter((account) => account.id === input.accountId);
  }
  const accountIds = accounts.map((account) => account.id);
  if (!accountIds.length) return { normalizedInput: code, searchedAccountCount: 0, exactMatch: true, candidates: [], completedMatchCount: 0, durationMs: Math.round(performance.now() - started) };

  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const upper = code.toUpperCase();
  const orderWhere: Prisma.OrderWhereInput = {
    accountId: { in: accountIds },
    OR: [{ awb: code }, { awb: upper }, { trackingId: code }, { trackingId: upper }, { orderNo: code }, { orderNo: upper }, { shipmentId: code }, { shipmentId: upper }, { orderItemId: code }, { orderItemId: upper }, { sku: code }, { sku: upper }]
  };
  const normalizedOr = LISTING_IDENTIFIER_PRIORITY.flatMap((identifierType) => {
    const normalizedValue = normalizeListingIdentifier(identifierType, code);
    return normalizedValue ? [{ identifierType, normalizedValue }] : [];
  });

  const orderSelect = {
        id: true, accountId: true, marketplace: true, shipmentId: true, orderItemId: true, fsn: true, trackingId: true, awb: true, sku: true, qty: true, orderNo: true,
        productDescription: true, imageUrl: true, pickStatus: true, packStatus: true, status: true, packedAt: true,
        problemOrders: { where: { status: "OPEN" as const }, select: { reportedById: true } }
      } satisfies Prisma.OrderSelect;
  const [activeOrders, completedOrderRows, identifierRows] = await Promise.all([
    client.order.findMany({
      where: {AND:[orderWhere,{packStatus:{not:"PACKED"}}]},select:orderSelect,
      take: limit * 4,
      orderBy: [{ importedAt: "desc" }, { id: "asc" }]
    }),
    client.order.findMany({where:{AND:[orderWhere,{packStatus:"PACKED"}]},select:orderSelect,take:limit,orderBy:[{packedAt:"desc"},{id:"asc"}]}),
    client.marketplaceListingIdentifier.findMany({
      where: { accountId: { in: accountIds }, active: true, OR: normalizedOr },
      select: { marketplaceListingId: true, identifierType: true, normalizedValue: true },
      take: limit * 8,
      orderBy: [{ marketplaceListingId: "asc" }, { identifierType: "asc" }]
    })
  ]),orders=[...activeOrders,...completedOrderRows];

  const trackedShipments = [...new Map(orders.map((order) => [shipmentKey(order), order]).filter((entry): entry is [string, typeof orders[number]] => Boolean(entry[0]))).values()];
  const shipmentOrders = trackedShipments.length
    ? await client.order.findMany({
        where: {
          OR: trackedShipments.map((order) => ({ accountId: order.accountId, marketplace: order.marketplace, trackingId: order.trackingId }))
        },
        select: {
          id: true, accountId: true, marketplace: true, shipmentId: true, orderItemId: true, fsn: true, trackingId: true, awb: true, sku: true, qty: true, orderNo: true,
          productDescription: true, imageUrl: true, pickStatus: true, packStatus: true, status: true, packedAt: true
        },
        orderBy: [{ accountId: "asc" }, { trackingId: "asc" }, { id: "asc" }]
      })
    : [];
  const shipmentMap = new Map<string, typeof shipmentOrders>();
  for (const order of shipmentOrders) {
    const key = shipmentKey(order);
    if (key) shipmentMap.set(key, [...(shipmentMap.get(key) ?? []), order]);
  }
  const gateOrders = [...new Map([...orders, ...shipmentOrders].map((order) => [order.id, order])).values()];
  const assemblyStateByOrder = new Map<string, Awaited<ReturnType<typeof getOrderAssemblyPackingGate>>["states"][number]>();
  const assemblyTaskByOrder = new Map<string, Awaited<ReturnType<typeof getOrderAssemblyPackingGate>>["tasks"][number]>();
  const assemblyPolicyByOrder = new Map<string, OrderAssemblyPolicy>();
  for (const accountId of accountIds) {
    const accountOrders = gateOrders.filter((order) => order.accountId === accountId);
    if (!accountOrders.length) continue;
    const gate = await getOrderAssemblyPackingGate({ accountId, orders: accountOrders.map((order) => ({ id: order.id, accountId: order.accountId, sku: order.sku, productDescription: order.productDescription, imageUrl: order.imageUrl })) }, client);
    gate.states.forEach((state) => assemblyStateByOrder.set(state.orderId, state));
    gate.tasks.forEach((task) => { if (task.orderId) assemblyTaskByOrder.set(task.orderId, task); });
    gate.policies.forEach((policy, orderId) => assemblyPolicyByOrder.set(orderId, policy));
  }
  const orderMarkTasks = gateOrders.length ? await client.workTask.findMany({ where: { accountId: { in: accountIds }, sourceType: "ORDER", orderId: { in: gateOrders.map((order) => order.id) }, stage: "MARK", status: { in: ["READY", "IN_PROGRESS", "PROBLEM"] } }, select: { id: true, orderId: true, status: true, requiredQuantity: true, completedQuantity: true, assignedUserId: true, metadataJson: true, workGroupMembership:{select:{groupKey:true}},assignedUser: { select: { name: true } } } }) : [];
  const orderMarkTaskByOrder = new Map(orderMarkTasks.flatMap((task) => task.orderId ? [[task.orderId, task] as const] : []));
  const orderPickTasks=gateOrders.length?await client.workTask.findMany({where:{accountId:{in:accountIds},sourceType:"ORDER",orderId:{in:gateOrders.map(order=>order.id)},stage:"PICK"},select:{id:true,orderId:true,workCardSnapshotJson:true,routeSnapshotJson:true,workGroupMembership:{select:{groupKey:true}}}}):[],orderPickTaskByOrder=new Map(orderPickTasks.flatMap(task=>task.orderId?[[task.orderId,task] as const]:[]));

  const listingIds = [...new Set(identifierRows.map((row) => row.marketplaceListingId))];
  const taskLineMatch: Prisma.ConsignmentLineWhereInput = {
    consignmentBatch: { status: { in: ["ACTIVE", "PROBLEM", "COMPLETED"] } },
    OR: [
      ...(listingIds.length ? [{ marketplaceListingId: { in: listingIds } }] : []),
      { sellerSkuSnapshot: { in: [code, upper] } },
      { fnskuSnapshot: { in: [code, upper] } },
      { asinSnapshot: { in: [code, upper] } },
      { externalIdSnapshot: { in: [code, upper] } },
      { barcodeSnapshot: { in: [code, upper] } },
      { fsnSnapshot: { in: [code, upper] } },
      { listingIdSnapshot: { in: [code, upper] } },
      { fnskuSource: { in: [code, upper] } },
      { asinSource: { in: [code, upper] } },
      { externalIdSource: { in: [code, upper] } },
      { barcodeSource: { in: [code, upper] } },
      { consignmentBatch: { externalConsignmentNumber: code } }
    ]
  };
  const taskWhere: Prisma.WorkTaskWhereInput = {
    accountId: { in: accountIds },
    sourceType: "CONSIGNMENT",
    stage: intent === "ANY" ? { in: ["PICK", "MARK", "ASSEMBLE", "PACK"] } : intent,
    AND: [{ OR: [{ status: { in: ["READY", "IN_PROGRESS", "PROBLEM"] } }, { status: "COMPLETED", stage: "PACK" }] }],
    OR: [{ id: code }, { consignmentLine: taskLineMatch }]
  };
  const taskSelect = {
    id: true, accountId: true, stage: true, status: true, requiredQuantity: true, completedQuantity: true, assignedUserId: true, completedAt: true, problemReason: true,workCardSnapshotJson:true,routeSnapshotJson:true,
    assignedUser: { select: { name: true } }, completedByUser: { select: { name: true } }, problemReportedByUserId: true,
    consignmentLine: {
      select: {
        id: true, rowNumber: true, marketplaceListingId: true, sellerSkuSnapshot: true, sellerSkuSource: true, fsnSnapshot: true, fsnSource: true,
        listingIdSnapshot: true, asinSnapshot: true, asinSource: true, fnskuSnapshot: true, fnskuSource: true, externalIdSnapshot: true, externalIdSource: true, barcodeSnapshot: true, barcodeSource: true, productTitleSnapshot: true, productNameSource: true, productImageSnapshot: true,
        markingAsset: {
          select: {
            name: true, masterDesignId: true, markingPosition: true, markingWidthMm: true, markingHeightMm: true, powerSetting: true,
            speedSetting: true, frequencySetting: true, passes: true, instructions: true
          }
        },
        consignmentBatch: { select: { externalConsignmentNumber: true } }
      }
    }
  } satisfies Prisma.WorkTaskSelect;
  const [assignedTasks, generalTasks] = await Promise.all([
    client.workTask.findMany({ where: { ...taskWhere, assignedUserId: scope.user.id }, select: taskSelect, take: limit, orderBy: [{ status: "asc" }, { updatedAt: "asc" }, { id: "asc" }] }),
    client.workTask.findMany({ where: taskWhere, select: taskSelect, take: limit * 4, orderBy: [{ status: "asc" }, { updatedAt: "asc" }, { id: "asc" }] })
  ]);
  const tasks = [...new Map([...assignedTasks, ...generalTasks].map((task) => [task.id, task])).values()];

  const candidates: UniversalWorkCandidate[] = [];
  const groupedPackKeys = new Set<string>();
  for (const order of orders) {
    const account = accountMap.get(order.accountId);
    if (!account) continue;
    const wantsPick = intent === "ANY" || intent === "PICK";
    const wantsMark = intent === "ANY" || intent === "MARK";
    const wantsPack = intent === "ANY" || intent === "PACK";
    const wantsAssembly = intent === "ANY" || intent === "ASSEMBLE";
    const isProblem = order.status === "PROBLEM" || order.pickStatus === "PROBLEM" || order.packStatus === "PROBLEM";
    const pickTask=orderPickTaskByOrder.get(order.id),pickProvenance=parseImmutableRouteProvenance(pickTask?.workCardSnapshotJson)??parseImmutableRouteProvenance(pickTask?.routeSnapshotJson);
    const common = {
      sourceType: "CUSTOMER_ORDER" as const,
      sourceId: order.id,
      taskId: pickTask?.id,
      workGroupKey: pickTask?.workGroupMembership?.groupKey,
      orderId: order.id,
      accountId: order.accountId,
      accountName: account.accountDisplayName ?? account.name,
      marketplace: order.marketplace,
      sourceLabel: "Customer order",
      displayReference: order.trackingId ?? order.awb ?? order.orderNo,
      matchType: orderMatchType(order, code),
      matchedIdentifierMasked: mask(code),
      productTitle: order.productDescription,
      productImageUrl: order.imageUrl,
      sellerSku: order.sku,
      awb: order.awb,
      trackingId: order.trackingId,
      orderNumber: order.orderNo,
      shipmentId: order.shipmentId,
      fsn: order.fsn,
      requiredQuantity: order.qty,
      completedQuantity: 0,
      remainingQuantity: order.qty,
      packedAt: order.packedAt,
      missingInstructionStages:(()=>{const missing:WorkStage[]=[];if(!pickProvenance?.markingInstructionSnapshot)missing.push("MARK");if(!pickProvenance?.assemblyInstructionSnapshot)missing.push("ASSEMBLE");return missing;})(),
      routeDecision:scannerRouteDecision(pickProvenance)
    };
    if (order.packStatus === "PACKED") {
      if (intent === "ANY" || intent === "PACK") {const key=shipmentKey(order),shipment=key?shipmentMap.get(key)??[order]:[order];if(!key||!groupedPackKeys.has(key)){if(key)groupedPackKeys.add(key);const totalQuantity=shipment.reduce((sum,item)=>sum+item.qty,0);candidates.push({ ...common,sourceType:key?"CUSTOMER_ORDER_SHIPMENT":"CUSTOMER_ORDER", candidateKey:key?`order-shipment:${order.accountId}:${order.trackingId}:packed`:`order:${order.id}:packed`, actionType: "READ_ONLY", sourceLabel:key?`${order.marketplace === "AMAZON" ? "Amazon" : "Flipkart"} shipment`:"Customer order",productSummary:summarize(shipment.map(item=>item.productDescription??item.sku))??undefined,orderNumber:summarize(shipment.map(item=>item.orderNo)),awb:summarize(shipment.map(item=>item.awb)),shipmentId:summarize(shipment.map(item=>item.shipmentId)), status: "PACKED",requiredQuantity:totalQuantity, completedQuantity: totalQuantity, remainingQuantity: 0, shipmentItemCount: shipment.length, shipmentTotalQuantity: totalQuantity,productCount:new Set(shipment.map(item=>item.sku)).size, canAct: false, readOnlyReason: "Packing is complete. This result is read-only." });}}
      continue;
    }
    const reportedByIds = order.problemOrders.map((problem) => problem.reportedById).filter((id): id is string => Boolean(id));
    if (intent !== "MARK" && isProblem && canViewCustomerOrderProblem(scope.user, { reportedByIds })) {
      candidates.push({ ...common, candidateKey: `order:${order.id}:problem`, actionType: "PROBLEM", status: "PROBLEM", canAct: false, readOnlyReason: "Problem requires review." });
    }
    if (!isProblem && wantsPick && order.pickStatus === "READY") {
      const canPick=hasWorkPermission(scope.user,"canPick");candidates.push({ ...common, candidateKey: `order:${order.id}:pick`, actionType: canPick?"ORDER_PICK":"READ_ONLY", stage:"PICK", status: "PICK_PENDING", canAct: canPick, readOnlyReason: canPick?null:"Pick pending. Pack is locked; Pick permission is required to open Pick work." });
    }
    const markTask = orderMarkTaskByOrder.get(order.id);
    if (!isProblem && wantsMark && markTask) {
      const metadata = parseOrderMarkingMetadata(markTask.metadataJson);
      const assignedElsewhere = Boolean(markTask.assignedUserId && markTask.assignedUserId !== scope.user.id && scope.user.role !== "OWNER");
      const canMark = hasWorkPermission(scope.user, "canMark");
      const canAct = canMark && !assignedElsewhere && markTask.status !== "PROBLEM" && Boolean(metadata);
      candidates.push({ ...common, candidateKey: `order-mark:${markTask.id}`, sourceId: markTask.id, taskId: markTask.id,workGroupKey:markTask.workGroupMembership?.groupKey, actionType: markTask.status === "PROBLEM" ? "PROBLEM" : "ORDER_MARK", sourceLabel: markTask.status === "PROBLEM" ? "Order marking problem" : "Order Marking", stage: "MARK", status: markTask.status, requiredQuantity: markTask.requiredQuantity, completedQuantity: markTask.completedQuantity, remainingQuantity: markTask.requiredQuantity - markTask.completedQuantity, assignedUserId: markTask.assignedUserId, assignedUserName: markTask.assignedUser?.name, markingMasterDesignId: metadata?.masterDesignId, markingAssetName: metadata?.markingAssetName, markingPosition: metadata?.markingPosition, markingWidthMm: metadata?.markingWidthMm, markingHeightMm: metadata?.markingHeightMm, markingPower: metadata?.powerSetting, markingSpeed: metadata?.speedSetting, markingFrequency: metadata?.frequencySetting, markingPasses: metadata?.passes, markingInstructions: metadata?.instructions, canAct, readOnlyReason: markTask.status === "PROBLEM" ? "Problem requires review." : !metadata ? "Marking instructions are malformed." : assignedElsewhere ? "Marking is assigned to another worker." : canMark ? null : "Read-only work view." });
    }
    const assemblyState = assemblyStateByOrder.get(order.id);
    const assemblyTask = assemblyTaskByOrder.get(order.id);
    const assemblyPolicy = assemblyPolicyByOrder.get(order.id);
    if (!isProblem && wantsAssembly && order.pickStatus === "PICKED" && order.packStatus === "READY") {
      if (assemblyTask && ["READY", "IN_PROGRESS", "PROBLEM", "LOCKED"].includes(assemblyTask.status)) {
        const metadata = parseOrderAssemblyMetadata(assemblyTask.metadataJson);
        const canAssemble = hasWorkPermission(scope.user, "canAssemble");
        const assignedElsewhere = Boolean(assemblyTask.assignedUserId && assemblyTask.assignedUserId !== scope.user.id && scope.user.role !== "OWNER");
        const canAct = canAssemble && !assignedElsewhere && assemblyTask.status !== "PROBLEM";
        candidates.push({ ...common, candidateKey: `order-assembly:${assemblyTask.id}`, sourceId: assemblyTask.id, taskId: assemblyTask.id, actionType: canAct ? "ORDER_ASSEMBLY" : "ORDER_WAITING_ASSEMBLY", sourceLabel: assemblyTask.status === "PROBLEM" ? "Assembly problem" : "Order Assembly", displayReference: order.trackingId ?? order.awb, taskReference: shortTaskReference(assemblyTask.id), stage: "ASSEMBLE", status: assemblyTask.status, requiredQuantity: assemblyTask.requiredQuantity, completedQuantity: assemblyTask.completedQuantity, remainingQuantity: assemblyTask.requiredQuantity - assemblyTask.completedQuantity, assignedUserId: assemblyTask.assignedUserId, assemblyTitle: metadata?.assemblyTitle ?? "Assembly instructions unavailable", assemblyInstructions: metadata?.assemblyInstructions ?? "Ask an owner to correct this task.", assemblySource: metadata?.source ?? null, canAct, readOnlyReason: assemblyTask.status === "PROBLEM" ? "Assembly has a reported problem." : assignedElsewhere ? "Assembly is assigned to another worker." : canAssemble ? null : "Waiting for an assembly worker." });
      } else if (canOfferManualAssemblyDiversion(assemblyState?.state)) {
        const canSend = hasWorkPermission(scope.user, "canPack");
        const requiredByRule = assemblyPolicy?.state === "ASSEMBLY_REQUIRED";
        candidates.push({ ...common, candidateKey: `order:${order.id}:send-assembly`, actionType: "ORDER_SEND_TO_ASSEMBLY", sourceLabel: requiredByRule ? "Assembly required" : "Manual assembly option", status: requiredByRule ? "WAITING_FOR_ASSEMBLY" : "READY", assemblyInstructionsRequired: !requiredByRule, canAct: canSend, readOnlyReason: canSend ? null : "A pack-authorized worker may send this order to assembly." });
      }
    }
    if (!wantsPack) continue;

    const key = shipmentKey(order);
    if (key) {
      if (groupedPackKeys.has(key)) continue;
      groupedPackKeys.add(key);
      const shipment = shipmentMap.get(key) ?? [order];
      const problemCount = shipment.filter((item) => item.status === "PROBLEM" || item.pickStatus === "PROBLEM" || item.packStatus === "PROBLEM").length;
      const unpickedCount = shipment.filter((item) => item.pickStatus !== "PICKED").length;
      const pickedItemCount = shipment.length - unpickedCount;
      const totalQuantity = shipment.reduce((total, item) => total + item.qty, 0);
      const workflow = await resolveOrderShipmentWorkflowPrerequisites({ accountId: order.accountId, orderIds: shipment.map(item => item.id) }, client);
      const packReady = workflow.package.packReady && shipment.every((item) => ["READY", "PACKED"].includes(item.packStatus));
      const packable = packReady && hasWorkPermission(scope.user, "canPack");
      const products = [...new Set(shipment.map((item) => item.sku))];
      candidates.push({
        ...common,
        sourceType: "CUSTOMER_ORDER_SHIPMENT",
        candidateKey: `order-shipment:${order.accountId}:${order.trackingId}`,
        actionType: "ORDER_PACK",
        sourceLabel: `${order.marketplace === "AMAZON" ? "Amazon" : "Flipkart"} shipment`,
        displayReference: order.trackingId ?? order.awb,
        productSummary: summarize(shipment.map((item) => item.productDescription ?? item.sku)) ?? undefined,
        orderNumber: summarize(shipment.map((item) => item.orderNo)),
        awb: summarize(shipment.map((item) => item.awb)),
        shipmentId: summarize(shipment.map((item) => item.shipmentId)),
        status: packReady ? "PACK_READY" : problemCount ? "PROBLEM" : workflow.package.stages.MARK.state !== "SATISFIED" && workflow.package.stages.MARK.state !== "NOT_REQUIRED" ? "MARK_PENDING" : workflow.package.stages.ASSEMBLE.state !== "SATISFIED" && workflow.package.stages.ASSEMBLE.state !== "NOT_REQUIRED" ? "ASSEMBLY_PENDING" : "PICK_PENDING",
        requiredQuantity: totalQuantity,
        completedQuantity: shipment.filter((item) => item.pickStatus === "PICKED").reduce((total, item) => total + item.qty, 0),
        remainingQuantity: shipment.filter((item) => item.pickStatus !== "PICKED").reduce((total, item) => total + item.qty, 0),
        shipmentItemCount: shipment.length,
        shipmentTotalQuantity: totalQuantity,
        pickedItemCount,
        unpickedItemCount: unpickedCount,
        productCount: products.length,
        workflowPrerequisites: workflow.package,
        canAct: packable,
        readOnlyReason: problemCount ? "Shipment contains problem work." : workflow.package.blocker ? `${workflow.package.blocker} Pack is locked.` : packable ? null : packReady ? "Pack permission is required." : "Shipment changed; scan again before packing."
      });
    } else if (!isProblem) {
      const workflow=await resolveOrderShipmentWorkflowPrerequisites({accountId:order.accountId,orderIds:[order.id]},client),packReady=workflow.package.packReady&&order.packStatus==="READY",packable=packReady&&hasWorkPermission(scope.user,"canPack");
      candidates.push({ ...common, candidateKey: `order:${order.id}:pack`, actionType: "ORDER_PACK", stage:"PACK", status: packReady ? "PACK_READY" : workflow.package.stages.MARK.state!=="SATISFIED"&&workflow.package.stages.MARK.state!=="NOT_REQUIRED"?"MARK_PENDING":workflow.package.stages.ASSEMBLE.state!=="SATISFIED"&&workflow.package.stages.ASSEMBLE.state!=="NOT_REQUIRED"?"ASSEMBLY_PENDING":"PICK_PENDING", workflowPrerequisites:workflow.package,canAct: packable, readOnlyReason: packable ? null : !packReady ? `${workflow.package.blocker??"Workflow prerequisites are incomplete."} Pack is locked.` : "Pack permission is required." });
    }
  }

  const consignmentWorkflowByLine=new Map<string,WorkflowPrerequisiteSummary>();
  for (const task of tasks) {
    const line = task.consignmentLine;
    const account = accountMap.get(task.accountId);
    if (!line || !account) continue;
    const visibleProblem = task.status !== "PROBLEM" || userCanViewAllConsignmentWork(scope.user) || task.assignedUserId === scope.user.id || task.problemReportedByUserId === scope.user.id;
    if (!visibleProblem) continue;
    const capabilities = getWorkTaskCapabilities(scope.user, task);
    let workflow=consignmentWorkflowByLine.get(line.id);if(!workflow){workflow=await resolveConsignmentLineWorkflowPrerequisites({accountId:task.accountId,consignmentLineId:line.id},client);consignmentWorkflowByLine.set(line.id,workflow);}
    const canAct = task.status !== "PROBLEM" && capabilities.canProgress && (task.stage!=="PACK"||workflow.packReady);
    const matchingRows = identifierRows.filter((row) => row.marketplaceListingId === line.marketplaceListingId);
    let matchType = highestPriorityIdentifierType(matchingRows);
    if (task.id === code) matchType = "WORK_TASK_ID";
    else if (!matchType && (line.fnskuSnapshot??line.fnskuSource) && [code, upper].includes((line.fnskuSnapshot??line.fnskuSource)!)) matchType = "FNSKU";
    else if (!matchType && line.sellerSkuSnapshot && [code, upper].includes(line.sellerSkuSnapshot)) matchType = "SELLER_SKU";
    else if (!matchType && (line.asinSnapshot??line.asinSource) && [code, upper].includes((line.asinSnapshot??line.asinSource)!)) matchType = "ASIN";
    else if (!matchType && (line.externalIdSnapshot??line.externalIdSource) && [code, upper].includes((line.externalIdSnapshot??line.externalIdSource)!)) matchType = "EXTERNAL_ID";
    else if (!matchType && (line.barcodeSnapshot??line.barcodeSource) && [code, upper].includes((line.barcodeSnapshot??line.barcodeSource)!)) matchType = "BARCODE";
    else if (!matchType && line.fsnSnapshot && [code, upper].includes(line.fsnSnapshot)) matchType = "FSN";
    else if (!matchType && line.listingIdSnapshot && [code, upper].includes(line.listingIdSnapshot)) matchType = "LISTING_ID";
    else if (!matchType && line.consignmentBatch.externalConsignmentNumber === code) matchType = "CONSIGNMENT_NUMBER";
    const asset = line.markingAsset;
    const provenance=parseImmutableRouteProvenance(task.workCardSnapshotJson)??parseImmutableRouteProvenance(task.routeSnapshotJson),missingInstructionStages:WorkStage[]=[];if(!provenance?.markingInstructionSnapshot)missingInstructionStages.push("MARK");if(!provenance?.assemblyInstructionSnapshot)missingInstructionStages.push("ASSEMBLE");
    candidates.push({
      candidateKey: `task:${task.id}`,
      sourceType: "CONSIGNMENT_TASK",
      actionType: task.stage==="PICK"&&capabilities.canProgress?"CONSIGNMENT_PICK":canAct ? taskAction(task.stage, task.status) : task.status === "PROBLEM" ? "PROBLEM" : "READ_ONLY",
      sourceId: task.id,
      taskId: task.id,
      consignmentLineId: line.id,
      accountId: task.accountId,
      accountName: account.accountDisplayName ?? account.name,
      marketplace: String(account.marketplace),
      sourceLabel: task.status === "PROBLEM" ? "Problem - read only" : task.status === "COMPLETED" ? "Completed consignment" : `Consignment ${task.stage[0]}${task.stage.slice(1).toLowerCase()}`,
      displayReference: line.consignmentBatch.externalConsignmentNumber,
      consignmentNumber: line.consignmentBatch.externalConsignmentNumber,
      taskReference: shortTaskReference(task.id),
      itemReference: `Row ${line.rowNumber}`,
      matchType: matchType ?? "SNAPSHOT_OR_CONSIGNMENT",
      matchedIdentifierMasked: mask(code),
      productTitle: line.productTitleSnapshot ?? line.productNameSource,
      productImageUrl: line.productImageSnapshot,
      sellerSku: line.sellerSkuSnapshot ?? line.sellerSkuSource,
      fsn: line.fsnSnapshot ?? line.fsnSource,
      listingId: line.listingIdSnapshot,
      asin: line.asinSnapshot ?? line.asinSource,
      fnsku: line.fnskuSnapshot ?? line.fnskuSource,
      stage: task.stage,
      status: task.status,
      requiredQuantity: task.requiredQuantity,
      completedQuantity: task.completedQuantity,
      remainingQuantity: task.requiredQuantity - task.completedQuantity,
      assignedUserId: task.assignedUserId,
      assignedUserName: task.assignedUser?.name,
      packedByName: task.stage==="PACK"&&task.status==="COMPLETED"?task.completedByUser?.name:null,
      packedAt: task.stage==="PACK"&&task.status==="COMPLETED"?task.completedAt:null,
      problemReason: task.problemReason,
      workflowPrerequisites:workflow,
      missingInstructionStages,
      routeDecision:task.stage==="PICK"?scannerRouteDecision(provenance):undefined,
      markingMasterDesignId: asset?.masterDesignId,
      markingAssetName: asset?.name,
      markingPosition: asset?.markingPosition,
      markingWidthMm: asset?.markingWidthMm,
      markingHeightMm: asset?.markingHeightMm,
      markingPower: asset?.powerSetting,
      markingSpeed: asset?.speedSetting,
      markingFrequency: asset?.frequencySetting,
      markingPasses: asset?.passes,
      markingInstructions: asset?.instructions,
      canAct,
      readOnlyReason: canAct ? null : task.stage==="PACK"&&workflow.blocker?`${workflow.blocker} Pack is locked.`:task.stage==="PICK"&&capabilities.canProgress?"Pack locked. Open Details to continue in Pick work.":task.status === "COMPLETED" ? "Packing is complete. This result is read-only." : task.status === "PROBLEM" ? "Problem requires authorized review." : "Task is assigned to another worker or you lack stage permission."
    });
  }

  const [completedOrders, completedTasks] = await Promise.all([
    client.order.count({ where: { ...orderWhere, packStatus: "PACKED" } }),
    client.workTask.count({
      where: {
        accountId: { in: accountIds }, sourceType: "CONSIGNMENT", status: "COMPLETED", stage: intent === "ANY" ? { in: ["PICK", "MARK", "ASSEMBLE", "PACK"] } : intent,
        OR: [{ id: code }, { consignmentLine: { OR: [...(listingIds.length ? [{ marketplaceListingId: { in: listingIds } }] : []), { sellerSkuSnapshot: { in: [code, upper] } }, { fnskuSnapshot: { in: [code, upper] } }, { asinSnapshot: { in: [code, upper] } }, { externalIdSnapshot: { in: [code, upper] } }, { barcodeSnapshot: { in: [code, upper] } }, { fsnSnapshot: { in: [code, upper] } }, { listingIdSnapshot: { in: [code, upper] } }, { consignmentBatch: { externalConsignmentNumber: code } }] } }]
      }
    })
  ]);
  const rank = (candidate: UniversalWorkCandidate) => [
    candidate.assignedUserId === scope.user.id ? 0 : 1,
    candidate.canAct ? 0 : 1,
    String(matchRank(candidate.matchType)).padStart(2, "0"),
    candidate.status === "READY" ? 0 : 1,
    candidate.candidateKey
  ].join("|");
  candidates.sort((left, right) => rank(left).localeCompare(rank(right)));
  const filteredCandidates = input.sourceFilter === "CUSTOMER_ORDERS" ? candidates.filter((candidate) => candidate.sourceType !== "CONSIGNMENT_TASK") : input.sourceFilter === "CONSIGNMENTS" ? candidates.filter((candidate) => candidate.sourceType === "CONSIGNMENT_TASK") : candidates;
  return {
    normalizedInput: code,
    searchedAccountCount: accounts.length,
    exactMatch: true,
    candidates: filteredCandidates.slice(0, limit),
    completedMatchCount: completedOrders + completedTasks,
    durationMs: Math.round(performance.now() - started)
  };
}
