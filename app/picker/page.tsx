import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { requireAccount, requireUser } from "@/lib/auth";
import { getSkuGroups } from "@/lib/data";

export default async function PickerSkuGroupsPage() {
  const user = await requireUser(["OWNER", "PICKER"]);
  const account = await requireAccount(user);
  const groups = await getSkuGroups(account.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Picker"
        title="SKU grouped pick list"
        description="Pickers work from product cards grouped by SKU and color so daily picking stays fast on mobile."
      />

      {groups.length === 0 ? (
        <EmptyState
          title="No ready orders"
          description="Orders imported from parsed label batches will appear here until they are packed or marked as a problem."
          action={user.role === "OWNER" ? { href: "/owner/uploads/new", label: "Upload labels" } : undefined}
        />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link
              key={`${group.sku}-${group.color ?? "none"}`}
              href={`/picker/${encodeURIComponent(group.sku)}`}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-berry hover:shadow-soft"
            >
              <ProductImage
                src={group.mapping?.imageUrl}
                alt={group.mapping?.productName ?? group.sku}
                size="lg"
                mappingId={group.mapping?.id}
              />
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-500">SKU</p>
                <h2 className="break-words text-xl font-bold text-slate-950">{group.sku}</h2>
                <p className="mt-1 text-sm text-slate-600">{group.mapping?.productName ?? "Product name not mapped"}</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-slate-50 px-2 py-3">
                  <p className="text-xs font-medium text-slate-500">Color</p>
                  <p className="mt-1 truncate font-semibold text-slate-950">{group.color ?? group.mapping?.color ?? "Unknown"}</p>
                </div>
                <div className="rounded-md bg-pink-50 px-2 py-3">
                  <p className="text-xs font-medium text-pink-700">Qty</p>
                  <p className="mt-1 text-lg font-bold text-berry">{group.totalQuantity}</p>
                </div>
                <div className="rounded-md bg-teal-50 px-2 py-3">
                  <p className="text-xs font-medium text-teal-700">Orders</p>
                  <p className="mt-1 text-lg font-bold text-mint">{group.orderCount}</p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </AppShell>
  );
}
