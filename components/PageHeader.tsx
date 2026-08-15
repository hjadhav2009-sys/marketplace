import Link from "next/link";
import type { ReactNode } from "react";
import { buttonStyles } from "@/components/ui/buttonStyles";

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
    <div className="mb-4 flex min-w-0 flex-col gap-3 border-b border-slate-200 pb-4 sm:mb-6 sm:gap-4 sm:pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wide text-mint sm:text-sm">{eyebrow}</p> : null}
        <h1 className="break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl break-words text-sm leading-6 text-slate-600 sm:mt-2 sm:text-base">{description}</p> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        {children}
        {action ? (
          <Link
            href={action.href}
            className={buttonStyles({ variant: "primary" })}
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
