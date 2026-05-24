import { NextResponse, type NextRequest } from "next/server";
import { isAllowedLocalNetworkIp, normalizeIp } from "./lib/network";

const PUBLIC_PATHS = ["/login", "/network-blocked"];
const STATIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$/;

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function getRequestIp(request: NextRequest) {
  return normalizeIp(request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || STATIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  if (process.env.LOCAL_NETWORK_ONLY === "true") {
    const ranges = process.env.ALLOWED_IP_RANGES ?? "192.168.0.0/16,10.0.0.0/8,172.16.0.0/12";

    if (!isAllowedLocalNetworkIp(getRequestIp(request), ranges)) {
      const blockedUrl = request.nextUrl.clone();
      blockedUrl.pathname = "/network-blocked";
      blockedUrl.search = "";
      return NextResponse.rewrite(blockedUrl);
    }
  }

  if (!isPublicPath(pathname) && !request.cookies.get("mpp_session")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
