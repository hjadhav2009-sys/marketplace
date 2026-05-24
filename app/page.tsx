import { redirect } from "next/navigation";
import { getCurrentUser, getSelectedAccount, roleHomePath } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const account = await getSelectedAccount(user);

  if (!account) {
    redirect("/accounts");
  }

  redirect(roleHomePath(user.role));
}
