import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ErrorCsvRouteProps = {
  params: Promise<{
    batchId: string;
  }>;
};

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export async function GET(_request: Request, { params }: ErrorCsvRouteProps) {
  await requireUser(["OWNER"]);
  const { batchId } = await params;
  const batch = await prisma.uploadBatch.findFirst({
    where: { id: batchId, importType: "SKU_IMAGE" },
    include: { issues: { orderBy: { createdAt: "asc" } } }
  });

  if (!batch) {
    return new NextResponse("Not found", { status: 404 });
  }

  const rows = [
    ["row_number", "issue_type", "message", "raw_data"].map(csvEscape).join(","),
    ...batch.issues.map((issue) =>
      [issue.rowNumber, issue.issueType, issue.message, issue.rawData].map(csvEscape).join(",")
    )
  ];

  return new NextResponse(rows.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${batch.fileName}-errors.csv"`
    }
  });
}
