import { forwardHub, guardHub } from "@/lib/hub/forward";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  return (await guardHub()) ?? forwardHub("/api/hub/analyze", { method: "GET" });
}

/** Runs only when asked; the AI call itself happens on the UPSC site. */
export async function POST() {
  return (await guardHub()) ?? forwardHub("/api/hub/analyze", { method: "POST", body: "{}", timeoutMs: 110000 });
}
