"use client";

import { WorkspaceShell } from "@/components/exams/shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell exam="pg">{children}</WorkspaceShell>;
}
