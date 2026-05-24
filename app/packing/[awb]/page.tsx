import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { getOrderWithImage } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { confirmPackedAction, reportProblemFromScanAction } from "./actions";

type ScanResultPageProps = {
  params: Promise<{
    awb: string;
  }>;
  searchParams?: Promise<{
    packed?: string;
    problem?: string;
  }>;
};

export default async function ScanResultPage({ params, searchParams }: ScanResultPageProps) {
  const user = await requireUser(["OWNER", "PACKER"]);
  const account = await requireAccount(user);
  const { awb: encodedAwb } = await params;
  const awb = decodeURIComponent(encodedAwb);
  const result = await getOrderWithImage(account.id, awb);
  const query = await searchParams;

  if (!result) {
    notFound();
  }

  const { order, mapping } = result;
  const canPack = order.status === "READY";

  return (
    <AppShell>
      <PageHeader
        eyebrow="Scan result"
        title={`AWB ${order.awb}`}
        description="Verify the product image and order details before confirming the shipment is packed."
      >
        <StatusBadge value={order.status} />
      </PageHeader>

      {query?.packed ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Order marked as packed.
        </div>
      ) : null}

      {query?.problem ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Problem order created.
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <ProductImage src={mapping?.imageUrl} alt={mapping?.productName ?? order.sku} size="lg" />
          <h2 className="mt-4 text-xl font-bold text-slate-950">{mapping?.productName ?? order.productDescription ?? order.sku}</h2>
          <p className="mt-2 text-sm text-slate-600">{order.productDescription ?? "No product description extracted yet."}</p>
        </div>

        <div className="space-y-5">
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">SKU</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{order.sku}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Quantity</dt>
                <dd className="mt-1 text-2xl font-bold text-berry">{order.quantity}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Color</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.color ?? mapping?.color ?? "Unknown"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Courier</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.courier ?? "Unknown"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Account</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.account.name}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Order number</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{order.orderNumber}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Payment</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.paymentType}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Destination</dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {[order.city, order.state].filter(Boolean).join(", ") || "Not extracted"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <form action={confirmPackedAction} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <input type="hidden" name="orderId" value={order.id} />
              <h3 className="font-semibold text-slate-950">Confirm packed</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use this after matching the label, product image, SKU, color, and quantity.
              </p>
              <div className="mt-4">
                <SubmitButton pendingText="Confirming..." variant={canPack ? "primary" : "secondary"}>
                  {canPack ? "Mark packed" : "Already handled"}
                </SubmitButton>
              </div>
            </form>

            <form action={reportProblemFromScanAction} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <input type="hidden" name="orderId" value={order.id} />
              <h3 className="font-semibold text-slate-950">Mark problem</h3>
              <label className="mt-3 block">
                <span className="text-sm font-medium text-slate-700">Reason</span>
                <input
                  name="reason"
                  required
                  placeholder="Missing item, color mismatch..."
                  className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
                />
              </label>
              <label className="mt-3 block">
                <span className="text-sm font-medium text-slate-700">Details</span>
                <textarea
                  name="details"
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
                />
              </label>
              <div className="mt-4">
                <SubmitButton pendingText="Saving..." variant="secondary">
                  Save problem
                </SubmitButton>
              </div>
            </form>
          </div>

          <div className="rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="font-semibold text-slate-950">Recent scan log</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {order.scanLogs.map((log) => (
                <div key={log.id} className="px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-950">
                    {log.outcome} · {log.scannedBy?.name ?? "Unknown"}
                  </p>
                  <p className="text-slate-500">{formatDateTime(log.createdAt)}</p>
                </div>
              ))}
              {order.scanLogs.length === 0 ? (
                <div className="px-4 py-5 text-sm text-slate-500">No scans logged yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5">
        <Link href="/packing" className="text-sm font-semibold text-berry hover:text-pink-800">
          Scan another AWB
        </Link>
      </div>
    </AppShell>
  );
}
