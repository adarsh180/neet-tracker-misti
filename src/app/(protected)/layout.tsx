"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredAuth } from "@/lib/auth";
import QuickNav from "@/components/layout/quick-nav";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!getStoredAuth()) router.replace("/signin");
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {children}
      <QuickNav />
    </div>
  );
}
