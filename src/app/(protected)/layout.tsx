"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredAuth } from "@/lib/auth";
import QuickNav from "@/components/layout/quick-nav";
import RouteTransition from "@/components/layout/route-transition";

const PREFETCH_ROUTES = [
  "/dashboard",
  "/todo",
  "/daily-goals",
  "/tests",
  "/mood",
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
    if (!getStoredAuth()) {
      router.replace("/signin");
      return;
    }

    PREFETCH_ROUTES.forEach((route) => {
      router.prefetch(route);
    });
    setReady(true);
  }, [router]);

  if (!ready) {
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

          @keyframes protectedBoot {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <RouteTransition className="protected-route-frame">{children}</RouteTransition>
      <QuickNav />
    </div>
  );
}
