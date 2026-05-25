import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAccount, requireUser } from "@/lib/auth";
import { getSkuGroups } from "@/lib/data";
import { encodePickerDimension } from "@/lib/operations/picking";
import { markSkuGroupPickedAction } from "./[sku]/actions";

type PickerSkuGroupsPageProps = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    picked?: string;
    problem?: string;
    large?: string;
    limit?: string;
    page?: string;
    view?: string;
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
  const largeImageMode = params?.large === "1";
  const compactMode = params?.view !== "cards" && !largeImageMode;
  const pagedGroups = await getSkuGroups(account.id, {
    query: params?.q,
    filter: activeFilter,
    page: params?.page,
    limit: params?.limit
  });
  const groups = pagedGroups.groups;
  const loadMoreParams = new URLSearchParams();
  const cardViewParams = new URLSearchParams();
  const compactViewParams = new URLSearchParams();

  for (const [key, value] of Object.entries({
    q: params?.q,
    filter: activeFilter,
    large: params?.large,
    limit: params?.limit
  })) {
    if (value) {
      loadMoreParams.set(key, value);
      cardViewParams.set(key, value);
      compactViewParams.set(key, value);
    }
  }

  loadMoreParams.set("page", String(pagedGroups.nextPage));
  loadMoreParams.set("view", compactMode ? "compact" : "cards");
  cardViewParams.set("view", "cards");
  compactViewParams.set("view", "compact");
  cardViewParams.delete("large");
  compactViewParams.delete("large");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Picker"
        title="SKU grouped pick list"
        description="Pick by product image, SKU, color, size, and quantity."
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

      <form className="sticky top-[88px] z-20 mb-4 grid gap-3 rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur md:top-[106px] md:grid-cols-[1fr_auto] md:p-4">
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
          <label className="inline-flex min-h-12 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="large" value="1" defaultChecked={largeImageMode} className="accent-pink-700" />
            Large images
          </label>
          <input type="hidden" name="view" value={compactMode ? "compact" : "cards"} />
          <button className="min-h-12 rounded-md bg-slate-950 px-5 py-2 text-sm font-semibold text-white shadow-sm">
            Apply
          </button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <p className="font-semibold text-slate-700">
          Showing {pagedGroups.visibleCount} of {pagedGroups.total} SKU groups
        </p>
        <div className="flex gap-2">
          <Link
            href={`/picker?${compactViewParams}`}
            className={`rounded-md px-3 py-2 font-semibold ${compactMode ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            Compact
          </Link>
          <Link
            href={`/picker?${cardViewParams}`}
            className={`rounded-md px-3 py-2 font-semibold ${compactMode ? "border border-slate-200 bg-white text-slate-700" : "bg-slate-950 text-white"}`}
          >
            Image cards
          </Link>
        </div>
      </div>

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
        <section className={`grid gap-4 ${compactMode ? "md:grid-cols-2 xl:grid-cols-3" : largeImageMode ? "md:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
          {groups.map((group) => {
            const detailHref = pickerDetailHref(group.sku, group.color, group.size);
            const encodedColor = encodePickerDimension(group.color);
            const encodedSize = encodePickerDimension(group.size);

            return (
              <article
                key={`${group.sku}-${group.color ?? "none"}-${group.size ?? "none"}`}
                className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
              >
                {compactMode ? null : (
                  <ProductImage
                    src={group.imageUrl}
                    alt={group.productName ?? group.sku}
                    size="lg"
                    mappingId={group.mapping?.id}
                    showDebug={user.role === "OWNER"}
                    imageHealth={group.mapping?.imageHealth}
                  />
                )}
                <div className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={group.status} />
                    {group.missingImage ? <StatusBadge value="MISSING_IMAGE" /> : null}
                    {group.mapping?.imageHealth === "BROKEN" ? (
                      <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                        {user.role === "OWNER" ? "Broken image URL" : "Image issue"}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <h2 className="break-words text-2xl font-black leading-tight text-slate-950">{group.sku}</h2>
                    {compactMode ? null : (
                      <p className="mt-1 line-clamp-2 min-h-10 text-base leading-5 text-slate-600">
                        {group.productName ?? (group.mapping?.imageUrl ? "Mapped image, no product name" : "Product name not mapped")}
                      </p>
                    )}
                    <p className="mt-2 text-base font-semibold text-slate-800">
                      {[group.color ?? group.mapping?.color, group.size].filter(Boolean).join(" / ") || "Color or size unknown"}
                    </p>
                  </div>

                  <div className="grid grid-cols-[1.1fr_1fr] gap-3">
                    <div className="rounded-md bg-slate-950 p-4 text-white">
                      <p className="text-sm font-semibold text-slate-300">Total qty</p>
                      <p className="mt-1 text-5xl font-black leading-none">{group.totalQuantity}</p>
                    </div>
                    <div className="grid gap-2">
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending</p>
                        <p className="text-xl font-black text-slate-950">{group.pendingCount}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md bg-slate-50 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Picked</p>
                          <p className="text-lg font-black text-slate-950">{group.pickedCount}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Problem</p>
                          <p className="text-lg font-black text-slate-950">{group.problemCount}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Link href={detailHref} className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white">
                      Open
                    </Link>
                    <form action={markSkuGroupPickedAction}>
                      <input type="hidden" name="sku" value={group.sku} />
                      <input type="hidden" name="color" value={encodedColor} />
                      <input type="hidden" name="size" value={encodedSize} />
                      <button type="submit" className="min-h-12 w-full rounded-md bg-berry px-3 py-2 text-sm font-bold text-white">
                        Picked
                      </button>
                    </form>
                    <Link href={`${detailHref}#problem-actions`} className="inline-flex min-h-12 items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                      Problem
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {pagedGroups.hasMore ? (
        <div className="mt-5 flex justify-center">
          <Link
            href={`/picker?${loadMoreParams}`}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-950 px-6 py-3 text-base font-bold text-white shadow-sm"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </AppShell>
  );
}
