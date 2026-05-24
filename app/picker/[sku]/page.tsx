import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAccount, requireUser } from "@/lib/auth";
import { getSkuDetail } from "@/lib/data";

type PickerSkuDetailPageProps = {
  params: Promise<{
    sku: string;
  }>;
};

export default async function PickerSkuDetailPage({ params }: PickerSkuDetailPageProps) {
  const user = await requireUser(["OWNER", "PICKER"]);
  const account = await requireAccount(user);
  const { sku: encodedSku } = await params;
  const sku = decodeURIComponent(encodedSku);
  const detail = await getSkuDetail(account.id, sku);

  if (!detail.mapping && detail.orders.length === 0) {
    notFound();
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Picker"
        title={sku}
        description="Order-level details for this SKU group. Packing still happens by AWB scan from the shipping label."
      />

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <ProductImage src={detail.mapping?.imageUrl} alt={detail.mapping?.productName ?? sku} size="lg" mappingId={detail.mapping?.id} />
          <h2 className="mt-4 text-xl font-bold text-slate-950">{detail.mapping?.productName ?? "Product not mapped"}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="font-medium text-slate-500">Total quantity</dt>
              <dd className="mt-1 text-2xl font-bold text-berry">{detail.totalQuantity}</dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="font-medium text-slate-500">Orders</dt>
              <dd className="mt-1 text-2xl font-bold text-mint">{detail.orders.length}</dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="font-medium text-slate-500">Mapped color</dt>
              <dd className="mt-1 font-semibold text-slate-950">{detail.mapping?.color ?? "Unknown"}</dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="font-medium text-slate-500">Account</dt>
              <dd className="mt-1 font-semibold text-slate-950">{account.name}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Orders to pick</h2>
          </div>

          {detail.orders.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No active orders"
                description="This SKU has an image mapping, but there are no ready orders waiting to be packed."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {detail.orders.map((order) => (
                <div key={order.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-semibold text-slate-950">AWB {order.awb}</p>
                    <p className="text-sm text-slate-600">
                      Qty {order.qty} · {order.color ?? "Color unknown"} · {order.courier ?? "Courier pending"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Order {order.orderNo}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge value={order.packStatus} />
                    <Link href={`/packing/${order.awb}`} className="text-sm font-semibold text-berry hover:text-pink-800">
                      Pack
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
