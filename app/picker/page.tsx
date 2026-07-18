import { redirect } from "next/navigation";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";

export default async function LegacyPickerPage() {
  const user = await requireUser();
  await requireAccount(user);
  if (!hasWorkPermission(user, "canPick")) redirect(capabilityHomePath(user));
  redirect("/work/pick?source=ORDER");
}
