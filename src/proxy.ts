import { NextRequest, NextResponse } from "next/server";

const PRIVATE_SESSION_COOKIE = "neet_private_session";

function hasPrivateSessionShellCookie(request: NextRequest) {
  const value = request.cookies.get(PRIVATE_SESSION_COOKIE)?.value;
  if (!value) return false;

  const parts = value.split(".");
  return (parts.length === 3 && parts[0] === "v2" && Boolean(parts[1] && parts[2]))
    || (parts.length === 2 && Boolean(parts[0] && parts[1]));
}

// Three separate exam workspaces. Wellbeing pages are shared by all of them.
const SHARED = ["/exam", "/mood", "/calm", "/ai-insights/cycle-planner"];
const HOME: Record<string, string> = { ug: "/dashboard", pg: "/pg", ss: "/ss" };

function examFor(pathname: string) {
  if (pathname === "/pg" || pathname.startsWith("/pg/")) return "pg";
  if (pathname === "/ss" || pathname.startsWith("/ss/")) return "ss";
  return "ug";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!hasPrivateSessionShellCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (SHARED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const opened = request.cookies.get("neet-exam")?.value;
  const wanted = examFor(pathname);
  if (!opened || !HOME[opened]) {
    const url = request.nextUrl.clone();
    url.pathname = "/exam";
    url.search = "";
    url.searchParams.set("want", wanted);
    return NextResponse.redirect(url);
  }
  if (opened !== wanted) {
    // A page from another exam: go home in the open exam, or to the picker to switch.
    const url = request.nextUrl.clone();
    url.search = "";
    if (wanted === "ug") url.pathname = HOME[opened];
    else {
      url.pathname = "/exam";
      url.searchParams.set("want", wanted);
    }
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
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
    "/reader/:path*",
    "/exam",
    "/pg/:path*",
    "/pg",
    "/ss/:path*",
    "/ss",
  ],
};
