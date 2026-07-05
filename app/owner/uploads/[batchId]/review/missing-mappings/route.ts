import { requireAccount, requireUser } from "@/lib/auth";
import { csvResponse, rowsToCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { flipkartIssueRawContext } from "@/src/lib/marketplaces/flipkart";

type MissingMappingsRouteProps = {
  params: Promise<{
    batchId: string;
  }>;
};

function parseIssueRawData(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: MissingMappingsRouteProps) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const { batchId } = await params;
  const kind = new URL(request.url).searchParams.get("kind") === "image" ? "image" : "listing";
  const issueTypes = kind === "image" ? ["FLIPKART_LISTING_IMAGE_MISSING"] : ["MISSING_FLIPKART_LISTING_MAPPING"];
  const batch = await prisma.uploadBatch.findFirst({
    where: {
      id: batchId,
      accountId: account.id,
      importType: "ORDER_LABEL"
    },
    include: {
      issues: {
        where: {
          issueType: { in: issueTypes }
        },
        orderBy: [{ rowNumber: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!batch) {
    return new Response("Not found", { status: 404 });
  }

  const csv = rowsToCsv(
    ["row_number", "issue_type", "message", "sku", "shipment_id", "order_item_id", "tracking_id", "product"],
    batch.issues.map((issue) => {
      const context = flipkartIssueRawContext(parseIssueRawData(issue.rawData));

      return [
        issue.rowNumber,
        issue.issueType,
        issue.message,
        context.sku,
        context.shipmentId,
        context.orderItemId,
        context.trackingId,
        context.product
      ];
    })
  );

  return csvResponse(csv, `${batch.fileName}-missing-${kind}-mappings.csv`);
}
