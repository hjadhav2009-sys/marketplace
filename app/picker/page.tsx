import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PickerProductCard } from "@/components/PickerProductCard";
import { requireAccount, requireUser } from "@/lib/auth";
import { getLatestImportedBatch, getSkuGroups } from "@/lib/data";
import { encodePickerDimension } from "@/lib/operations/picking";
import { normalizeWorkQueueFilter } from "@/lib/operations/work-queue";

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
    work?: string;
    batchId?: string;
  }>;
};

const filters = [
  { value: "pending", label: "Pending" },
  { value: "picked", label: "Picked" },
  { value: "problem", label: "Problem" },
  { value: "missing-image", label: "Missing image" }
];

const workFilters = [
  { value: "today", label: "Today" },
  { value: "current-batch", label: "Current batch" },
  { value: "all-pending", label: "All pending" },
  { value: "old-pending", label: "Old pending" },
  { value: "problems", label: "Problems" }
];

export default async function PickerSkuGroupsPage({ searchParams }: PickerSkuGroupsPageProps) {
  const user = await requireUser(["OWNER", "PICKER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const activeWork = normalizeWorkQueueFilter(params?.work);
  const activeFilter = params?.filter ?? (activeWork === "problems" ? "problem" : "pending");
  const largeImageMode = params?.large === "1";
  const compactMode = params?.view === "compact" && !largeImageMode;
  const latestBatch = await getLatestImportedBatch(account.id);
  const activeBatchId = params?.batchId ?? (activeWork === "current-batch" ? latestBatch?.id : undefined);
  const pagedGroups = await getSkuGroups(account.id, {
    query: params?.q,
    filter: activeFilter,
    page: params?.page,
    limit: params?.limit,
    work: activeWork,
    batchId: activeBatchId
  });
  const groups = pagedGroups.groups;
  const loadMoreParams = new URLSearchParams();
  const cardViewParams = new URLSearchParams();
  const compactViewParams = new URLSearchParams();

  for (const [key, value] of Object.entries({
    q: params?.q,
    filter: activeFilter,
    large: params?.large,
    limit: params?.limit,
    work: activeWork,
    batchId: activeBatchId
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

      <form className="sticky top-[88px] z-20 mb-4 grid gap-2 rounded-md border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur md:top-[106px] md:grid-cols-[1fr_auto] md:p-3">
        <label className="block">
          <span className="sr-only">Search SKU or product</span>
          <input
            name="q"
            defaultValue={params?.q}
            placeholder="1202919298_6"
            className="min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {workFilters.map((filter) => (
            <label
              key={filter.value}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
                activeWork === filter.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="work"
                value={filter.value}
                defaultChecked={activeWork === filter.value}
                className="accent-slate-950"
              />
              {filter.label}
            </label>
          ))}
          {filters.map((filter) => (
            <label
              key={filter.value}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
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
          <label className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="large" value="1" defaultChecked={largeImageMode} className="accent-pink-700" />
            Large images
          </label>
          <input type="hidden" name="view" value={compactMode ? "compact" : "cards"} />
          {activeWork === "current-batch" && activeBatchId ? <input type="hidden" name="batchId" value={activeBatchId} /> : null}
          <button className="min-h-10 shrink-0 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm">
            Apply
          </button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <p className="font-semibold text-slate-700">
          Showing {pagedGroups.visibleCount} of {pagedGroups.total} SKU groups
          {activeWork === "today" ? " from today" : activeWork === "current-batch" && latestBatch ? ` from ${latestBatch.fileName}` : null}
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
        <section className="rounded-md border border-slate-200 bg-white px-4 py-5 shadow-sm">
          <h2 className="text-base font-black text-slate-950">
            {activeFilter === "missing-image" ? "No missing image SKUs" : "No orders"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {activeFilter === "pending"
              ? activeWork === "today"
                ? "No pending picking groups from today's imports."
                : "No pending picking groups for this account."
              : "No SKU groups match the current search and filter."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2" data-picker-empty-actions>
            {user.role === "OWNER" ? (
              <Link prefetch href="/owner/uploads/new" className="rounded-md bg-berry px-4 py-2 text-sm font-bold text-white shadow-sm">
                Upload today&apos;s orders
              </Link>
            ) : null}
            <Link prefetch href="/picker?work=old-pending&filter=pending" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm">
              View old pending
            </Link>
          </div>
        </section>
      ) : (
        <section className={`grid gap-4 ${compactMode ? "md:grid-cols-2 xl:grid-cols-3" : largeImageMode ? "md:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
          {groups.map((group) => {
            const encodedColor = encodePickerDimension(group.color);
            const encodedSize = encodePickerDimension(group.size);
            const detailsParams = new URLSearchParams({
              sku: group.sku,
              color: encodedColor,
              size: encodedSize
            });

            return (
              <PickerProductCard
                key={`${group.sku}-${group.color ?? "none"}-${group.size ?? "none"}`}
                group={group}
                encodedColor={encodedColor}
                encodedSize={encodedSize}
                detailsUrl={`/picker/details?${detailsParams}`}
                activeFilter={activeFilter}
                compactMode={compactMode}
              />
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
