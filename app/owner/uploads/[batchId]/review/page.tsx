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
      uploadedBy: true
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
            <p className="font-semibold text-slate-950">{batch.filename}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Uploaded</p>
            <p className="font-semibold text-slate-950">{formatDateTime(batch.createdAt)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Uploaded by</p>
            <p className="font-semibold text-slate-950">{batch.uploadedBy?.name ?? "Unknown"}</p>
          </div>
        </div>
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
                      <td className="px-4 py-3">{order.quantity}</td>
                      <td className="px-4 py-3">{order.color ?? "Unknown"}</td>
                      <td className="px-4 py-3">{order.courier ?? "Unknown"}</td>
                      <td className="px-4 py-3">{order.orderNumber}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={order.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="mt-5">
        <Link href="/owner/sku-mappings" className="text-sm font-semibold text-berry hover:text-pink-800">
          Manage SKU image mappings
        </Link>
      </div>
    </AppShell>
  );
}
