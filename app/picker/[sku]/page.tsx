import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { getSkuDetail } from "@/lib/data";
import { encodePickerDimension } from "@/lib/operations/picking";
import { markSkuGroupPickedAction, markSkuGroupProblemAction } from "./actions";

type PickerSkuDetailPageProps = {
  params: Promise<{
    sku: string;
  }>;
  searchParams?: Promise<{
    color?: string;
    size?: string;
    picked?: string;
    problem?: string;
    error?: string;
  }>;
};

export default async function PickerSkuDetailPage({ params, searchParams }: PickerSkuDetailPageProps) {
  const user = await requireUser(["OWNER", "PICKER"]);
  const account = await requireAccount(user);
  const { sku: encodedSku } = await params;
  const query = await searchParams;
  const sku = decodeURIComponent(encodedSku);
  const detail = await getSkuDetail(account.id, sku, { color: query?.color, size: query?.size });

  if (!detail.mapping && detail.orders.length === 0) {
    notFound();
  }

  const firstOrder = detail.orders[0];
  const imageUrl = firstOrder?.imageUrl ?? detail.mapping?.imageUrl;
  const groupColor = firstOrder?.color ?? detail.mapping?.color ?? null;
  const groupSize = firstOrder?.size ?? null;
  const hiddenColor = query?.color ?? encodePickerDimension(groupColor);
  const hiddenSize = query?.size ?? encodePickerDimension(groupSize);
  const courierEntries = Object.entries(detail.courierCounts);
  const groupStatus = detail.problemCount > 0 ? "PROBLEM" : detail.pendingCount === 0 ? "PICKED" : "READY";

  return (
    <AppShell>
      <PageHeader
        eyebrow="Picker"
        title={sku}
        description="Verify the product image and gather every order in this SKU, color, and size group."
      >
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={groupStatus} />
          <Link
            href="/picker?filter=pending"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-berry hover:text-berry"
          >
            Pick next SKU
          </Link>
        </div>
      </PageHeader>

      {query?.picked === "already" ? (
        <div className="mb-5 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          This group was already picked. No duplicate update was made.
        </div>
      ) : query?.picked ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          SKU group marked picked.
        </div>
      ) : null}

      {query?.problem ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Pick problem recorded for this group.
        </div>
      ) : null}

      {query?.error ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Add a clear reason before marking a pick problem.
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <ProductImage src={imageUrl} alt={detail.mapping?.productName ?? sku} size="lg" mappingId={detail.mapping?.id} />
            <h2 className="mt-4 text-xl font-bold text-slate-950">{detail.mapping?.productName ?? "Product not mapped"}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Total quantity</dt>
                <dd className="mt-1 text-3xl font-bold text-berry">{detail.totalQuantity}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Orders</dt>
                <dd className="mt-1 text-3xl font-bold text-mint">{detail.orders.length}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Color</dt>
                <dd className="mt-1 font-semibold text-slate-950">{groupColor ?? "Unknown"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Size</dt>
                <dd className="mt-1 font-semibold text-slate-950">{groupSize ?? "Unknown"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-950">Pick actions</h2>
            <form action={markSkuGroupPickedAction} className="mt-4">
              <input type="hidden" name="sku" value={sku} />
              <input type="hidden" name="color" value={hiddenColor} />
              <input type="hidden" name="size" value={hiddenSize} />
              <SubmitButton pendingText="Marking...">Mark all picked</SubmitButton>
            </form>

            <form action={markSkuGroupProblemAction} className="mt-5 border-t border-slate-200 pt-4">
              <input type="hidden" name="sku" value={sku} />
              <input type="hidden" name="color" value={hiddenColor} />
              <input type="hidden" name="size" value={hiddenSize} />
              <h3 className="font-semibold text-slate-950">Mark problem</h3>
              <label className="mt-3 block">
                <span className="text-sm font-medium text-slate-700">Reason</span>
                <input
                  name="reason"
                  required
                  placeholder="Stock missing, wrong color..."
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
                  Save pick problem
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-950">Courier split</h2>
            {courierEntries.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No courier split yet.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {courierEntries.map(([courier, count]) => (
                  <div key={courier} className="rounded-md bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-950">{courier}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-700">{count}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-slate-950">Orders in this group</h2>
            </div>

            {detail.orders.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No active orders"
                  description="This SKU has an image mapping, but there are no active orders in this color and size group."
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.orders.map((order) => (
                  <div key={order.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="font-semibold text-slate-950">AWB {order.awb}</p>
                      <p className="text-sm text-slate-600">
                        Qty {order.qty} - {order.color ?? "Color unknown"} - {order.size ?? "Size unknown"} - {order.courier ?? "Courier pending"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Order {order.orderNo}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge value={order.pickStatus} />
                      {user.role === "OWNER" ? (
                        <Link href={`/packing/${order.awb}`} className="text-sm font-semibold text-berry hover:text-pink-800">
                          Pack
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
