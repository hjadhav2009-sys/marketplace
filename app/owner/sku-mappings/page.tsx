import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImage } from "@/components/ProductImage";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser } from "@/lib/auth";
import { getSkuMappings } from "@/lib/data";
import { upsertSkuImageMappingAction } from "./actions";

type SkuMappingsPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function SkuMappingsPage({ searchParams }: SkuMappingsPageProps) {
  const user = await requireUser(["OWNER"]);
  const account = await requireAccount(user);
  const [params, mappings] = await Promise.all([searchParams, getSkuMappings(account.id)]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="SKU Images"
        title="Map SKU to product image URL"
        description="Store only the Meesho product image URL. These images power picker cards and the packer scan result screen."
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
            <SubmitButton pendingText="Saving...">Save mapping</SubmitButton>
          </div>
        </form>

        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">Current mappings</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {mappings.map((mapping) => (
              <div key={mapping.id} className="flex gap-4 px-4 py-4">
                <ProductImage src={mapping.imageUrl} alt={mapping.productName ?? mapping.sku} size="sm" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{mapping.sku}</p>
                  <p className="text-sm text-slate-600">{mapping.productName ?? "No product name"}</p>
                  <p className="text-sm text-slate-500">{mapping.color ?? "Color not set"}</p>
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
