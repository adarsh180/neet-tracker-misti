import { NextRequest, NextResponse } from "next/server";

import { GATE_COOKIE, GATED, verifyGateToken } from "@/lib/exams/gate-token";

const PRIVATE_SESSION_COOKIE = "neet_private_session";

function hasPrivateSessionShellCookie(request: NextRequest) {
  const value = request.cookies.get(PRIVATE_SESSION_COOKIE)?.value;
  if (!value) return false;

  const parts = value.split(".");
  return (parts.length === 3 && parts[0] === "v2" && Boolean(parts[1] && parts[2]))
    || (parts.length === 2 && Boolean(parts[0] && parts[1]));
}

// Four separate dashboards (UG, PG, SS, Saath). Wellbeing pages are shared by all of them.
const SHARED = ["/exam", "/mood", "/calm", "/ai-insights/cycle-planner"];
const HOME: Record<string, string> = { ug: "/dashboard", pg: "/pg", ss: "/ss", hub: "/hub" };

function examFor(pathname: string) {
  for (const key of ["pg", "ss", "hub"]) if (pathname === `/${key}` || pathname.startsWith(`/${key}/`)) return key;
  return "ug";
}

function toPicker(request: NextRequest, want: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/exam";
  url.search = "";
  url.searchParams.set("want", want);
  return NextResponse.redirect(url);
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

  const wanted = examFor(pathname);
  // PG, SS and Saath need the dashboard-switch password: a signed 24-hour gate token.
  if (GATED.has(wanted) && !verifyGateToken(request.cookies.get(GATE_COOKIE)?.value)) return toPicker(request, wanted);

  const opened = request.cookies.get("neet-exam")?.value;
  if (!opened || !HOME[opened]) return toPicker(request, wanted);
  if (opened !== wanted) {
    // A page from another dashboard: go home in the open one, or to the picker to switch.
    if (wanted !== "ug") return toPicker(request, wanted);
    if (GATED.has(opened) && !verifyGateToken(request.cookies.get(GATE_COOKIE)?.value)) return toPicker(request, "ug");
    const url = request.nextUrl.clone();
    url.search = "";
    url.pathname = HOME[opened];
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
    "/hub/:path*",
    "/hub",
  ],
};
