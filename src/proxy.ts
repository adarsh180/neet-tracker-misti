import { NextRequest, NextResponse } from "next/server";

const PRIVATE_SESSION_COOKIE = "neet_private_session";

function hasPrivateSessionShellCookie(request: NextRequest) {
  const value = request.cookies.get(PRIVATE_SESSION_COOKIE)?.value;
  if (!value) return false;

  const parts = value.split(".");
  return (parts.length === 3 && parts[0] === "v2" && Boolean(parts[1] && parts[2]))
    || (parts.length === 2 && Boolean(parts[0] && parts[1]));
}

export function proxy(request: NextRequest) {
  if (hasPrivateSessionShellCookie(request)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/ai-insights/:path*",
    "/calm/:path*",
    "/daily-goals/:path*",
    "/dashboard/:path*",
    "/mood/:path*",
    "/planner/:path*",
    "/practice/:path*",
    "/pyq/:path*",
    "/reviews/:path*",
    "/subjects/:path*",
    "/tests/:path*",
    "/todo/:path*",
    "/visual-lab/:path*",
  ],
};
