"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BarChart2, BookOpenCheck, GitBranch, HeartPulse, LayoutDashboard, NotebookPen, Stethoscope } from "lucide-react";

import type { ExamKey } from "@/lib/exams/syllabus";

const TABS = (base: ExamKey) => [
  { href: `/${base}`, label: "Dashboard", icon: LayoutDashboard },
  { href: `/${base}/syllabus`, label: "Syllabus", icon: BookOpenCheck },
  { href: `/${base}/tests`, label: "Tests", icon: BarChart2 },
  { href: `/${base}/log`, label: "Log & errors", icon: NotebookPen },
  { href: `/${base}/what-if`, label: "What-if", icon: GitBranch },
];

/** The arena frame: own identity per exam, own navigation, a one-tap exam switch. */
export function WorkspaceShell({ exam, children }: { exam: ExamKey; children: React.ReactNode }) {
  const pathname = usePathname();
  const tabs = TABS(exam);
  const active = (href: string) => (href === `/${exam}` ? pathname === href : pathname.startsWith(href));
  return (
    <div className="xw" data-exam={exam}>
      <div className="xw-page" style={{ paddingBottom: 0 }}>
        <div className="xw-top">
          <span className="xw-badge">
            <i>{exam === "pg" ? <Stethoscope size={14} /> : <HeartPulse size={14} />}</i>
            {exam === "pg" ? "NEET PG · Ward" : "NEET SS · Theatre"}
          </span>
          <nav className="xw-tabs" aria-label={`${exam.toUpperCase()} workspace`}>
            {tabs.map((t) => (
              <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}>
                <t.icon size={15} /> {t.label}
              </Link>
            ))}
          </nav>
          <Link href="/exam" className="xw-btn is-sm xw-switch" aria-label="Switch exam">
            <ArrowLeftRight size={14} /> Switch exam
          </Link>
        </div>
      </div>
      {children}
      <nav className="xw-dock" aria-label="Workspace">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}>
            <t.icon size={18} />
            {t.label.split(" ")[0]}
          </Link>
        ))}
        <Link href="/mood"><HeartPulse size={18} />Mood</Link>
      </nav>
    </div>
  );
}
