"use client";

import { useId, useState } from "react";

type FileUploadFieldProps = {
  name: string;
  label: string;
  accept: string;
  required?: boolean;
  multiple?: boolean;
  hint?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadField({
  name,
  label,
  accept,
  required = false,
  multiple = false,
  hint
}: FileUploadFieldProps) {
  const id = useId();
  const [files, setFiles] = useState<Array<{ name: string; size: number }>>([]);

  return (
    <div>
      <label htmlFor={id} className="text-sm font-bold text-slate-900">
        {label}
        {required ? <span className="ml-1 text-rose-700" aria-hidden="true">*</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <input
          id={id}
          name={name}
          type="file"
          accept={accept}
          required={required}
          multiple={multiple}
          onChange={(event) =>
            setFiles(Array.from(event.currentTarget.files ?? []).map((file) => ({ name: file.name, size: file.size })))
          }
          className="block min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-700 file:mr-3 file:min-h-11 file:cursor-pointer file:border-0 file:border-r file:border-slate-300 file:bg-slate-950 file:px-4 file:font-bold file:text-white hover:file:bg-slate-800"
        />
        {files.length ? (
          <ul className="mt-3 grid gap-1 text-xs text-slate-700" aria-live="polite">
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`} className="flex min-w-0 justify-between gap-3">
                <span className="truncate font-semibold">{file.name}</span>
                <span className="shrink-0 text-slate-500">{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500" aria-live="polite">No file selected.</p>
        )}
      </div>
      {hint ? <p className="mt-2 text-xs leading-5 text-slate-600">{hint}</p> : null}
    </div>
  );
}
