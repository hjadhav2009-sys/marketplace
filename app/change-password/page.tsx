import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { getWeakPasswordWarning } from "@/lib/user-management";
import { changeOwnPasswordAction, logoutFromPasswordChangeAction } from "./actions";

type ChangePasswordPageProps = {
  searchParams?: Promise<{
    required?: string;
    error?: string;
  }>;
};

const errorMessage: Record<string, string> = {
  current: "Current password did not match.",
  mismatch: "New password and confirmation did not match.",
  weak: "Use at least 8 characters and avoid demo passwords."
};

export default async function ChangePasswordPage({ searchParams }: ChangePasswordPageProps) {
  const user = await requireUser(undefined, { allowPasswordChangeRequired: true });
  const params = await searchParams;
  const warning = getWeakPasswordWarning("temporary1");

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <section className="mx-auto max-w-xl rounded-md border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-wide text-berry">Account security</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Change password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Signed in as {user.name}. Use a private password before continuing to daily warehouse work.
        </p>

        {params?.required ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Password change is required before using the app.
          </div>
        ) : null}

        {params?.error ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {errorMessage[params.error] ?? "Could not change password."}
          </div>
        ) : null}

        <form action={changeOwnPasswordAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Current password</span>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">New password</span>
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Confirm new password</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              required
            />
          </label>
          {warning ? <p className="text-sm text-slate-500">{warning}</p> : null}
          <SubmitButton pendingText="Changing...">Change password</SubmitButton>
        </form>

        <form action={logoutFromPasswordChangeAction} className="mt-5">
          <button className="text-sm font-semibold text-slate-600 hover:text-slate-950">Logout instead</button>
        </form>
      </section>
    </main>
  );
}
