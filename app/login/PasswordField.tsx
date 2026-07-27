"use client";

import { useState } from "react";

export function PasswordField() {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">Password</span>
      <span className="relative mt-2 block">
        <input
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          className="min-h-12 w-full rounded-md border border-slate-300 px-4 py-3 pr-20 text-base outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
          placeholder="Password"
          required
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-1 my-auto min-h-11 rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-berry"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}
