"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";

type ChangePasswordFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

function PasswordInput({
  label,
  name,
  autoComplete,
  value,
  onChange,
  invalid,
  describedBy,
  onCapsLock
}: {
  label: string;
  name: string;
  autoComplete: string;
  value?: string;
  onChange?: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  onCapsLock: (active: boolean) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="relative mt-1 block">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={name === "currentPassword" ? undefined : 8}
          value={value}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          onKeyUp={(event) => onCapsLock(event.getModifierState("CapsLock"))}
          onBlur={() => onCapsLock(false)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`min-h-12 w-full rounded-md border px-3 py-2 pr-20 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100 ${
            invalid ? "border-rose-400 bg-rose-50/40" : "border-slate-300"
          }`}
          required
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-1 my-auto min-h-11 rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}

function Requirement({ met, children }: { met: boolean; children: string }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className="w-4 shrink-0 font-bold">{met ? "✓" : "○"}</span>
      <span>{children}</span>
      <span className="sr-only">{met ? "met" : "not met"}</span>
    </li>
  );
}

export function ChangePasswordForm({ action }: ChangePasswordFormProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const atLeastEight = newPassword.trim().length >= 8;
  const notDemoPassword = !["demo1234", "password", "password123"].includes(newPassword.trim().toLowerCase());
  const recommendedStrength =
    newPassword.length >= 12
    && /[A-Za-z]/.test(newPassword)
    && /\d/.test(newPassword)
    && /[^A-Za-z0-9]/.test(newPassword);
  const matches = confirmation.length > 0 && newPassword === confirmation;
  const mismatch = confirmation.length > 0 && !matches;

  return (
    <form action={action} className="mt-6 space-y-4">
      <PasswordInput
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        onCapsLock={setCapsLock}
      />
      <PasswordInput
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
        invalid={newPassword.length > 0 && (!atLeastEight || !notDemoPassword)}
        describedBy="password-requirements"
        onCapsLock={setCapsLock}
      />
      <PasswordInput
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        value={confirmation}
        onChange={setConfirmation}
        invalid={mismatch}
        describedBy="password-match-status"
        onCapsLock={setCapsLock}
      />

      {capsLock ? (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          Caps Lock is on.
        </p>
      ) : null}

      <div id="password-requirements" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Password requirements</p>
        <ul className="mt-2 space-y-1" aria-live="polite">
          <Requirement met={atLeastEight}>At least 8 characters</Requirement>
          <Requirement met={notDemoPassword}>Not a common demo password</Requirement>
          <Requirement met={recommendedStrength}>Recommended: 12+ characters with letters, numbers, and a symbol</Requirement>
        </ul>
      </div>

      <p
        id="password-match-status"
        aria-live="polite"
        className={`text-sm font-medium ${mismatch ? "text-rose-700" : matches ? "text-emerald-700" : "text-slate-500"}`}
      >
        {mismatch ? "Passwords do not match." : matches ? "Passwords match." : "Re-enter the new password to confirm it."}
      </p>

      <SubmitButton className="w-full sm:w-auto" pendingText="Changing...">
        Change password
      </SubmitButton>
    </form>
  );
}
