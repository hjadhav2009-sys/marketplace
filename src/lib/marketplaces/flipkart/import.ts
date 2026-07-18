import { Prisma, type Account, type ProcessRoute, type User } from "@prisma/client";
import { recordAuditLog } from "@/lib/audit";
import type { RequestMeta } from "@/lib/network";
import { prisma } from "@/lib/prisma";
import { canonicalSkuIdentity, normalizeSkuForMatching } from "@/lib/sku";
import { maskOperationalKey } from "@/lib/import/issues";
import { setImportJobBatch, updateImportJobProgress } from "@/src/lib/import-jobs/store";
import { normalizeListingIdentifier, syncIdentifiersForImportedListings } from "@/src/lib/marking/identifiers";
import { createWorkRouteSnapshot } from "@/src/lib/workflow/dynamic-route";
import { createImmutableRouteProvenance } from "@/src/lib/workflow/route-provenance";
import { refreshAffectedWorkGroups } from "@/src/lib/workflow/work-group-projection";
import { buildFlipkartListingFormSchema } from "@/src/lib/catalog/dynamic-form-profiles";
import { findHeaderProfile, saveHeaderProfile } from "@/src/lib/imports/header-profiles";
import {
  chunkFlipkartListingRows,
  dedupeFlipkartListingRows,
  flipkartListingIsInactive,
  flipkartListingMasterData,
  sameFlipkartListingMaster
} from "./listing-master";
import {
  flipkartInternalOrderKey,
  parseFlipkartListingRows,
  parseFlipkartOrderRows,
  type FlipkartOrderLine,
  type FlipkartParseIssue,
  type FlipkartRawRow
} from "./parser";
import { dedupeFlipkartOrderRows, flipkartIssueRawContext, flipkartOrderMappingIssue } from "./review";

const FLIPKART_LISTING_CREATE_BATCH_SIZE = 100;
const FLIPKART_LISTING_UPDATE_BATCH_SIZE = 50;
const FLIPKART_ORDER_TRANSACTION_BATCH_SIZE = 200;

const ORDER_IMPORT_SELECT = {
  id: true,
  batchId: true,
  awb: true,
  sku: true,
  qty: true,
  orderNo: true,
  productDescription: true,
  city: true,
  state: true,
  imageUrl: true,
  shipmentId: true,
  orderItemId: true,
  fsn: true,
  trackingId: true,
  workTasks: {
    select: {
      id: true,
      status: true,
      completedQuantity: true,
      assignedUserId: true,
      startedAt: true,
      completedAt: true,
      stage: true
    }
  }
} satisfies Prisma.OrderSelect;

type ExistingFlipkartOrder = {
  id: string;
  awb: string;
  sku: string;
  qty: number;
  orderNo: string;
  productDescription: string | null;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  shipmentId: string | null;
  orderItemId: string | null;
  fsn: string | null;
  trackingId: string | null;
};

function reviewedOrderImportRace(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P1008", "P2028", "P2034"].includes(error.code)) return true;
    if (error.code !== "P2002") return false;
    const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [String(error.meta?.target ?? "")];
    const reviewedTargets = [
      ["accountId", "awb"],
      ["orderId", "stage"],
      ["orderId", "sequenceNumber"],
      ["groupKey"],
      ["taskId"],
      ["accountId", "sourceType", "stage"]
    ];
    return reviewedTargets.some((fields) => fields.every((field) => target.some((item) => item.includes(field))));
  }
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked|write conflict|transaction.*(?:closed|conflict|timeout)/i.test(message);
}

async function runOrderImportTransaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await prisma.$transaction(action, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000
      });
    } catch (error) {
      if (!reviewedOrderImportRace(error)) throw error;
      if (attempt === 5) throw new Error("Order import work is busy; retry the import.");
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw new Error("Order import work is busy; retry the import.");
}

function orderNotes(result: {
  parser: "flipkart-orders-xlsx";
  parsedRows: number;
  importableRows: number;
  heldRows: number;
  missingImageRows: number;
  alreadyImportedRows?: number;
  repeatedSourceRows?: number;
  conflictingRows?: number;
}) {
  return JSON.stringify({
    marketplace: "FLIPKART",
    ...result
  });
}

function sameOrder(existing: ExistingFlipkartOrder, order: FlipkartOrderLine, imageUrl: string | null) {
  return (
    existing.sku === canonicalSkuIdentity(order.sku) &&
    existing.qty === (order.quantity ?? 1) &&
    existing.orderNo === (order.orderId ?? order.shipmentId ?? existing.awb) &&
    (existing.productDescription ?? "") === (order.productTitle ?? "") &&
    (existing.city ?? "") === (order.city ?? "") &&
    (existing.state ?? "") === (order.state ?? "") &&
    (existing.imageUrl ?? "") === (imageUrl ?? "") &&
    (existing.shipmentId ?? "") === (order.shipmentId ?? "") &&
    (existing.orderItemId ?? "") === (order.orderItemId ?? "") &&
    (existing.fsn ?? "") === (order.fsn ?? "") &&
    (existing.trackingId ?? "") === (order.trackingId ?? "")
  );
}

function boundedSafeIssueText(value: unknown, max = 160) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).normalize("NFKC").trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function safeIssueExtras(value: Record<string, unknown> | undefined) {
  if (!value) return {};
  const result: Record<string, unknown> = {};
  const listingIds = Array.isArray(value.listingIds)
    ? value.listingIds.flatMap((item) => {
        const text = boundedSafeIssueText(item);
        return text ? [text] : [];
      }).slice(0, 25)
    : [];
  const rowNumbers = Array.isArray(value.rowNumbers)
    ? value.rowNumbers.filter((item): item is number => Number.isSafeInteger(item) && item > 0).slice(0, 50)
    : [];
  if (listingIds.length) result.listingIds = listingIds;
  if (rowNumbers.length) result.rowNumbers = rowNumbers;
  for (const key of ["accountId", "marketplace", "orderId", "fsn"] as const) {
    const text = boundedSafeIssueText(value[key]);
    if (text) result[key] = text;
  }
  return result;
}

function issueCreateData(batchId: string, issue: FlipkartParseIssue): Prisma.ImportRowIssueCreateManyInput {
  const context = flipkartIssueRawContext(issue.rawData);
  const supplied = issue.safeData ?? {};
  const sellerSku = canonicalSkuIdentity(context.sku ?? boundedSafeIssueText(supplied.sellerSku));
  const shipmentId = context.shipmentId ?? boundedSafeIssueText(supplied.shipmentId);
  const orderItemId = context.orderItemId ?? boundedSafeIssueText(supplied.orderItemId);
  const trackingId = context.trackingId ?? boundedSafeIssueText(supplied.trackingId);
  return {
    batchId,
    rowNumber: issue.rowNumber,
    issueType: issue.issueType,
    message: issue.message,
    rawData: null,
    safeDataJson: JSON.stringify({
      ...safeIssueExtras(supplied),
      rowNumber: issue.rowNumber,
      sellerSku: sellerSku || null,
      shipmentId: maskOperationalKey(shipmentId),
      orderItemId: maskOperationalKey(orderItemId),
      trackingId: maskOperationalKey(trackingId),
      issueCode: issue.issueType
    }),
    severity: issue.severity ?? "WARNING",
    sourceType: issue.sourceType ?? null,
    sourceId: issue.sourceId ?? null
  };
}

async function writeIssues(batchId: string, issues: FlipkartParseIssue[], client: Prisma.TransactionClient | typeof prisma = prisma) {
  if (issues.length === 0) return;
  await client.importRowIssue.createMany({ data: issues.map((issue) => issueCreateData(batchId, issue)) });
}

export async function importFlipkartOrderRows(input: {
  rows: FlipkartRawRow[];
  fileName: string;
  account: Account;
  user: User;
  request?: RequestMeta;
  jobId?: string;
  runnerId?: string;
  assertLease?: () => Promise<void>;
}) {
  await input.assertLease?.();
  const parsed = parseFlipkartOrderRows(input.rows, input.fileName);
  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: input.account.id,
      createdByUserId: input.user.id,
      fileName: input.fileName,
      importType: "ORDER_LABEL",
      status: "UPLOADED",
      totalRows: input.rows.length,
      notes: orderNotes({
        parser: "flipkart-orders-xlsx",
        parsedRows: input.rows.length,
        importableRows: parsed.orders.length,
        heldRows: parsed.issues.length,
        missingImageRows: 0
      })
    }
  });
  if (input.jobId) {
    await setImportJobBatch(input.jobId, batch.id, input.runnerId);
    await updateImportJobProgress(input.jobId, {
      totalRows: input.rows.length,
      processedRows: 0,
      errorRows: parsed.issues.length,
      warningRows: 0
    }, input.runnerId);
  }
  const duplicateIssues: FlipkartParseIssue[] = [];
  const deduped = dedupeFlipkartOrderRows(parsed.orders);
  duplicateIssues.push(...deduped.duplicateIssues);
  const importableOrders = deduped.importableOrders;
  const orderSkus = Array.from(
    new Set(importableOrders.flatMap((order) => [order.sku, normalizeSkuForMatching(order.sku)].filter((sku): sku is string => Boolean(sku))))
  );
  const orderFsns=Array.from(new Set(importableOrders.map(order=>order.fsn).filter((value):value is string=>Boolean(value))));
  const normalizedOrderIdentifiers=[...new Set([...orderSkus.map(value=>normalizeListingIdentifier("SELLER_SKU",value)),...orderSkus.map(value=>normalizeListingIdentifier("INTERNAL_SKU",value)),...orderFsns.map(value=>normalizeListingIdentifier("FSN",value))].filter((value):value is string=>Boolean(value)))];
  const listings = await prisma.marketplaceListing.findMany({
      where: {
        accountId: input.account.id,
        marketplace: "FLIPKART",
        OR: [
          { sku: { in: orderSkus } },
          { sellerSkuId: { in: orderSkus } },
          { fsn: { in: orderFsns } },
          { identifiers: { some: { normalizedValue: { in: normalizedOrderIdentifiers }, active: true } } }
        ]
      },
      select: {
        id: true,
        sellerSkuId: true,
        sku: true,
        mainImageUrl: true,
        productTitle: true,
        fsn: true,
        listingId: true,
        liveBrand: true,
        liveCategory: true,
        identifiers:{where:{active:true},select:{identifierType:true,normalizedValue:true}},
        processRules: { where: { active: true }, orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, route: true, updatedAt: true, markingRequired: true, assemblyRequired: true, assemblyTitle: true, assemblyInstructions: true, assemblyImageUrl: true, markingAssetId: true, markingAsset: { select: { id: true, name: true, masterDesignId: true, material: true, markingPosition: true, markingWidthMm: true, markingHeightMm: true, powerSetting: true, speedSetting: true, frequencySetting: true, passes: true, instructions: true } } } }
      }
    });
  const candidateIndex=new Map<string,typeof listings>();const addCandidate=(type:string,normalized:string|null,listing:(typeof listings)[number])=>{if(!normalized)return;const key=`${type}:${normalized}`,values=candidateIndex.get(key)??[];if(!values.some(item=>item.id===listing.id))candidateIndex.set(key,[...values,listing]);};for(const listing of listings){addCandidate("SELLER_SKU",normalizeListingIdentifier("SELLER_SKU",listing.sellerSkuId),listing);addCandidate("INTERNAL_SKU",normalizeListingIdentifier("INTERNAL_SKU",listing.sku),listing);addCandidate("FSN",normalizeListingIdentifier("FSN",listing.fsn),listing);for(const identifier of listing.identifiers)addCandidate(identifier.identifierType,identifier.normalizedValue,listing);}
  const listingMatch=(order:FlipkartOrderLine)=>{const priorities=[["SELLER_SKU",order.sku],["INTERNAL_SKU",order.sku],["FSN",order.fsn]] as const;for(const[type,value]of priorities){const normalized=normalizeListingIdentifier(type,value),candidates=normalized?candidateIndex.get(`${type}:${normalized}`)??[]:[];if(candidates.length===1)return{listing:candidates[0],status:"EXACT_UNIQUE" as const};if(candidates.length>1)return{listing:null,status:"EXACT_MULTIPLE" as const,candidates};}return{listing:null,status:"NOT_FOUND" as const};};
  let createdRows = 0;
  let updatedRows = 0;
  let alreadyImportedRows = 0;
  let missingImageRows = 0;
  let processedRows = parsed.issues.length + duplicateIssues.length + deduped.repeatedSourceRows;
  const mappingIssues: FlipkartParseIssue[] = [];
  const deferredMappingIssues: FlipkartParseIssue[] = [];

  await writeIssues(batch.id, [...parsed.issues.map(issue=>({...issue,severity:"BLOCKING_ERROR" as const})), ...duplicateIssues]);
  if (input.jobId) {
    await updateImportJobProgress(input.jobId, {
      processedRows,
      duplicateRows: duplicateIssues.length + deduped.repeatedSourceRows,
      warningRows: 0,
      errorRows: parsed.issues.length + duplicateIssues.length
    }, input.runnerId);
  }

  const preparedOrders = importableOrders.flatMap((order) => {
    const internalKey = flipkartInternalOrderKey(order);
    if (!internalKey) return [];
    const sku = canonicalSkuIdentity(order.sku);
    const matched = listingMatch(order);
    const listing = matched.listing;
    const imageUrl = listing?.mainImageUrl ?? null;
    const mappingIssue = matched.status === "EXACT_MULTIPLE"
      ? {
          rowNumber: order.rowNumber,
          issueType: "AMBIGUOUS_LISTING",
          severity: "BLOCKING_ERROR" as const,
          message: `Multiple account listings match Seller SKU or FSN for ${sku}; owner selection is required.`,
          rawData: order.rawData ?? {},
          safeData: { listingIds: matched.candidates.map((candidate) => candidate.id) }
        }
      : flipkartOrderMappingIssue(order, {
          listingFound: Boolean(listing),
          hasMainImage: Boolean(listing?.mainImageUrl)
        });
    const orderData: Prisma.OrderCreateManyInput = {
      accountId: input.account.id,
      batchId: batch.id,
      marketplace: "FLIPKART",
      shipmentId: order.shipmentId ?? null,
      orderItemId: order.orderItemId ?? null,
      fsn: order.fsn ?? null,
      trackingId: order.trackingId ?? null,
      awb: internalKey,
      courier: null,
      sku,
      qty: order.quantity ?? 1,
      color: null,
      size: null,
      orderNo: order.orderId ?? order.shipmentId ?? internalKey,
      productDescription: order.productTitle ?? null,
      paymentType: "UNKNOWN",
      city: order.city ?? null,
      state: order.state ?? null,
      imageUrl
    };
    let taskData: Prisma.WorkTaskCreateManyInput | null = null;
    if (listing) {
      const savedRule = listing.processRules[0] ?? null;
      const route = (savedRule?.route ?? "PICK_PACK") as ProcessRoute;
      const provenance = createImmutableRouteProvenance({ route, rule: savedRule });
      taskData = {
        accountId: input.account.id,
        sourceType: "ORDER",
        stage: "PICK",
        sequenceNumber: 1,
        requiredQuantity: order.quantity ?? 1,
        status: "READY",
        metadataJson: JSON.stringify({ version: 1, recommendedProcessRoute: route }),
        workCardSnapshotJson: JSON.stringify({
          version: 2,
          productTitle: listing.productTitle ?? order.productTitle ?? null,
          primaryImage: listing.mainImageUrl ?? null,
          sellerSku: sku,
          operationalBarcode: order.trackingId ?? internalKey,
          marketplaceIdentifiers: {
            fsn: order.fsn ?? listing.fsn ?? null,
            listingId: listing.listingId ?? null,
            orderItemId: order.orderItemId ?? null,
            trackingId: order.trackingId ?? null
          },
          category: listing.liveCategory ?? null,
          brand: listing.liveBrand ?? null,
          variantIdentity: null,
          ...provenance
        }),
        routeSnapshotJson: JSON.stringify({ ...createWorkRouteSnapshot({ processRoute: route, currentStage: "PICK" }), ...provenance })
      };
    }
    return [{ order, internalKey, sku, imageUrl, mappingIssue, orderData, taskData }];
  });

  type PreparedOrder = (typeof preparedOrders)[number];
  type OrderOutcome = {
    item: PreparedOrder;
    state: "CREATED" | "UPDATED" | "UNCHANGED" | "ACTIVE_CONFLICT" | "FALLBACK_CONFLICT";
    orderId: string | null;
    issue?: FlipkartParseIssue;
    catalogIssuePersisted?: boolean;
  };

  const scopedMappingIssue = (item: PreparedOrder, orderId: string): FlipkartParseIssue | null => item.mappingIssue
    ? {
        ...item.mappingIssue,
        sourceType: "ORDER",
        sourceId: orderId,
        safeData: {
          ...(item.mappingIssue.safeData ?? {}),
          accountId: input.account.id,
          marketplace: "FLIPKART",
          sellerSku: item.sku,
          orderId,
          fsn: item.order.fsn ?? null
        }
      }
    : null;

  const fallbackConflictIssue = (item: PreparedOrder, sourceId: string | null, ambiguous: boolean): FlipkartParseIssue => ({
    rowNumber: item.order.rowNumber,
    issueType: "FALLBACK_IDENTITY_CONFLICT",
    severity: "BLOCKING_ERROR",
    message: ambiguous
      ? "The fallback Shipment ID and Seller SKU identity matches multiple existing package candidates. No Order or work was created."
      : "The fallback Shipment ID, Seller SKU, quantity, or package identity conflicts with existing Order work. No second Order or work was created.",
    rawData: item.order.rawData ?? {},
    sourceType: "ORDER",
    sourceId: sourceId ?? undefined,
    safeData: {
      accountId: input.account.id,
      marketplace: "FLIPKART",
      sellerSku: item.sku,
      orderId: sourceId
    }
  });

  for (const chunk of chunkFlipkartListingRows(preparedOrders, FLIPKART_ORDER_TRANSACTION_BATCH_SIZE)) {
    await input.assertLease?.();
    const outcomes = await runOrderImportTransaction<OrderOutcome[]>(async (tx) => {
      const exactOrders = await tx.order.findMany({
        where: { accountId: input.account.id, awb: { in: chunk.map((item) => item.internalKey) } },
        select: ORDER_IMPORT_SELECT
      });
      const exactByKey = new Map(exactOrders.map((order) => [order.awb, order]));
      const unmatched = chunk.filter((item) => !exactByKey.has(item.internalKey));
      const shipmentIds = [...new Set(unmatched.flatMap((item) => item.order.shipmentId ? [item.order.shipmentId] : []))];
      const trackingIds = [...new Set(unmatched.flatMap((item) => item.order.trackingId ? [item.order.trackingId] : []))];
      const orderNumbers = [...new Set(unmatched.flatMap((item) => item.order.orderId ? [item.order.orderId] : []))];
      const packageWhere: Prisma.OrderWhereInput[] = [
        ...(shipmentIds.length ? [{ shipmentId: { in: shipmentIds } }] : []),
        ...(trackingIds.length ? [{ trackingId: { in: trackingIds } }] : []),
        ...(orderNumbers.length ? [{ orderNo: { in: orderNumbers } }] : [])
      ];
      const priorSharedOrders = packageWhere.length
        ? await tx.order.findMany({
            where: { accountId: input.account.id, OR: packageWhere },
            select: { id: true, batchId: true, shipmentId: true, trackingId: true, orderItemId: true, orderNo: true, sku: true }
          })
        : [];
      const createdSharedOrders: typeof priorSharedOrders = [];
      const results: OrderOutcome[] = [];
      const affectedTaskIds: string[] = [];
      const affectedOrderIds: string[] = [];
      let createdTask = false;
      let refreshedTask = false;

      const createPick = async (item: PreparedOrder, orderId: string) => {
        if (!item.taskData) return null;
        const task = await tx.workTask.create({
          data: { ...item.taskData, orderId } as Prisma.WorkTaskUncheckedCreateInput,
          select: { id: true }
        });
        affectedTaskIds.push(task.id);
        affectedOrderIds.push(orderId);
        createdTask = true;
        return task.id;
      };

      const persistHeldCatalogIssue = async (item: PreparedOrder, orderId: string) => {
        const issue = scopedMappingIssue(item, orderId);
        if (!issue || !["MISSING_FLIPKART_LISTING_MAPPING", "AMBIGUOUS_LISTING"].includes(issue.issueType)) return false;
        const existing = await tx.importRowIssue.findFirst({
          where: {
            sourceType: "ORDER",
            sourceId: orderId,
            resolved: false,
            issueType: { in: ["MISSING_FLIPKART_LISTING_MAPPING", "AMBIGUOUS_LISTING"] },
            batch: { accountId: input.account.id }
          },
          select: { id: true }
        });
        if (!existing) await writeIssues(batch.id, [issue], tx);
        return true;
      };

      for (const item of chunk) {
        const exact = exactByKey.get(item.internalKey) ?? null;
        const sharedCandidates = !exact
          ? [...priorSharedOrders, ...createdSharedOrders].filter((candidate) =>
              Boolean(item.order.shipmentId && candidate.shipmentId === item.order.shipmentId)
              || Boolean(item.order.trackingId && candidate.trackingId === item.order.trackingId)
              || Boolean(item.order.orderId && candidate.orderNo === item.order.orderId)
            ).slice(0, 25)
          : [];
        // A marketplace Order Item ID is the primary identity. Two different
        // primary IDs remain distinct even when the package and Seller SKU are
        // the same. Only a legacy/shared candidate that has no primary ID and
        // the same SKU is ambiguous with a newly primary-identified row.
        // Without a primary identity, a distinct SKU arriving only in a later
        // batch remains an unsafe fallback-identity change; same-file fallback
        // siblings are allowed because both source rows are reviewed together.
        const fallbackCandidates = sharedCandidates.filter((candidate) => {
          if (item.order.orderItemId) {
            return !candidate.orderItemId && canonicalSkuIdentity(candidate.sku) === item.sku;
          }
          if (candidate.batchId !== batch.id) return true;
          const sameCurrentFallbackPackage = !candidate.orderItemId
            && canonicalSkuIdentity(candidate.sku) !== item.sku
            && (candidate.shipmentId ?? "") === (item.order.shipmentId ?? "")
            && (candidate.trackingId ?? "") === (item.order.trackingId ?? "")
            && candidate.orderNo === (item.order.orderId ?? item.order.shipmentId ?? item.internalKey);
          return !sameCurrentFallbackPackage;
        });
        if (fallbackCandidates.length) {
          results.push({
            item,
            state: "FALLBACK_CONFLICT",
            orderId: fallbackCandidates[0]?.id ?? exact?.id ?? null,
            issue: fallbackConflictIssue(item, fallbackCandidates[0]?.id ?? exact?.id ?? null, fallbackCandidates.length > 1)
          });
          continue;
        }

        if (!exact) {
          const created = await tx.order.create({ data: item.orderData, select: { id: true } });
          createdSharedOrders.push({
            id: created.id,
            batchId: batch.id,
            shipmentId: item.order.shipmentId ?? null,
            trackingId: item.order.trackingId ?? null,
            orderItemId: item.order.orderItemId ?? null,
            orderNo: item.order.orderId ?? item.order.shipmentId ?? item.internalKey,
            sku: item.sku
          });
          await createPick(item, created.id);
          const catalogIssuePersisted = item.taskData ? false : await persistHeldCatalogIssue(item, created.id);
          results.push({ item, state: "CREATED", orderId: created.id, catalogIssuePersisted });
          continue;
        }

        const operationalChanged = exact.sku !== item.orderData.sku
          || exact.qty !== item.orderData.qty
          || exact.orderNo !== item.orderData.orderNo
          || (exact.trackingId ?? "") !== (item.orderData.trackingId ?? "")
          || (exact.shipmentId ?? "") !== (item.orderData.shipmentId ?? "")
          || (exact.orderItemId ?? "") !== (item.orderData.orderItemId ?? "")
          || (exact.fsn ?? "") !== (item.orderData.fsn ?? "");
        const workStarted = exact.workTasks.some((task) =>
          task.stage !== "PICK"
          || task.status === "IN_PROGRESS"
          || task.status === "COMPLETED"
          || task.status === "PROBLEM"
          || task.completedQuantity > 0
          || Boolean(task.assignedUserId)
          || Boolean(task.startedAt)
          || Boolean(task.completedAt)
        );

        const unresolvedHeldIssue = await tx.importRowIssue.findFirst({
          where: {
            sourceType: "ORDER",
            sourceId: exact.id,
            resolved: false,
            issueType: { in: ["MISSING_FLIPKART_LISTING_MAPPING", "AMBIGUOUS_LISTING"] },
            batch: { accountId: input.account.id }
          },
          select: { id: true, batchId: true }
        });
        if (unresolvedHeldIssue) {
          if (exact.workTasks.length) {
            results.push({
              item,
              state: "ACTIVE_CONFLICT",
              orderId: exact.id,
              issue: {
                rowNumber: item.order.rowNumber,
                issueType: "ACTIVE_WORK_IDENTITY_CONFLICT",
                severity: "BLOCKING_ERROR",
                message: "An unresolved owner catalog issue and workflow tasks both exist for this Order. Identity and task snapshots were preserved for review.",
                rawData: item.order.rawData ?? {},
                sourceType: "ORDER",
                sourceId: exact.id
              }
            });
            continue;
          }
          if (operationalChanged) {
            await tx.order.update({ where: { id: exact.id }, data: { ...item.orderData, batchId: exact.batchId } });
            const ambiguous = item.mappingIssue?.issueType === "AMBIGUOUS_LISTING";
            const refreshedIssue = issueCreateData(unresolvedHeldIssue.batchId, {
              rowNumber: item.order.rowNumber,
              issueType: ambiguous ? "AMBIGUOUS_LISTING" : "MISSING_FLIPKART_LISTING_MAPPING",
              severity: "BLOCKING_ERROR",
              message: ambiguous
                ? "Held Order identity changed before work started and still matches multiple listings; owner selection is required."
                : "Held Order identity changed before work started; the owner must confirm the current account listing before work is released.",
              rawData: item.order.rawData ?? {},
              sourceType: "ORDER",
              sourceId: exact.id,
              safeData: {
                ...(ambiguous ? item.mappingIssue?.safeData ?? {} : {}),
                accountId: input.account.id,
                marketplace: "FLIPKART",
                sellerSku: item.sku,
                orderId: exact.id,
                fsn: item.order.fsn ?? null
              }
            });
            await tx.importRowIssue.update({
              where: { id: unresolvedHeldIssue.id },
              data: {
                rowNumber: refreshedIssue.rowNumber,
                issueType: refreshedIssue.issueType,
                message: refreshedIssue.message,
                rawData: null,
                safeDataJson: refreshedIssue.safeDataJson,
                severity: refreshedIssue.severity,
                sourceType: "ORDER",
                sourceId: exact.id,
                version: { increment: 1 }
              }
            });
            results.push({ item, state: "UPDATED", orderId: exact.id, catalogIssuePersisted: true });
          } else {
            results.push({ item, state: "UNCHANGED", orderId: exact.id, catalogIssuePersisted: true });
          }
          continue;
        }

        if (sameOrder(exact, item.order, item.imageUrl)) {
          const pick = exact.workTasks.find((task) => task.stage === "PICK");
          if (item.taskData && !pick) {
            if (exact.workTasks.length) {
              results.push({
                item,
                state: "ACTIVE_CONFLICT",
                orderId: exact.id,
                issue: {
                  rowNumber: item.order.rowNumber,
                  issueType: "ACTIVE_WORK_IDENTITY_CONFLICT",
                  severity: "BLOCKING_ERROR",
                  message: "Existing Order workflow history is incomplete or inconsistent. No replacement Pick task was created.",
                  rawData: item.order.rawData ?? {},
                  sourceType: "ORDER",
                  sourceId: exact.id
                }
              });
              continue;
            }
            await createPick(item, exact.id);
          }
          const catalogIssuePersisted = item.taskData ? false : await persistHeldCatalogIssue(item, exact.id);
          results.push({ item, state: "UNCHANGED", orderId: exact.id, catalogIssuePersisted });
          continue;
        }

        if (operationalChanged && workStarted) {
          const enrichment = {
            ...(!exact.productDescription && item.orderData.productDescription ? { productDescription: item.orderData.productDescription } : {}),
            ...(!exact.imageUrl && item.orderData.imageUrl ? { imageUrl: item.orderData.imageUrl } : {})
          };
          if (Object.keys(enrichment).length) await tx.order.update({ where: { id: exact.id }, data: enrichment });
          results.push({
            item,
            state: "ACTIVE_CONFLICT",
            orderId: exact.id,
            issue: {
              rowNumber: item.order.rowNumber,
              issueType: "ACTIVE_WORK_IDENTITY_CONFLICT",
              severity: "BLOCKING_ERROR",
              message: "Order identity, SKU, Tracking ID or quantity changed after workflow started. Existing operational identity and immutable tasks were preserved; safe missing descriptive data was enriched for owner review.",
              rawData: item.order.rawData ?? {},
              sourceType: "ORDER",
              sourceId: exact.id
            }
          });
          continue;
        }

        if (workStarted) {
          const enrichment = {
            ...(!exact.productDescription && item.orderData.productDescription ? { productDescription: item.orderData.productDescription } : {}),
            ...(!exact.imageUrl && item.orderData.imageUrl ? { imageUrl: item.orderData.imageUrl } : {})
          };
          if (Object.keys(enrichment).length) {
            await tx.order.update({ where: { id: exact.id }, data: enrichment });
            results.push({ item, state: "UPDATED", orderId: exact.id });
          } else {
            results.push({ item, state: "UNCHANGED", orderId: exact.id });
          }
          continue;
        }

        if (!item.taskData && exact.workTasks.length) {
          results.push({
            item,
            state: "ACTIVE_CONFLICT",
            orderId: exact.id,
            issue: {
              rowNumber: item.order.rowNumber,
              issueType: "ACTIVE_WORK_IDENTITY_CONFLICT",
              severity: "BLOCKING_ERROR",
              message: "Catalog identity is unresolved while Order workflow tasks already exist. Existing Order and task snapshots were preserved for owner review.",
              rawData: item.order.rawData ?? {},
              sourceType: "ORDER",
              sourceId: exact.id
            }
          });
          continue;
        }

        await tx.order.update({
          where: { id: exact.id },
          data: { ...item.orderData, batchId: exact.batchId }
        });
        if (item.taskData) {
          if (exact.workTasks.length) {
            const changed = await tx.workTask.updateMany({
              where: {
                orderId: exact.id,
                status: { in: ["LOCKED", "READY"] },
                completedQuantity: 0,
                assignedUserId: null,
                startedAt: null,
                completedAt: null
              },
              data: {
                requiredQuantity: item.taskData.requiredQuantity,
                workCardSnapshotJson: item.taskData.workCardSnapshotJson,
                routeSnapshotJson: item.taskData.routeSnapshotJson,
                version: { increment: 1 }
              }
            });
            if (changed.count !== exact.workTasks.length) throw new Error("Order workflow changed while the import was updating it; retry the import.");
            affectedTaskIds.push(...exact.workTasks.map((task) => task.id));
            affectedOrderIds.push(exact.id);
            refreshedTask = true;
          } else {
            await createPick(item, exact.id);
          }
        }
        const catalogIssuePersisted = item.taskData ? false : await persistHeldCatalogIssue(item, exact.id);
        results.push({ item, state: "UPDATED", orderId: exact.id, catalogIssuePersisted });
      }

      if (affectedTaskIds.length) {
        await refreshAffectedWorkGroups({
          accountId: input.account.id,
          sourceType: "ORDER",
          stages: ["PICK"],
          taskIds: affectedTaskIds,
          orderIds: [...new Set(affectedOrderIds)]
        }, tx);
        if (createdTask) {
          await tx.workChangeEvent.create({
            data: { accountId: input.account.id, eventType: "ORDER_IMPORT_CREATED", sourceType: "ORDER", stage: "PICK" }
          });
        }
        if (refreshedTask) {
          await tx.workChangeEvent.create({
            data: { accountId: input.account.id, eventType: "ORDER_IMPORT_REFRESHED", sourceType: "ORDER", stage: "PICK" }
          });
        }
      }
      return results;
    });

    for (const outcome of outcomes) {
      processedRows += 1;
      if (outcome.state === "CREATED") createdRows += 1;
      else if (outcome.state === "UPDATED") updatedRows += 1;
      else if (outcome.state === "UNCHANGED") alreadyImportedRows += 1;
      if (outcome.issue) {
        mappingIssues.push(outcome.issue);
        deferredMappingIssues.push(outcome.issue);
        continue;
      }
      if ((outcome.state !== "UNCHANGED" || outcome.catalogIssuePersisted) && outcome.orderId) {
        const issue = scopedMappingIssue(outcome.item, outcome.orderId);
        if (issue) {
          mappingIssues.push(issue);
          if (!outcome.catalogIssuePersisted) deferredMappingIssues.push(issue);
          if (issue.issueType === "FLIPKART_LISTING_IMAGE_MISSING") missingImageRows += 1;
        }
      }
    }

    if (input.jobId) {
      await updateImportJobProgress(input.jobId, {
        processedRows,
        createdRows,
        updatedRows,
        unchangedRows: alreadyImportedRows,
        duplicateRows: deduped.repeatedSourceRows + duplicateIssues.length,
        warningRows: parsed.issues.length + duplicateIssues.length + missingImageRows,
        errorRows: parsed.issues.length + mappingIssues.filter((issue) => issue.severity === "BLOCKING_ERROR").length,
        missingListingRows: mappingIssues.filter((issue) => issue.issueType === "MISSING_FLIPKART_LISTING_MAPPING").length,
        missingImageRows
      }, input.runnerId);
    }
  }

  await input.assertLease?.();
  await writeIssues(batch.id, deferredMappingIssues);

  const identityConflictRows=mappingIssues.filter(issue=>issue.issueType==="ACTIVE_WORK_IDENTITY_CONFLICT").length;
  const fallbackIdentityConflictRows=mappingIssues.filter(issue=>issue.issueType==="FALLBACK_IDENTITY_CONFLICT").length;
  const duplicateConflictRows=duplicateIssues.filter(issue=>issue.issueType==="DUPLICATE_IDENTITY_CONFLICT").length;
  const blockingMappingRows=mappingIssues.filter(issue=>issue.severity==="BLOCKING_ERROR").length;
  const errorRows = parsed.issues.length+duplicateConflictRows+blockingMappingRows;
  const reviewRows = parsed.issues.length + duplicateIssues.length + mappingIssues.length;
  await input.assertLease?.();
  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: reviewRows > 0 ? "REVIEWED" : "IMPORTED",
      createdRows,
      updatedRows,
      duplicateRows: deduped.repeatedSourceRows + duplicateIssues.length,
      alreadyImportedRows,
      repeatedSourceRows: deduped.repeatedSourceRows,
      informationRows: alreadyImportedRows + deduped.repeatedSourceRows,
      warningRows: missingImageRows,
      blockingErrorRows: errorRows,
      missingImageRows,
      skippedRows: alreadyImportedRows + deduped.repeatedSourceRows + duplicateIssues.length + parsed.issues.length + blockingMappingRows,
      errorRows,
      notes: orderNotes({
        parser: "flipkart-orders-xlsx",
        parsedRows: input.rows.length,
        importableRows: importableOrders.length,
        heldRows: errorRows,
        missingImageRows,
        alreadyImportedRows,
        repeatedSourceRows: deduped.repeatedSourceRows,
        conflictingRows: duplicateConflictRows + identityConflictRows + fallbackIdentityConflictRows
      })
    }
  });
  if (input.jobId) {
    await updateImportJobProgress(input.jobId, {
      totalRows: input.rows.length,
      processedRows: input.rows.length,
      createdRows,
      updatedRows,
      unchangedRows: alreadyImportedRows,
      duplicateRows: deduped.repeatedSourceRows + duplicateIssues.length,
      warningRows: reviewRows,
      errorRows,
      missingListingRows: mappingIssues.filter((issue) => issue.issueType === "MISSING_FLIPKART_LISTING_MAPPING").length,
      missingImageRows
    }, input.runnerId);
  }

  await input.assertLease?.();
  await recordAuditLog({
    userId: input.user.id,
    accountId: input.account.id,
    action: "FLIPKART_ORDER_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: {
      fileName: input.fileName,
      createdRows,
      updatedRows,
      duplicateRows: deduped.repeatedSourceRows + duplicateIssues.length,
      alreadyImportedRows,
      repeatedSourceRows: deduped.repeatedSourceRows,
      missingImageRows,
      errorRows
    },
    request: input.request
  });

  return updatedBatch;
}

export async function importFlipkartListingRows(input: {
  rows: FlipkartRawRow[];
  fileName: string;
  account: Account;
  user: User;
  request?: RequestMeta;
  jobId?: string;
  runnerId?: string;
  assertLease?: () => Promise<void>;
}) {
  await input.assertLease?.();
  const parsed = parseFlipkartListingRows(input.rows, input.fileName);
  const batch = await prisma.uploadBatch.create({
    data: {
      accountId: input.account.id,
      createdByUserId: input.user.id,
      fileName: input.fileName,
      importType: "SKU_IMAGE",
      status: "UPLOADED",
      totalRows: input.rows.length,
      notes: JSON.stringify({
        marketplace: "FLIPKART",
        parser: "flipkart-listings-xlsx"
      })
    }
  });
  const sourceHeaders=Object.keys(input.rows[0]??{}),formSchema=buildFlipkartListingFormSchema(sourceHeaders);
  if(formSchema){const matched=await findHeaderProfile({accountId:input.account.id,marketplace:"FLIPKART",importPurpose:"PRODUCT_CATALOG",headers:sourceHeaders});const profile=matched.state==="MATCHED"&&matched.profile.formSchemaJson?matched.profile:await saveHeaderProfile({actorUserId:input.user.id,accountId:input.account.id,marketplace:"FLIPKART",importPurpose:"PRODUCT_CATALOG",profileName:"Flipkart Main Listing Report",headers:sourceHeaders,mapping:Object.fromEntries(formSchema.fields.filter(field=>field.commonFieldTarget).map(field=>[field.canonicalKey,field.originalHeader])),requiredFields:["sellerSku"],optionalFields:formSchema.fields.filter(field=>field.canonicalKey!=="sellerSku").map(field=>field.canonicalKey),formSchema:formSchema as unknown as Record<string,unknown>,technicalHeaderFingerprint:formSchema.technicalHeaderFingerprint,humanHeaderFingerprint:formSchema.humanHeaderFingerprint,templateKind:formSchema.templateKind,fieldGroups:formSchema.groups});await prisma.uploadBatch.update({where:{id:batch.id},data:{fileProfileId:profile.id}});}
  if (input.jobId) {
    await setImportJobBatch(input.jobId, batch.id, input.runnerId);
    await updateImportJobProgress(input.jobId, {
      totalRows: input.rows.length,
      processedRows: 0,
      errorRows: parsed.issues.length,
      warningRows: parsed.issues.length
    }, input.runnerId);
  }
  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let missingImageRows = 0;
  let inactiveListings = 0;
  const deduped = dedupeFlipkartListingRows(parsed.listings);
  const issues = [...parsed.issues, ...deduped.duplicateIssues];
  const importedAt = new Date();
  const listingDrafts = deduped.importableListings.map((listing) => ({
    listing,
    data: flipkartListingMasterData(listing)
  }));
  const missingImageIssues: FlipkartParseIssue[] = [];
  let processedRows = parsed.issues.length + deduped.duplicateIssues.length;

  await writeIssues(batch.id, issues);
  if (input.jobId) {
    await updateImportJobProgress(input.jobId, {
      processedRows,
      duplicateRows: deduped.duplicateIssues.length,
      warningRows: deduped.duplicateIssues.length,
      errorRows: parsed.issues.length
    }, input.runnerId);
  }

  for (const chunk of chunkFlipkartListingRows(listingDrafts)) {
    await input.assertLease?.();
    const listingSkus = Array.from(new Set(chunk.map((draft) => draft.data.sku).filter(Boolean)));
    const existingListings = await prisma.marketplaceListing.findMany({
      where: {
        accountId: input.account.id,
        marketplace: "FLIPKART",
        sku: { in: listingSkus }
      }
    });
    const existingBySku = new Map(existingListings.map((existingListing) => [normalizeSkuForMatching(existingListing.sku), existingListing]));
    const createRows: Prisma.MarketplaceListingCreateManyInput[] = [];
    const updateOperations: Prisma.PrismaPromise<unknown>[] = [];
    const unchangedListingIds: string[] = [];

    for (const { listing, data } of chunk) {
      const sku = data.sku;

      if (flipkartListingIsInactive(listing)) {
        inactiveListings += 1;
      }

      if (!data.mainImageUrl) {
        missingImageRows += 1;
        missingImageIssues.push({
          rowNumber: listing.rowNumber,
          issueType: "MISSING_IMAGE_URL",
          message: `No valid image URL found for Flipkart SKU ${sku}.`,
          rawData: listing.rawData
        });
      }

      const existing = existingBySku.get(sku);
      const listingData = {
        ...data,
        accountId: input.account.id,
        lastImportedAt: importedAt
      };

      if (!existing) {
        createRows.push(listingData);
      } else if (sameFlipkartListingMaster(existing, data)) {
        unchangedListingIds.push(existing.id);
      } else {
        updateOperations.push(prisma.marketplaceListing.update({
          where: { id: existing.id },
          data: listingData
        }));
      }
    }

    for (const createChunk of chunkFlipkartListingRows(createRows, FLIPKART_LISTING_CREATE_BATCH_SIZE)) {
      const result = await prisma.marketplaceListing.createMany({
        data: createChunk
      });
      createdRows += result.count;
    }

    for (const unchangedChunk of chunkFlipkartListingRows(unchangedListingIds, FLIPKART_LISTING_CREATE_BATCH_SIZE)) {
      const result = await prisma.marketplaceListing.updateMany({
        where: { id: { in: unchangedChunk } },
        data: { lastImportedAt: importedAt }
      });
      skippedRows += result.count;
    }

    for (const updateChunk of chunkFlipkartListingRows(updateOperations, FLIPKART_LISTING_UPDATE_BATCH_SIZE)) {
      const result = await prisma.$transaction(updateChunk);
      updatedRows += result.length;
    }

    processedRows += chunk.length;
    if (input.jobId) {
      await updateImportJobProgress(input.jobId, {
        processedRows,
        createdRows,
        updatedRows,
        unchangedRows: skippedRows,
        duplicateRows: deduped.duplicateIssues.length,
        warningRows: deduped.duplicateIssues.length + missingImageRows,
        errorRows: parsed.issues.length,
        missingImageRows
      }, input.runnerId);
    }
  }

  await input.assertLease?.();
  const identifierSync = await syncIdentifiersForImportedListings({ accountId: input.account.id, importedAt, assertLease: input.assertLease });
  await input.assertLease?.();
  await writeIssues(batch.id, missingImageIssues);

  const allIssues = [...issues, ...missingImageIssues];
  await input.assertLease?.();
  const updatedBatch = await prisma.uploadBatch.update({
    where: { id: batch.id },
    data: {
      status: allIssues.length > 0 ? "REVIEWED" : "IMPORTED",
      createdRows,
      updatedRows,
      duplicateRows: deduped.duplicateIssues.length,
      skippedRows,
      missingImageRows,
      errorRows: parsed.issues.length,
      notes: JSON.stringify({
        marketplace: "FLIPKART",
        parser: "flipkart-listings-xlsx",
        listingMaster: true,
        inactiveListings
      })
    }
  });
  if (input.jobId) {
    await updateImportJobProgress(input.jobId, {
      totalRows: input.rows.length,
      processedRows: input.rows.length,
      createdRows,
      updatedRows,
      unchangedRows: skippedRows,
      duplicateRows: deduped.duplicateIssues.length,
      warningRows: deduped.duplicateIssues.length + missingImageRows,
      errorRows: parsed.issues.length,
      missingImageRows
    }, input.runnerId);
  }

  await input.assertLease?.();
  await recordAuditLog({
    userId: input.user.id,
    accountId: input.account.id,
    action: "FLIPKART_LISTING_IMPORT",
    entityType: "UploadBatch",
    entityId: batch.id,
    metadata: {
      fileName: input.fileName,
      createdRows,
      updatedRows,
      skippedRows,
      missingImageRows,
      inactiveListings,
      syncedIdentifiers: identifierSync.syncedIdentifiers,
      errorRows: allIssues.length
    },
    request: input.request
  });

  return updatedBatch;
}
