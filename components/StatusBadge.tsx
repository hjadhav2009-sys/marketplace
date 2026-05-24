import { titleCase } from "@/lib/format";

const statusTone: Record<string, string> = {
  READY: "bg-blue-50 text-blue-700 ring-blue-200",
  PACKED: "bg-teal-50 text-teal-700 ring-teal-200",
  PROBLEM: "bg-amber-50 text-amber-800 ring-amber-200",
  OPEN: "bg-amber-50 text-amber-800 ring-amber-200",
  RESOLVED: "bg-teal-50 text-teal-700 ring-teal-200",
  IMPORTED: "bg-teal-50 text-teal-700 ring-teal-200",
  REVIEWED: "bg-blue-50 text-blue-700 ring-blue-200",
  PARSED: "bg-violet-50 text-violet-700 ring-violet-200",
  UPLOADED: "bg-slate-50 text-slate-700 ring-slate-200"
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusTone[value] ?? statusTone.UPLOADED}`}>
      {titleCase(value)}
    </span>
  );
}
