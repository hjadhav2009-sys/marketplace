import React, { type ReactNode } from "react";

type WorkCardProps = {
  actions: ReactNode;
  context: ReactNode;
  disclosure?: ReactNode;
  identity: ReactNode;
  media: ReactNode;
  quantity: ReactNode;
  state?: ReactNode;
  source: string;
  stage: string;
  status: string;
};

export function WorkCard({ actions, context, disclosure, identity, media, quantity, state, source, stage, status }: WorkCardProps) {
  return (
    <article
      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      data-responsive-work-card
      data-source={source}
      data-stage={stage}
      data-status={status}
    >
      <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">{context}</div>
      <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4 sm:p-4 xl:grid-cols-[7rem_minmax(0,1fr)_minmax(13rem,0.68fr)_minmax(12rem,0.62fr)] xl:items-start">
        <div className="min-w-0">{media}</div>
        <div className="min-w-0">{identity}</div>
        <div className="col-span-2 min-w-0 xl:col-span-1" data-quantity-panel>{quantity}</div>
        <div className="col-span-2 min-w-0 xl:col-span-1 xl:row-span-2" data-work-actions>{actions}</div>
        {state ? <div className="col-span-2 min-w-0 xl:col-start-2 xl:col-end-4">{state}</div> : null}
      </div>
      {disclosure ? <div className="border-t border-slate-100 px-3 sm:px-4">{disclosure}</div> : null}
    </article>
  );
}

type WorkCardIdentityProps = {
  description?: ReactNode;
  eyebrow: ReactNode;
  metadata?: ReactNode;
  sellerSku: ReactNode;
  title: ReactNode;
};

export function WorkCardIdentity({ description, eyebrow, metadata, sellerSku, title }: WorkCardIdentityProps) {
  return (
    <div className="min-w-0">
      <p className="break-words text-xs font-semibold uppercase tracking-wide text-berry">{eyebrow}</p>
      <h2 className="mt-1 break-words text-base font-semibold leading-snug text-slate-950 sm:text-lg">{title}</h2>
      {description ? <div className="mt-1 break-words text-sm leading-5 text-slate-600">{description}</div> : null}
      <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-800">Seller SKU {sellerSku}</p>
      {metadata ? <div className="mt-2 min-w-0 text-xs leading-5 text-slate-500">{metadata}</div> : null}
    </div>
  );
}
