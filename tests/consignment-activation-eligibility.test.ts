import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const fixture = createPhase736Database("consignment-activation-eligibility");
const { prisma } = await import("../lib/prisma");
const {
  activateConsignmentBatch,
  getConsignmentActivationEligibility
} = await import("../src/lib/workflow/task-store");

async function createBatch(input: {
  id: string;
  status: "DRAFT" | "REVIEW_REQUIRED" | "READY_TO_ACTIVATE";
  listingId: string;
  sellerSku: string;
}) {
  await prisma.consignmentBatch.create({
    data: {
      id: input.id,
      accountId: "activation-account",
      marketplace: "FLIPKART",
      externalConsignmentNumber: `CN-${input.id}`,
      displayName: `Synthetic ${input.id}`,
      status: input.status,
      sourceFileName: `${input.id}.csv`,
      sourceFileSha256: `sha-${input.id}`,
      totalSourceRows: 1,
      totalValidLines: 1,
      totalRequiredQuantity: 2,
      matchedLines: 1,
      readyMadeLines: 1,
      createdByUserId: "activation-owner"
    }
  });
  await prisma.consignmentLine.create({
    data: {
      id: `line-${input.id}`,
      consignmentBatchId: input.id,
      accountId: "activation-account",
      rowNumber: 2,
      sellerSkuSource: input.sellerSku,
      requiredQuantity: 2,
      marketplaceListingId: input.listingId,
      matchStatus: "EXACT_SKU",
      processRoute: "PICK_PACK"
    }
  });
}

try {
  await prisma.account.create({
    data: {
      id: "activation-account",
      name: "Synthetic Activation Account",
      code: "SYN-ACT",
      companyName: "Synthetic Company",
      marketplace: "FLIPKART",
      active: true
    }
  });
  await prisma.user.create({
    data: {
      id: "activation-owner",
      username: "synthetic-activation-owner",
      passwordHash: "synthetic-hash",
      name: "Synthetic Activation Owner",
      role: "OWNER",
      active: true
    }
  });
  await prisma.marketplaceListing.createMany({
    data: [
      {
        id: "activation-listing-blocked",
        accountId: "activation-account",
        marketplace: "FLIPKART",
        sellerSkuId: "SYN-BLOCKED",
        sku: "SYN-BLOCKED",
        productTitle: "Synthetic blocked product",
        mainImageUrl: "https://example.invalid/synthetic-blocked.png"
      },
      {
        id: "activation-listing-warning",
        accountId: "activation-account",
        marketplace: "FLIPKART",
        sellerSkuId: "SYN-WARNING",
        sku: "SYN-WARNING",
        productTitle: "Synthetic warning product",
        mainImageUrl: "https://example.invalid/synthetic-warning.png"
      },
      {
        id: "activation-listing-ready",
        accountId: "activation-account",
        marketplace: "FLIPKART",
        sellerSkuId: "SYN-READY",
        sku: "SYN-READY",
        productTitle: "Synthetic ready product",
        mainImageUrl: "https://example.invalid/synthetic-ready.png"
      },
      {
        id: "activation-listing-draft",
        accountId: "activation-account",
        marketplace: "FLIPKART",
        sellerSkuId: "SYN-DRAFT",
        sku: "SYN-DRAFT",
        productTitle: "Synthetic draft product",
        mainImageUrl: "https://example.invalid/synthetic-draft.png"
      },
      {
        id: "activation-listing-stale",
        accountId: "activation-account",
        marketplace: "FLIPKART",
        sellerSkuId: "SYN-STALE",
        sku: "SYN-STALE",
        productTitle: "Synthetic stale product",
        mainImageUrl: "https://example.invalid/synthetic-stale.png"
      }
    ]
  });

  await createBatch({ id: "batch-blocked", status: "REVIEW_REQUIRED", listingId: "activation-listing-blocked", sellerSku: "SYN-BLOCKED" });
  await prisma.consignmentImportIssue.create({
    data: {
      id: "activation-blocker",
      consignmentBatchId: "batch-blocked",
      consignmentLineId: "line-batch-blocked",
      rowNumber: 2,
      issueType: "IDENTIFIER_CONFLICT",
      severity: "ERROR",
      message: "Synthetic blocking conflict.",
      resolved: false
    }
  });
  await prisma.consignmentImportIssue.create({
    data: {
      id: "activation-blocker-two",
      consignmentBatchId: "batch-blocked",
      consignmentLineId: "line-batch-blocked",
      rowNumber: 2,
      issueType: "AMBIGUOUS_MATCH",
      severity: "ERROR",
      message: "Synthetic second blocking conflict.",
      resolved: false
    }
  });
  const blocked = await getConsignmentActivationEligibility("batch-blocked", "activation-account");
  assert.equal(blocked.canActivate, false, "A blocking error disables activation");
  assert.equal(blocked.actionLabel, null, "A blocking error exposes no enabled activation label");
  assert.equal(blocked.blockingCount, 2);
  assert.match(blocked.lifecycleMessage, /2 blocking errors must be resolved/i);
  await prisma.consignmentImportIssue.updateMany({
    where: { consignmentBatchId: "batch-blocked", severity: "ERROR" },
    data: { resolved: true, resolvedAt: new Date(), resolvedByUserId: "activation-owner" }
  });
  const resolved = await getConsignmentActivationEligibility("batch-blocked", "activation-account");
  assert.equal(resolved.canActivate, true, "Resolving the authoritative blockers changes eligibility");
  assert.equal(resolved.actionLabel, "Activate");
  await prisma.consignmentLine.update({ where: { id: "line-batch-blocked" }, data: { processRoute: null } });
  const warningAdded = await getConsignmentActivationEligibility("batch-blocked", "activation-account");
  assert.equal(warningAdded.canActivate, true);
  assert.equal(warningAdded.actionLabel, "Activate with warnings", "A new non-blocking warning changes only the action label");

  await createBatch({ id: "batch-warning", status: "REVIEW_REQUIRED", listingId: "activation-listing-warning", sellerSku: "SYN-WARNING" });
  await prisma.consignmentLine.update({ where: { id: "line-batch-warning" }, data: { processRoute: null } });
  const warning = await getConsignmentActivationEligibility("batch-warning", "activation-account");
  assert.equal(warning.canActivate, true, "Warnings-only review state remains explicitly activatable");
  assert.equal(warning.actionLabel, "Activate with warnings");
  assert.equal(warning.blockingCount, 0);
  assert.ok(warning.warningCount > 0);
  const warningActivation = await activateConsignmentBatch({
    batchId: "batch-warning",
    accountId: "activation-account",
    actorUserId: "activation-owner"
  });
  assert.equal(warningActivation.activated, true, "The transaction accepts the same warnings-only decision shown by the UI");
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: "line-batch-warning" } }), 1);

  await createBatch({ id: "batch-ready", status: "READY_TO_ACTIVATE", listingId: "activation-listing-ready", sellerSku: "SYN-READY" });
  const ready = await getConsignmentActivationEligibility("batch-ready", "activation-account");
  assert.equal(ready.canActivate, true);
  assert.equal(ready.actionLabel, "Activate");
  assert.equal(ready.blockingCount, 0);
  assert.equal(ready.warningCount, 0);
  for (const status of ["ACTIVE", "COMPLETED", "CANCELLED"] as const) {
    await prisma.consignmentBatch.update({ where: { id: "batch-ready" }, data: { status } });
    const terminal = await getConsignmentActivationEligibility("batch-ready", "activation-account");
    assert.equal(terminal.canActivate, false, `${status} exposes no enabled activation`);
    assert.equal(terminal.actionLabel, null);
  }

  await createBatch({ id: "batch-draft", status: "DRAFT", listingId: "activation-listing-draft", sellerSku: "SYN-DRAFT" });
  const draft = await getConsignmentActivationEligibility("batch-draft", "activation-account");
  assert.equal(draft.canActivate, false, "A non-activatable lifecycle state exposes no action");
  assert.equal(draft.actionLabel, null);
  assert.match(draft.lifecycleMessage, /unavailable while this consignment is draft/i);

  await createBatch({ id: "batch-stale", status: "READY_TO_ACTIVATE", listingId: "activation-listing-stale", sellerSku: "SYN-STALE" });
  const beforeStaleChange = await getConsignmentActivationEligibility("batch-stale", "activation-account");
  assert.equal(beforeStaleChange.canActivate, true, "The stale-page scenario starts with an enabled decision");
  await prisma.consignmentImportIssue.create({
    data: {
      id: "activation-stale-blocker",
      consignmentBatchId: "batch-stale",
      consignmentLineId: "line-batch-stale",
      rowNumber: 2,
      issueType: "IDENTIFIER_CONFLICT",
      severity: "ERROR",
      message: "Synthetic blocker added after page render.",
      resolved: false
    }
  });
  await assert.rejects(
    activateConsignmentBatch({ batchId: "batch-stale", accountId: "activation-account", actorUserId: "activation-owner" }),
    /blocking import error remains unresolved/i,
    "Transaction-time revalidation rejects a stale enabled page"
  );
  assert.equal((await prisma.consignmentBatch.findUniqueOrThrow({ where: { id: "batch-stale" } })).status, "READY_TO_ACTIVATE");
  assert.equal(await prisma.workTask.count({ where: { consignmentLineId: "line-batch-stale" } }), 0);

  const reviewSource = readFileSync(resolve("app/owner/consignments/[batchId]/review/page.tsx"), "utf8");
  const detailSource = readFileSync(resolve("app/owner/consignments/[batchId]/page.tsx"), "utf8");
  const actionSource = readFileSync(resolve("app/owner/consignments/actions.ts"), "utf8");
  assert.match(reviewSource, /getConsignmentActivationEligibility\(batch\.id, account\.id\)/, "Review uses the authoritative decision");
  assert.doesNotMatch(reviewSource, /warningCount\s*\|\|\s*missingRouteCount/, "Review no longer guesses eligibility from presentation counts");
  assert.match(reviewSource, /activationEligibility\.canActivate[\s\S]*activateConsignmentAction/, "Only an eligible manager receives an activation form");
  assert.match(reviewSource, /\{canManage \? <div[\s\S]*activationEligibility\.canActivate/, "Unauthorized workers receive no activation panel or form");
  assert.match(reviewSource, /disabled aria-disabled="true"/, "Blocked activation is visibly disabled");
  assert.match(reviewSource, /Review blocking issues/, "Blocked activation links to the issue review");
  assert.match(detailSource, /getConsignmentActivationEligibility\(batch\.id, account\.id\)/, "Details uses the same authoritative decision");
  assert.match(actionSource, /activateConsignmentAction[\s\S]{0,300}requireWorkPermission\("canManageConsignments"\)/, "The server action still enforces management permission");
} finally {
  await prisma.$disconnect();
  fixture.cleanup();
}

console.log("Consignment activation eligibility and stale-page safety tests passed.");
