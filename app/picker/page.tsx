import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAccount, requireUser } from "@/lib/auth";
import { getSkuGroups } from "@/lib/data";
import { encodePickerDimension } from "@/lib/operations/picking";

type PickerSkuGroupsPageProps = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    picked?: string;
    problem?: string;
  }>;
};

const filters = [
  { value: "pending", label: "Pending" },
  { value: "picked", label: "Picked" },
  { value: "problem", label: "Problem" },
  { value: "missing-image", label: "Missing image" }
];

function pickerDetailHref(sku: string, color: string | null, size: string | null) {
  return `/picker/${encodeURIComponent(sku)}?color=${encodePickerDimension(color)}&size=${encodePickerDimension(size)}`;
}

export default async function PickerSkuGroupsPage({ searchParams }: PickerSkuGroupsPageProps) {
  const user = await requireUser(["OWNER", "PICKER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const activeFilter = params?.filter ?? "pending";
  const groups = await getSkuGroups(account.id, { query: params?.q, filter: activeFilter });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Picker"
        title="SKU grouped pick list"
        description="Pick by product image and SKU. Groups are separated by color and size so counts stay clear."
      />

      {params?.picked ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          SKU group marked picked.
        </div>
      ) : null}

      {params?.problem ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Pick problem recorded.
        </div>
      ) : null}

      <form className="mb-5 grid gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Search SKU or product</span>
          <input
            name="q"
            defaultValue={params?.q}
            placeholder="1202919298_6"
            className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          {filters.map((filter) => (
            <label
              key={filter.value}
              className={`inline-flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                activeFilter === filter.value ? "border-berry bg-pink-50 text-berry" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="filter"
                value={filter.value}
                defaultChecked={activeFilter === filter.value}
                className="accent-pink-700"
              />
              {filter.label}
            </label>
          ))}
          <button className="min-h-12 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm">
            Apply
          </button>
        </div>
      </form>

      {groups.length === 0 ? (
        <EmptyState
          title={activeFilter === "missing-image" ? "No missing image SKUs" : "No orders"}
          description={
            activeFilter === "pending"
              ? "No pending picking groups for this account."
              : "No SKU groups match the current search and filter."
          }
          action={user.role === "OWNER" ? { href: "/owner/uploads/new", label: "Upload labels" } : undefined}
        />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link
              key={`${group.sku}-${group.color ?? "none"}-${group.size ?? "none"}`}
              href={pickerDetailHref(group.sku, group.color, group.size)}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-berry hover:shadow-soft"
            >
              <ProductImage
                src={group.imageUrl}
                alt={group.productName ?? group.sku}
                size="lg"
                mappingId={group.mapping?.id}
                showDebug={user.role === "OWNER"}
                imageHealth={group.mapping?.imageHealth}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge value={group.status} />
                {group.missingImage ? <StatusBadge value="MISSING_IMAGE" /> : null}
                {group.mapping?.imageHealth === "BROKEN" ? (
                  <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                    {user.role === "OWNER" ? "Broken image URL" : "Image issue"}
                  </span>
                ) : null}
              </div>
              <div className="mt-3">
                <p className="text-sm font-medium text-slate-500">SKU</p>
                <h2 className="break-words text-xl font-bold text-slate-950">{group.sku}</h2>
                <p className="mt-1 text-sm text-slate-600">{group.productName ?? "Product name not mapped"}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md bg-slate-50 px-2 py-3">
                  <p className="text-xs font-medium text-slate-500">Color</p>
                  <p className="mt-1 truncate font-semibold text-slate-950">{group.color ?? group.mapping?.color ?? "Unknown"}</p>
                </div>
                <div className="rounded-md bg-slate-50 px-2 py-3">
                  <p className="text-xs font-medium text-slate-500">Size</p>
                  <p className="mt-1 truncate font-semibold text-slate-950">{group.size ?? "Unknown"}</p>
                </div>
                <div className="rounded-md bg-pink-50 px-2 py-3">
                  <p className="text-xs font-medium text-pink-700">Qty</p>
                  <p className="mt-1 text-2xl font-bold text-berry">{group.totalQuantity}</p>
                </div>
                <div className="rounded-md bg-teal-50 px-2 py-3">
                  <p className="text-xs font-medium text-teal-700">Orders</p>
                  <p className="mt-1 text-2xl font-bold text-mint">{group.orderCount}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-slate-50 py-2 text-slate-600">Pending {group.pendingCount}</div>
                <div className="rounded-md bg-slate-50 py-2 text-slate-600">Picked {group.pickedCount}</div>
                <div className="rounded-md bg-slate-50 py-2 text-slate-600">Problem {group.problemCount}</div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </AppShell>
  );
}
