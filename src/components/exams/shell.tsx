"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftRight, BarChart2, BookOpenCheck, Check, ChevronDown, GitBranch, HeartPulse, Layers, LayoutDashboard, NotebookPen, Stethoscope } from "lucide-react";

import { WorkspaceProvider, useWorkspace } from "@/components/exams/workspace-context";
import { NeetOrbit } from "@/components/pulse/neet-orbit";
import type { ExamKey } from "@/lib/exams/syllabus";

const TABS = (base: ExamKey) => [
  { href: `/${base}`, label: "Dashboard", icon: LayoutDashboard },
  { href: `/${base}/syllabus`, label: "Syllabus", icon: BookOpenCheck },
  { href: `/${base}/tests`, label: "Tests", icon: BarChart2 },
  { href: `/${base}/log`, label: "Log & errors", icon: NotebookPen },
  { href: `/${base}/what-if`, label: "What-if", icon: GitBranch },
];

/** The arena frame: own identity per exam, own navigation, the subject menu, a one-tap exam switch. */
export function WorkspaceShell({ exam, children }: { exam: ExamKey; children: React.ReactNode }) {
  return (
    <WorkspaceProvider exam={exam}>
      <Frame exam={exam}>{children}</Frame>
    </WorkspaceProvider>
  );
}

function Frame({ exam, children }: { exam: ExamKey; children: React.ReactNode }) {
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
          <div className="xw-top-end">
            <SubjectMenu />
            <NeetOrbit />
            <Link href="/exam" className="xw-btn is-sm" aria-label="Switch exam">
              <ArrowLeftRight size={14} /> Switch exam
            </Link>
          </div>
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

/** One subject at a time: this menu sets it for every tab, and it is remembered. */
function SubjectMenu() {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const progress = new Map((ws.state?.records.progress ?? []).map((r) => [r.itemKey, r.status]));
  const pct = (key: string) => {
    const s = ws.tree.subjects.find((x) => x.key === key);
    if (!s) return 0;
    let marks = 0;
    let done = 0;
    for (const c of s.chapters)
      for (const i of c.items) {
        marks += i.marks;
        if (progress.get(i.key) === "done") done += i.marks;
      }
    return marks ? Math.round((done / marks) * 100) : 0;
  };
  const pick = (key: string | null) => {
    ws.setFocus(key);
    setOpen(false);
  };
  const groups = [...new Set(ws.tree.subjects.map((s) => s.group))];

  return (
    <div className="xw-menu" ref={box}>
      <button type="button" className="xw-menu-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={!ws.state} style={{ "--h": ws.subject?.hue ?? 0 } as CSSProperties}>
        {ws.subject ? <i className="dot" /> : <Layers size={15} />}
        <span><small>Subject</small>{ws.subject?.name ?? "Whole exam"}</span>
        <ChevronDown size={15} className="chev" />
      </button>
      {open ? (
        <div className="xw-menu-pop" role="listbox" aria-label="Subject in focus">
          <button type="button" role="option" aria-selected={!ws.focus} onClick={() => pick(null)}>
            <Layers size={15} />
            <span><b>Whole exam</b><small>all {ws.tree.subjects.length} subjects together</small></span>
            {!ws.focus ? <Check size={15} /> : null}
          </button>
          {groups.map((g) => (
            <div key={g} className="xw-menu-group">
              <p>{g}</p>
              {ws.tree.subjects.filter((s) => s.group === g).map((s) => {
                const p = pct(s.key);
                return (
                  <button key={s.key} type="button" role="option" aria-selected={ws.focus === s.key} onClick={() => pick(s.key)} style={{ "--h": s.hue, "--p": p / 100 } as CSSProperties}>
                    <i className="dot" />
                    <span><b>{s.name}</b><small>~{Math.round(s.marks)} marks · {p}% done</small></span>
                    {ws.focus === s.key ? <Check size={15} /> : <em className="meter"><i /></em>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
