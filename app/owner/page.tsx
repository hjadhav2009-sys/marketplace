import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function OwnerRouteRedirectPage() {
  await requireUser(["OWNER"]);
  redirect("/dashboard");
}
