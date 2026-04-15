"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import SmoothLink from "@/components/layout/smooth-link";

const BREADCRUMBS: Record<string, { label: string; parent?: string; parentLabel?: string }> = {
  "/dashboard":                   { label: "Dashboard" },
  "/daily-goals":                 { label: "Daily Goals",        parent: "/dashboard", parentLabel: "Dashboard" },
  "/tests":                       { label: "Tests",              parent: "/dashboard", parentLabel: "Dashboard" },
  "/mood":                        { label: "Mood Tracker",       parent: "/dashboard", parentLabel: "Dashboard" },
  "/ai-insights":                 { label: "AI Insights",        parent: "/dashboard", parentLabel: "Dashboard" },
  "/ai-insights/neet-guru":       { label: "NEET-GURU",          parent: "/ai-insights", parentLabel: "AI Insights" },
  "/ai-insights/rank-predictor":  { label: "Rank Predictor",     parent: "/ai-insights", parentLabel: "AI Insights" },
  "/ai-insights/quiz":            { label: "Knowledge Verifier", parent: "/ai-insights", parentLabel: "AI Insights" },
  "/ai-insights/cycle-planner":   { label: "Cycle Planner",      parent: "/ai-insights", parentLabel: "AI Insights" },
};

export default function PageBreadcrumb() {
  const pathname = usePathname();

  // Match subjects
  const subjectMatch = pathname.match(/^\/subjects\/(\w+)/);
  if (subjectMatch) {
    const subject = subjectMatch[1];
    const label = subject.charAt(0).toUpperCase() + subject.slice(1);
    return (
      <div className="breadcrumb-bar">
        <SmoothLink href="/dashboard" className="breadcrumb-link" direction="back">
          <LayoutDashboard size={12} /> Dashboard
        </SmoothLink>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{label}</span>
      </div>
    );
  }

  const crumb = BREADCRUMBS[pathname];
  if (!crumb || pathname === "/dashboard") return null;

  return (
    <div className="breadcrumb-bar">
      <SmoothLink href="/dashboard" className="breadcrumb-link" direction="back">
        <LayoutDashboard size={12} /> Dashboard
      </SmoothLink>
      {crumb.parent && crumb.parent !== "/dashboard" && (
        <>
          <span className="breadcrumb-sep">/</span>
          <SmoothLink href={crumb.parent} className="breadcrumb-link" direction="back">{crumb.parentLabel}</SmoothLink>
        </>
      )}
      <span className="breadcrumb-sep">/</span>
      <span className="breadcrumb-current">{crumb.label}</span>
    </div>
  );
}
