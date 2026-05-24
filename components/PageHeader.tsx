import Link from "next/link";
import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: {
    href: string;
    label: string;
  };
  children?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, action, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wide text-mint">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{description}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {action ? (
          <Link
            href={action.href}
            className="inline-flex rounded-md bg-berry px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-800"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
