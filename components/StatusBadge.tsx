import { titleCase } from "@/lib/format";

const statusTone: Record<string, string> = {
  READY: "bg-blue-50 text-blue-700 ring-blue-200",
  FOUND: "bg-blue-50 text-blue-700 ring-blue-200",
  PACKED: "bg-teal-50 text-teal-700 ring-teal-200",
  PICKED: "bg-teal-50 text-teal-700 ring-teal-200",
  PROBLEM: "bg-amber-50 text-amber-800 ring-amber-200",
  NOT_FOUND: "bg-rose-50 text-rose-700 ring-rose-200",
  MISSING_IMAGE: "bg-amber-50 text-amber-800 ring-amber-200",
  OK: "bg-teal-50 text-teal-700 ring-teal-200",
  WARNING: "bg-amber-50 text-amber-800 ring-amber-200",
  NEEDS_ACTION: "bg-rose-50 text-rose-700 ring-rose-200",
  OPEN: "bg-amber-50 text-amber-800 ring-amber-200",
  RESOLVED: "bg-teal-50 text-teal-700 ring-teal-200",
  IMPORTED: "bg-teal-50 text-teal-700 ring-teal-200",
  REVIEWED: "bg-blue-50 text-blue-700 ring-blue-200",
  PARSED: "bg-violet-50 text-violet-700 ring-violet-200",
  UPLOADED: "bg-slate-50 text-slate-700 ring-slate-200",
  ACTIVE: "bg-teal-50 text-teal-700 ring-teal-200",
  INACTIVE: "bg-slate-100 text-slate-600 ring-slate-200",
  PASSWORD_REQUIRED: "bg-amber-50 text-amber-800 ring-amber-200",
  OWNER: "bg-pink-50 text-pink-700 ring-pink-200",
  PICKER: "bg-blue-50 text-blue-700 ring-blue-200",
  PACKER: "bg-amber-50 text-amber-800 ring-amber-200",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-200"
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusTone[value] ?? statusTone.UPLOADED}`}>
      {titleCase(value)}
    </span>
  );
}
