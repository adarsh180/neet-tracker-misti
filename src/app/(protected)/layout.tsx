"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuth, getStoredAuth, setAuth } from "@/lib/auth";
import QuickNav from "@/components/layout/quick-nav";
import { NotificationCenter } from "@/components/notifications/notification-center";
import RouteTransition from "@/components/layout/route-transition";
import GlobalSearch from "@/components/layout/global-search";
import SiteVoiceAssistant from "@/components/voice-assistant/site-voice-assistant";
import Link from "next/link";
import { Orbit } from "lucide-react";

const PREFETCH_ROUTES = [
  "/dashboard",
  "/todo",
  "/daily-goals",
  "/tests",
  "/tests/error-log",
  "/mood",
  "/practice",
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
  const [connectionError, setConnectionError] = useState(false);

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

        if (res.status === 401 || res.status === 403) {
          clearAuth();
          router.replace("/signin");
          return;
        }
        if (!res.ok) throw new Error("Session check unavailable");

        setAuth();
        PREFETCH_ROUTES.forEach((route) => {
          router.prefetch(route);
        });
        setReady(true);
      } catch {
        if (!cancelled) {
          setConnectionError(true);
        }
      }
    }

    verifyPrivateSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    if (connectionError) return <main className="studio-page"><div className="studio-error" role="alert"><p>We couldn’t reconnect. Your saved session and pending study logs are still on this device.</p><button className="studio-action" onClick={() => window.location.reload()}>Try again</button></div></main>;
    return (
      <div className="protected-boot">
        <div className="protected-boot-card">
          <div className="protected-boot-line protected-boot-line--title" />
          <div className="protected-boot-line" />
          <div className="protected-boot-line protected-boot-line--short" />
        </div>

        <style jsx>{`
          .protected-boot {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
          }

          .protected-boot-card {
            width: min(480px, 100%);
            padding: 28px;
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(16px);
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
          }

          .protected-boot-line {
            height: 12px;
            border-radius: 999px;
            background: linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.12), rgba(255,255,255,0.05));
            background-size: 200% 100%;
            animation: protectedBoot 1.2s ease-in-out infinite;
          }

          .protected-boot-line + .protected-boot-line {
            margin-top: 14px;
          }

          .protected-boot-line--title {
            width: 48%;
            height: 18px;
          }

          .protected-boot-line--short {
            width: 64%;
          }

          :global(html[data-theme="light"]) .protected-boot-card {
            background: rgba(255, 255, 255, 0.74);
            border-color: rgba(70, 45, 24, 0.10);
            box-shadow: 0 18px 52px rgba(70, 45, 24, 0.12);
          }

          :global(html[data-theme="light"]) .protected-boot-line {
            background: linear-gradient(90deg, rgba(70,45,24,0.05), rgba(70,45,24,0.12), rgba(70,45,24,0.05));
            background-size: 200% 100%;
          }

          @keyframes protectedBoot {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="studio-shell">
      <a className="studio-skip" href="#studio-content">Skip to content</a>
      <header className="studio-header"><Link className="studio-brand" href="/dashboard" aria-label="NEET Doctor home"><Orbit size={30} strokeWidth={1.3} /><span>NEET Doctor<small>MISTI’S STUDY STUDIO</small></span></Link></header>
      <div id="studio-content" tabIndex={-1}><RouteTransition className="protected-route-frame">{children}</RouteTransition></div>
      <NotificationCenter appLabel="NEET Desk" defaultSender="Misti" partnerLabel="Adarsh's UPSC phone" />
      <GlobalSearch />
      <SiteVoiceAssistant />
      <QuickNav />
    </div>
  );
}
