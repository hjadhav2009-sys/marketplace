import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAccount, requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

type ReviewPageProps = {
  params: Promise<{
    batchId: string;
  }>;
};

export default async function ParseReviewPage({ params }: ReviewPageProps) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const { batchId } = await params;
  const batch = await prisma.uploadBatch.findFirst({
    where: {
      id: batchId,
      accountId: account.id
    },
    include: {
      orders: {
        orderBy: { createdAt: "asc" }
      },
      issues: {
        orderBy: { createdAt: "asc" }
      },
      createdBy: true
    }
  });

  if (!batch) {
    notFound();
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Review"
        title="PDF parse review"
        description="Review extracted label fields before they become the active pick-and-pack queue."
      >
        <StatusBadge value={batch.status} />
      </PageHeader>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">File</p>
            <p className="font-semibold text-slate-950">{batch.fileName}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Uploaded</p>
            <p className="font-semibold text-slate-950">{formatDateTime(batch.createdAt)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Uploaded by</p>
            <p className="font-semibold text-slate-950">{batch.createdBy?.name ?? "Unknown"}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total", batch.totalRows],
          ["Created", batch.createdRows],
          ["Updated", batch.updatedRows],
          ["Duplicates", batch.duplicateRows],
          ["Skipped", batch.skippedRows],
          ["Errors", batch.errorRows]
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6">
        {batch.orders.length === 0 ? (
          <EmptyState
            title="Parser placeholder batch"
            description="No extracted rows exist yet. The data model and review route are ready for a PDF parser to insert AWB, courier, SKU, quantity, color, order number, product description, payment type, city, and state."
            action={{ href: "/owner/uploads/new", label: "Upload another PDF" }}
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">AWB</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Color</th>
                    <th className="px-4 py-3">Courier</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batch.orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{order.awb}</td>
                      <td className="px-4 py-3">{order.sku}</td>
                      <td className="px-4 py-3">{order.qty}</td>
                      <td className="px-4 py-3">{order.color ?? "Unknown"}</td>
                      <td className="px-4 py-3">{order.courier ?? "Unknown"}</td>
                      <td className="px-4 py-3">{order.orderNo}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={order.packStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {batch.issues.length > 0 ? (
        <section className="mt-6 rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Import row issues</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {batch.issues.map((issue) => (
              <div key={issue.id} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-950">
                  {issue.issueType} {issue.rowNumber ? `· Row ${issue.rowNumber}` : ""}
                </p>
                <p className="mt-1 text-slate-600">{issue.message}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-5">
        <Link href="/owner/sku-mappings" className="text-sm font-semibold text-berry hover:text-pink-800">
          Manage SKU image mappings
        </Link>
      </div>
    </AppShell>
  );
}
