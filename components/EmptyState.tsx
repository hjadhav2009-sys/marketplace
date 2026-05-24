import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: {
    href: string;
    label: string;
  };
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-5 inline-flex rounded-md bg-berry px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-800"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
