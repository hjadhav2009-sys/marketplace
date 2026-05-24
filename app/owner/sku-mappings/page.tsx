import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { searchSkuMappings } from "@/lib/data";
import { upsertSkuImageMappingAction } from "./actions";

type SkuMappingsPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
    q?: string;
    active?: string;
  }>;
};

export default async function SkuMappingsPage({ searchParams }: SkuMappingsPageProps) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const params = await searchParams;
  const mappings = await searchSkuMappings(account.id, params?.q, params?.active);

  return (
    <AppShell>
      <PageHeader
        eyebrow="SKU Images"
        title="Map SKU to product image URL"
        description="Store only the Meesho product image URL. These images power picker cards and the packer scan result screen."
        action={{ href: "/owner/sku-mappings/import", label: "Import CSV/XLSX" }}
      />

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <form action={upsertSkuImageMappingAction} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Add or update mapping</h2>

          {params?.error ? (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              Check SKU and image URL.
            </div>
          ) : null}

          {params?.saved ? (
            <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
              Mapping saved.
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">SKU</span>
              <input
                name="sku"
                required
                placeholder="1202919298_6"
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Image URL</span>
              <input
                name="imageUrl"
                required
                type="url"
                placeholder="https://images-r.meesho.com/..."
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Product name</span>
              <input
                name="productName"
                placeholder="Sports Jersey Number Personalized Pendant"
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Color</span>
              <input
                name="color"
                placeholder="Silver"
                className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Notes</span>
              <textarea
                name="notes"
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input name="active" type="checkbox" defaultChecked className="h-5 w-5 accent-pink-700" />
              Active mapping
            </label>
            <SubmitButton pendingText="Saving...">Save mapping</SubmitButton>
          </div>
        </form>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Current mappings</h2>
            <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                name="q"
                defaultValue={params?.q ?? ""}
                placeholder="Search SKU or product"
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              />
              <select
                name="active"
                defaultValue={params?.active ?? "active"}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
              <button className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
                Filter
              </button>
            </form>
          </div>
          <div className="divide-y divide-slate-100">
            {mappings.map((mapping) => (
              <div key={mapping.id} className="flex gap-4 px-4 py-4">
                <ProductImage src={mapping.imageUrl} alt={mapping.productName ?? mapping.sku} size="sm" mappingId={mapping.id} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">
                    {mapping.sku} {!mapping.active ? <span className="text-xs text-slate-500">(inactive)</span> : null}
                  </p>
                  <p className="text-sm text-slate-600">{mapping.productName ?? "No product name"}</p>
                  <p className="text-sm text-slate-500">{mapping.color ?? "Color not set"}</p>
                  {mapping.notes ? <p className="mt-1 text-sm text-slate-500">{mapping.notes}</p> : null}
                </div>
              </div>
            ))}
            {mappings.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No SKU images mapped yet.</div>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
