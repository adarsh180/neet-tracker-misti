"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, Atom, BookOpen, CalendarDays, ChartNoAxesCombined, CheckCheck, Dna, FlaskConical, Heart, Home, Layers, Leaf, ListTodo, LogOut, Mic, Search, Shapes, Target, X } from "lucide-react";
import { WORKSPACE_ROUTES } from "@/lib/workspace-routes";
import { SITE_ASSISTANT_OPEN_EVENT } from "@/lib/site-assistant";
import { clearAuth } from "@/lib/auth";
import styles from "./studio-nav.module.css";
const ICONS = { home:Home,log:Activity,todo:ListTodo,calendar:CalendarDays,physics:Atom,chemistry:FlaskConical,botany:Leaf,zoology:Dna,practice:Target,chart:ChartNoAxesCombined,review:CheckCheck,book:BookOpen,papers:Layers,search:Search,insights:Shapes,mentor:Mic,heart:Heart };
const PRIMARY = ["/dashboard", "/reader", "/practice", "/daily-goals", "/todo"];
const GROUPS = ["Workspace","Subjects","Practice","Library","Insights","Personal"];
export default function QuickNav() {
  const pathname = usePathname();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = opener.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previous; trigger?.focus(); };
  }, [open]);
  return <>
    <nav data-studio-chrome className={styles.dock} aria-label="Main navigation">
      {PRIMARY.map((href) => {
        const route = WORKSPACE_ROUTES.find((item) => item.href === href)!;
        const Icon = ICONS[route.icon];
        return <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={19} strokeWidth={1.65}/><span>{route.label === "NCERT library" ? "Read" : route.label === "Practice Arena" ? "Practice" : route.label}</span></Link>;
      })}
      <button ref={opener} onClick={() => setOpen(true)} aria-label="All pages" aria-haspopup="dialog"><Shapes size={19}/><span>Explore</span></button>
    </nav>
    <dialog ref={dialogRef} className={styles.menu} onCancel={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }} aria-labelledby="workspace-menu-title">
      <div className={styles.menuInner}>
        <header><div><small>YOUR WORKSPACE</small><h2 id="workspace-menu-title">Everything, in its place.</h2></div><button onClick={() => setOpen(false)} aria-label="Close navigation"><X size={22}/></button></header>
        <div className={styles.groups}>{GROUPS.map((group) => <section key={group}><h3>{group}</h3>{WORKSPACE_ROUTES.filter((route) => route.group === group).map((route) => { const Icon=ICONS[route.icon]; return <Link key={route.href} href={route.href} onClick={() => setOpen(false)} aria-current={pathname === route.href ? "page" : undefined}><Icon size={18}/><span>{route.label}</span><ArrowUpRight size={14}/></Link>; })}</section>)}</div>
        <footer><button onClick={() => {setOpen(false);window.dispatchEvent(new CustomEvent(SITE_ASSISTANT_OPEN_EVENT));}}><Mic size={17}/> Ask Bubu</button><button onClick={() => { clearAuth();setOpen(false);router.replace("/signin"); }}><LogOut size={17}/> Sign out</button></footer>
      </div>
    </dialog>
  </>;
}
