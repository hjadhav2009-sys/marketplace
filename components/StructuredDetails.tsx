"use client";

import { useState } from "react";

export type DetailField = {
  label: string;
  value: string | number | null | undefined;
  href?: string | null;
  sensitive?: boolean;
};
export type DetailSection = { title: string; fields: DetailField[]; description?: string };

export function StructuredDetails({ sections }: { sections: DetailSection[] }) {
  const [showEmpty, setShowEmpty] = useState(false);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex justify-end">
        <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(event) => setShowEmpty(event.target.checked)}
          />
          Include empty fields
        </label>
      </div>
      <div className="min-w-0 space-y-4">
        {sections.map((section) => {
          const fields = showEmpty
            ? section.fields
            : section.fields.filter(
                (field) =>
                  field.value !== null
                  && field.value !== undefined
                  && String(field.value).trim() !== ""
              );
          if (!fields.length && !showEmpty) return null;

          return (
            <section
              key={section.title}
              className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"
              data-details-section={section.title}
            >
              <h2 className="break-words text-lg font-semibold text-slate-950">{section.title}</h2>
              {section.description ? (
                <p className="mt-1 break-words text-sm leading-6 text-slate-600">{section.description}</p>
              ) : null}
              <dl className="mt-4 grid min-w-0 gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                {fields.map((field) => (
                  <div
                    key={field.label}
                    className={`min-w-0 border-l-2 py-1 pl-3 ${
                      field.sensitive ? "border-amber-300 bg-amber-50/50" : "border-slate-200"
                    }`}
                  >
                    <dt className="break-words text-xs font-semibold text-slate-500">{field.label}</dt>
                    <dd className="mt-1 break-words text-sm font-medium text-slate-900">
                      {field.href && field.value ? (
                        <a href={field.href} target="_blank" rel="noreferrer" className="text-berry underline">
                          {String(field.value)}
                        </a>
                      ) : field.value === null || field.value === undefined || String(field.value).trim() === "" ? (
                        <span className="font-normal text-slate-400">Not provided</span>
                      ) : (
                        String(field.value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}
