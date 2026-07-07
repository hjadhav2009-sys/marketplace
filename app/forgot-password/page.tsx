import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { forgotPasswordRequestAction } from "./actions";

type ForgotPasswordPageProps = {
  searchParams?: Promise<{
    sent?: string;
  }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-berry">Password help</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Request owner reset</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Submit your username. If it matches a worker login, the owner will see a password reset request.
        </p>

        {params?.sent ? (
          <div className="mt-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
            If that username can be reviewed, the owner will see the request. Ask the owner for the temporary password.
          </div>
        ) : null}

        <form action={forgotPasswordRequestAction} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Username</span>
            <input
              name="username"
              autoComplete="username"
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
              required
            />
          </label>
          <SubmitButton pendingText="Sending request...">Send reset request</SubmitButton>
        </form>

        <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-berry hover:text-pink-800">
          Back to login
        </Link>
      </section>
    </main>
  );
}
