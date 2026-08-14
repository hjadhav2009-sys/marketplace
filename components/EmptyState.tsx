import React from "react";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { Surface } from "@/components/ui/Surface";

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
    <Surface className="ui-empty-state">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className={buttonStyles({ className: "mt-5" })}
        >
          {action.label}
        </Link>
      ) : null}
    </Surface>
  );
}
