"use client";

import { usePathname, useRouter } from "next/navigation";

import { DashOrbit } from "@/components/dash-orbit";

/**
 * NEET site's dashboard switch: UG, PG, SS and Saath. PG, SS and Saath need
 * the dashboard-switch password — without an open gate the picker asks for it.
 */
export function NeetOrbit() {
  const pathname = usePathname();
  const router = useRouter();
  const at = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  const open = async (exam: string) => {
    const res = await fetch("/api/exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exam }) }).catch(() => null);
    if (!res) return;
    if (res.status === 401) return router.replace("/signin");
    if (res.status === 403 || res.status === 429) return router.push(`/exam?want=${exam}`);
    const data = await res.json().catch(() => ({}));
    if (data.home) router.push(data.home);
  };
  const ug = !at("/pg") && !at("/ss") && !at("/hub");
  return (
    <DashOrbit
      items={[
        { key: "ug", label: "NEET UG", sub: "MBBS", logo: "/brand/neet-doctor-logo-mark.png", current: ug, onPick: () => open("ug") },
        { key: "pg", label: "NEET PG", logo: "/brand/neet-pg-160.webp", current: at("/pg"), locked: true, onPick: () => open("pg") },
        { key: "ss", label: "NEET SS", logo: "/brand/neet-ss-160.webp", current: at("/ss"), locked: true, onPick: () => open("ss") },
        { key: "hub", label: "Saath", logo: "/brand/saath-160.webp", current: at("/hub"), locked: true, onPick: () => open("hub") },
      ]}
    />
  );
}
