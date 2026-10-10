"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearAuth, getStoredAuth, setAuth } from "@/lib/auth";
import QuickNav from "@/components/layout/quick-nav";
import { NotificationCenter } from "@/components/notifications/notification-center";
import RouteTransition from "@/components/layout/route-transition";
import GlobalSearch from "@/components/layout/global-search";
import SiteVoiceAssistant from "@/components/voice-assistant/site-voice-assistant";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { VitalRail } from "@/components/pulse/vital-rail";
import { NeetOrbit } from "@/components/pulse/neet-orbit";

const PREFETCH_ROUTES = [
  "/dashboard",
  "/todo",
  "/daily-goals",
  "/tests",
  "/tests/error-log",
  "/mood",
  "/visual-lab",
  "/pyq",
  "/pyq/questions",
  "/reader",
  "/ai-insights",
  "/ai-insights/neet-guru",
  "/ai-insights/rank-predictor",
  "/ai-insights/cycle-planner",
  "/subjects/botany",
  "/subjects/zoology",
  "/subjects/physics",
  "/subjects/chemistry",
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  // PG, SS and Saath bring their own chrome; the UG search, voice assistant and menu stay in UG.
  const inWorkspace = /^\/(pg|ss|hub)(\/|$)/.test(pathname);
  const inHub = /^\/hub(\/|$)/.test(pathname);

  useEffect(() => {
    let cancelled = false;

    async function verifyPrivateSession() {
      if (!getStoredAuth()) {
        router.replace("/signin");
        return;
      }

      const res = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;

      // Only a definite "no session" signs out. A network blip, an aborted
      // request or a server hiccup must not log her out and revoke this
      // device's session; every data API still checks the session itself.
      if (res?.status === 401) {
        clearAuth();
        router.replace("/signin");
        return;
      }

      setAuth();
      // Warm the UG pages only inside UG: from PG, SS or Saath the proxy answers them
      // with a redirect, and the router would keep that stale answer.
      if (!/^\/(pg|ss|hub)(\/|$)/.test(window.location.pathname)) {
        PREFETCH_ROUTES.forEach((route) => {
          router.prefetch(route);
        });
      }
      setReady(true);
    }

    verifyPrivateSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return <HeartLoader label="Checking your session" />;
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {inHub ? null : <VitalRail />}
      <RouteTransition className="protected-route-frame">{children}</RouteTransition>
      <NotificationCenter appLabel="NEET Desk" defaultSender="Misti" partnerLabel="Adarsh's UPSC desk" floating />
      {inWorkspace ? null : <GlobalSearch />}
      {inWorkspace ? null : <SiteVoiceAssistant />}
      {inWorkspace ? null : <QuickNav />}
      {inWorkspace ? null : <div className="do-fixed"><NeetOrbit /></div>}
    </div>
  );
}
