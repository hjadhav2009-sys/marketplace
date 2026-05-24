type StatCardProps = {
  label: string;
  value: string | number;
  tone?: "berry" | "mint" | "clay" | "slate";
};

const toneClass = {
  berry: "border-pink-200 bg-pink-50 text-berry",
  mint: "border-teal-200 bg-teal-50 text-mint",
  clay: "border-amber-200 bg-amber-50 text-clay",
  slate: "border-slate-200 bg-white text-slate-950"
};

export function StatCard({ label, value, tone = "slate" }: StatCardProps) {
  return (
    <div className={`rounded-md border p-4 shadow-sm ${toneClass[tone]}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
