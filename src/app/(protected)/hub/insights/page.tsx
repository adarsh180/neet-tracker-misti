"use client";

import { HubInsights } from "@/components/hub/pages";

export default function Page() {
  return <HubInsights analyzeApi="/api/hub/analyze" />;
}
