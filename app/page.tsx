import { redirect } from "next/navigation";
import { capabilityHomePath, getCurrentUser, getSelectedAccount } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const account = await getSelectedAccount(user);

  if (!account) {
    redirect("/accounts");
  }

  redirect(capabilityHomePath(user));
}
