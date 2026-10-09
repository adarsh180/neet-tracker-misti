"use client";

import { usePathname } from "next/navigation";

import { HubProvider } from "@/components/hub/hub-context";
import { HubShell } from "@/components/hub/hub-shell";
import { NeetOrbit } from "@/components/pulse/neet-orbit";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/hub/unlock") return <>{children}</>;
  return (
    <HubProvider base="/hub" site="neet" api="/api/hub" lockUrl="/api/gate/lock">
      <HubShell switcher={<NeetOrbit />}>{children}</HubShell>
    </HubProvider>
  );
}
