import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPhase736Database } from "./phase-7-3-6-test-db";

const fixture = createPhase736Database("legacy-order-import-review-only");
const { prisma } = await import("../lib/prisma");
const { importParsedOrderRows } = await import("../lib/import/orders");

try {
  const user = await prisma.user.create({
    data: { id: "owner", username: "legacy-review-owner", passwordHash: "synthetic", name: "Owner", role: "OWNER" }
  });
  const accounts = await Promise.all([
    prisma.account.create({ data: { id: "flipkart", name: "QA Flipkart", code: "QA-FK", marketplace: "FLIPKART" } }),
    prisma.account.create({ data: { id: "meesho", name: "QA Meesho", code: "QA-ME", marketplace: "MEESHO" } })
  ]);

  for (const account of accounts) {
    await assert.rejects(
      importParsedOrderRows({
        account,
        user,
        fileName: `${account.marketplace.toLowerCase()}-synthetic.pdf`,
        rows: [
          { rowNumber: 1, awb: `QA-${account.marketplace}-AWB`, sku: "QA-SKU", qty: 2, orderNo: "QA-ORDER" },
          { rowNumber: 2, awb: null, sku: null, qty: 1 }
        ]
      }),
      /review-only and cannot create production data or warehouse work/
    );
  }

  const mutationCounts = await Promise.all([
    prisma.uploadBatch.count(),
    prisma.order.count(),
    prisma.workTask.count(),
    prisma.importRowIssue.count(),
    prisma.auditLog.count()
  ]);
  assert.deepEqual(mutationCounts, [0, 0, 0, 0, 0], "Legacy parsed imports must not mutate any production-order model");

  const legacyService = readFileSync("lib/import/orders.ts", "utf8");
  assert.doesNotMatch(legacyService, /@\/lib\/prisma|recordAuditLog|prisma\./, "Review-only legacy service must have no database write dependency");

  const uploadActions = readFileSync("app/owner/uploads/actions.ts", "utf8");
  const confirmStart = uploadActions.indexOf("export async function confirmParsedBatchAction");
  const confirmEnd = uploadActions.indexOf("\nexport async function ", confirmStart + 1);
  assert.ok(confirmStart >= 0, "Legacy confirmation compatibility action remains explicit");
  const confirmAction = uploadActions.slice(confirmStart, confirmEnd >= 0 ? confirmEnd : undefined);
  assert.doesNotMatch(confirmAction, /importParsedOrderRows\s*\(/, "Legacy confirmation action cannot invoke the generic importer");

  const reviewPage = readFileSync("app/owner/uploads/[batchId]/review/page.tsx", "utf8");
  assert.doesNotMatch(reviewPage, /confirmParsedBatchAction/, "Legacy review page must expose no confirm mutation form");
  assert.match(reviewPage, /Compatibility review only/);
  assert.match(reviewPage, /cannot create production Orders or Work Hub tasks/i);
} finally {
  await prisma.$disconnect();
  fixture.cleanup();
}

console.log("Legacy parsed Order imports are review-only for every marketplace.");
