import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") === "inactive" ? "inactive" : "expired";
  const loginUrl = new URL("/login", url.origin);

  await clearSession();

  if (reason === "inactive") {
    loginUrl.searchParams.set("inactive", "1");
  } else {
    loginUrl.searchParams.set("expired", "1");
  }

  return NextResponse.redirect(loginUrl);
}
