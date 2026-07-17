import { redirect } from "next/navigation";
import { requireAccount, requireUser, roleHomePath } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";

export default async function LegacyPickerPage() {
  const user = await requireUser();
  await requireAccount(user);
  if (!hasWorkPermission(user, "canPick")) redirect(roleHomePath(user.role));
  redirect("/work/pick?source=ORDER");
}
