import Link from "next/link";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { Field, fieldControlStyles } from "@/components/ui/Field";
import { Surface } from "@/components/ui/Surface";
import { filterSummary, type ProductInventoryFilterState } from "./presentation";

const statusOptions = [
  ["all", "All statuses"],
  ["active", "Active"],
  ["inactive", "Inactive"]
];

const imageOptions = [
  ["all", "All images"],
  ["available", "Image available"],
  ["missing", "Missing image"]
];

const processingOptions = [
  ["all", "All processing"],
  ["none", "No saved default"],
  ["PICK_PACK", "Direct to Pack"],
  ["PICK_MARK_PACK", "Marking"],
  ["PICK_ASSEMBLE_PACK", "Assembly"],
  ["PICK_MARK_ASSEMBLE_PACK", "Marking + Assembly"]
];

function SelectField({ id, label, name, value, options, className = "" }: {
  id: string;
  label: string;
  name: string;
  value: string;
  options: string[][];
  className?: string;
}) {
  return <Field id={id} label={label} className={className}>
    {(attributes) => <select {...attributes} name={name} defaultValue={value} className={fieldControlStyles()}>
      {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
    </select>}
  </Field>;
}

export function InventoryFilters({ state }: { state: ProductInventoryFilterState }) {
  return <div className="mb-4 space-y-2">
    <Surface padding="compact">
      <form className="grid min-w-0 gap-3 xl:grid-cols-[minmax(18rem,1fr)_11rem_11rem_13rem_auto_auto] xl:items-end">
        <Field id="inventory-search" label="Search products">
          {(attributes) => <input {...attributes} name="q" defaultValue={state.q} maxLength={160} autoComplete="off" placeholder="SKU, marketplace ID, title, or category" className={fieldControlStyles({ size: "large" })} />}
        </Field>
        <SelectField id="inventory-status" label="Status" name="status" value={state.status} options={statusOptions} className="hidden xl:grid" />
        <SelectField id="inventory-image" label="Images" name="image" value={state.image} options={imageOptions} className="hidden xl:grid" />
        <SelectField id="inventory-processing" label="Processing" name="processing" value={state.processing} options={processingOptions} className="hidden xl:grid" />
        <button className={buttonStyles({ variant: "primary", size: "large", className: "w-full xl:w-auto" })}>Search</button>
        <Link href="/owner/product-inventory" className={buttonStyles({ variant: "quiet", size: "large", className: "hidden xl:inline-flex" })}>Clear</Link>
      </form>
    </Surface>

    <div className="flex items-start gap-2 xl:hidden">
    <details className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-900 marker:hidden">
        <span>Filters</span>
        <span className="min-w-0 truncate text-xs font-medium text-slate-500" title={filterSummary(state)}>{filterSummary(state)}</span>
      </summary>
      <form className="grid gap-3 border-t border-slate-200 p-3">
        <input type="hidden" name="q" value={state.q} />
        <SelectField id="mobile-inventory-status" label="Status" name="status" value={state.status} options={statusOptions} />
        <SelectField id="mobile-inventory-image" label="Images" name="image" value={state.image} options={imageOptions} />
        <SelectField id="mobile-inventory-processing" label="Processing" name="processing" value={state.processing} options={processingOptions} />
        <div className="grid grid-cols-2 gap-2">
          <button className={buttonStyles({ variant: "secondary", className: "w-full" })}>Apply filters</button>
          <Link href="/owner/product-inventory" className={buttonStyles({ variant: "quiet", className: "w-full" })}>Clear</Link>
        </div>
      </form>
    </details>
    <Link href="/owner/product-inventory" className={buttonStyles({ variant: "quiet" })}>Clear</Link>
    </div>
  </div>;
}
