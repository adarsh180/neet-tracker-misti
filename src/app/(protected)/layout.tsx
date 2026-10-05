"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuth, getStoredAuth, setAuth } from "@/lib/auth";
import QuickNav from "@/components/layout/quick-nav";
import { NotificationCenter } from "@/components/notifications/notification-center";
import RouteTransition from "@/components/layout/route-transition";
import GlobalSearch from "@/components/layout/global-search";
import SiteVoiceAssistant from "@/components/voice-assistant/site-voice-assistant";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { VitalRail } from "@/components/pulse/vital-rail";

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifyPrivateSession() {
      if (!getStoredAuth()) {
        router.replace("/signin");
        return;
      }

      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (cancelled) return;

        if (!res.ok) {
          clearAuth();
          router.replace("/signin");
          return;
        }

        setAuth();
        PREFETCH_ROUTES.forEach((route) => {
          router.prefetch(route);
        });
        setReady(true);
      } catch {
        if (!cancelled) {
          clearAuth();
          router.replace("/signin");
        }
      }
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
      <VitalRail />
      <RouteTransition className="protected-route-frame">{children}</RouteTransition>
      <NotificationCenter appLabel="NEET Desk" defaultSender="Misti" partnerLabel="Adarsh's UPSC phone" />
      <GlobalSearch />
      <SiteVoiceAssistant />
      <QuickNav />
    </div>
  );
}
