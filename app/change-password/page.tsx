import { requireUser } from "@/lib/auth";
import { changeOwnPasswordAction, logoutFromPasswordChangeAction } from "./actions";
import { ChangePasswordForm } from "./ChangePasswordForm";

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

        <ChangePasswordForm action={changeOwnPasswordAction} />

        <form action={logoutFromPasswordChangeAction} className="mt-5">
          <button className="min-h-11 px-2 text-sm font-semibold text-slate-600 hover:text-slate-950">Logout instead</button>
        </form>
      </section>
    </main>
  );
}
