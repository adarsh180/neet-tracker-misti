"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { editEvent, editGoal, editTask, newEvent } from "./editors";
import { useHub } from "./hub-context";
import { EVENT_KINDS, labelOf, PEOPLE, PLAN_CATEGORIES, rupees, type Owner } from "../../lib/hub/metrics";

/**
 * Saath's calendar: every dated thing in one month view — events, exams,
 * goal deadlines, task due dates, fund target dates, marriage-plan items and
 * the wedding — with a day agenda and the next 60 days. Identical in both repos.
 */

type Kind = "event" | "exam" | "goal" | "task" | "fund" | "plan" | "wedding";
type Entry = { id: string; date: string; title: string; kind: Kind; owner: Owner; note?: string; open?: () => void; done?: boolean };

const KIND_LABEL: Record<Kind, string> = { event: "Event", exam: "Exam", goal: "Goal deadline", task: "Task due", fund: "Fund target", plan: "Plan item", wedding: "Wedding" };
// Fixed exam dates both of you are working towards.
export const BUILT_IN: Array<{ date: string; title: string; owner: Owner }> = [
  { date: "2027-05-02", title: "NEET UG 2027", owner: "misti" },
  { date: "2027-05-23", title: "UPSC CSE Prelims 2027", owner: "adarsh" },
];

const ist = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function HubCalendar() {
  const hub = useHub();
  const r = hub.records;
  const m = hub.m;
  const today = ist();
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [picked, setPicked] = useState(today);

  const entries = useMemo<Entry[]>(() => {
    if (!r || !m) return [];
    const inView = (o: Owner) => hub.view === "all" || o === hub.view || o === "joint";
    const list: Entry[] = [];
    for (const e of r.events) if (inView(e.owner)) list.push({ id: `e${e.id}`, date: e.eventDate, title: e.title, kind: e.kind === "exam" ? "exam" : "event", owner: e.owner, note: [e.kind === "exam" || e.kind === "other" ? null : labelOf(EVENT_KINDS, e.kind), e.budget ? rupees(e.budget) : null, e.note].filter(Boolean).join(" · "), open: e.owner === r.actor || e.owner === "joint" ? () => hub.openSheet(editEvent(e, hub.act)) : undefined });
    for (const g of m.goals) if (g.deadline && inView(g.owner)) list.push({ id: `g${g.id}`, date: g.deadline, title: g.title, kind: "goal", owner: g.owner, note: `${g.progress}% · ${g.health.replace("-", " ")}`, done: g.status === "done", open: g.owner === r.actor || g.owner === "joint" ? () => hub.openSheet(editGoal(g, r, m, hub.act)) : undefined });
    for (const t of r.tasks) if (t.due && inView(t.owner)) list.push({ id: `t${t.id}`, date: t.due, title: t.title, kind: "task", owner: t.owner, note: `Priority ${t.priority}`, done: t.status === "done", open: t.owner === r.actor || t.owner === "joint" ? () => hub.openSheet(editTask(t, m, hub.act)) : undefined });
    for (const f of m.funds) if (f.targetDate) list.push({ id: `f${f.id}`, date: f.targetDate, title: `${f.name} — ${rupees(f.target, { compact: true })}`, kind: "fund", owner: f.owner, note: `${Math.round(f.share * 100)}% saved` });
    for (const p of r.planItems) if (p.due && inView(p.owner)) list.push({ id: `p${p.id}`, date: p.due, title: p.title, kind: "plan", owner: p.owner, note: labelOf(PLAN_CATEGORIES, p.category), done: p.status === "done" });
    if (m.wedding.date) list.push({ id: "wedding", date: m.wedding.date, title: "Our wedding", kind: "wedding", owner: "joint" });
    for (const b of BUILT_IN) if (inView(b.owner) && !r.events.some((e) => e.eventDate === b.date && e.kind === "exam")) list.push({ id: `x${b.date}`, date: b.date, title: b.title, kind: "exam", owner: b.owner, note: "Built in" });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [r, m, hub]);

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [entries]);

  if (!r || !m) return null;

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => {
    const d = i - lead + 1;
    return d >= 1 && d <= days ? keyOf(cursor.y, cursor.m, d) : null;
  });
  const move = (delta: number) => setCursor((c) => {
    const t = new Date(Date.UTC(c.y, c.m + delta, 1));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
  });
  const dayList = byDay.get(picked) ?? [];
  const upcoming = entries.filter((e) => e.date >= today && !e.done).slice(0, 12);
  const daysTo = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);

  return (
    <section className="sth-cal">
      <div className="sth-card sth-cal-month">
        <header className="sth-cal-head">
          <h2>{first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
          <span className="sth-cal-nav">
            <button type="button" className="sth-btn is-sm is-icon" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <button type="button" className="sth-btn is-sm" onClick={() => { setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }); setPicked(today); }}>Today</button>
            <button type="button" className="sth-btn is-sm is-icon" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={16} /></button>
          </span>
        </header>
        <div className="sth-cal-grid" role="grid" aria-label="Month">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} className="dow" role="columnheader">{d}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={`x${i}`} className="pad" />;
            const list = byDay.get(d) ?? [];
            return (
              <button key={d} type="button" role="gridcell" className={`day ${d === today ? "is-today" : ""} ${d === picked ? "is-picked" : ""} ${d < today ? "is-past" : ""}`} onClick={() => setPicked(d)} style={{ "--i": i } as CSSProperties} aria-label={`${d}: ${list.length} item${list.length === 1 ? "" : "s"}`}>
                <b>{Number(d.slice(8))}</b>
                <span className="chips">
                  {list.slice(0, 3).map((e) => <i key={e.id} className={`k-${e.kind} o-${e.owner} ${e.done ? "is-done" : ""}`}><span>{e.title}</span></i>)}
                  {list.length > 3 ? <em>+{list.length - 3}</em> : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="sth-legend">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <span key={k}><i className={`cal-k k-${k}`} />{KIND_LABEL[k]}</span>)}
        </div>
      </div>

      <aside className="sth-cal-side">
        <div className="sth-card">
          <div className="sth-card-head">
            <h2>{new Date(`${picked}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</h2>
            <button type="button" className="sth-btn is-sm is-primary" onClick={() => hub.openSheet(newEvent(picked, r.actor, hub.act))}><Plus size={14} /> Add</button>
          </div>
          {dayList.length ? (
            <ul className="sth-agenda">
              {dayList.map((e) => (
                <li key={e.id} className={`k-${e.kind} ${e.done ? "is-done" : ""}`}>
                  <i className="cal-k" />
                  <span><b>{e.title}</b><small>{KIND_LABEL[e.kind]} · {PEOPLE[e.owner].name}{e.note ? ` · ${e.note}` : ""}</small></span>
                  {e.open ? <button type="button" className="sth-btn is-sm" onClick={e.open}>Edit</button> : null}
                </li>
              ))}
            </ul>
          ) : <p className="sth-sub">Nothing on this day.</p>}
        </div>
        <div className="sth-card">
          <h2>Next up</h2>
          <ul className="sth-agenda is-upcoming">
            {upcoming.length ? upcoming.map((e) => (
              <li key={e.id} className={`k-${e.kind}`}>
                <span className="when"><b>{daysTo(e.date) === 0 ? "Today" : daysTo(e.date) === 1 ? "Tomorrow" : `${daysTo(e.date)}d`}</b><small>{new Date(`${e.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></span>
                <span><b>{e.title}</b><small>{KIND_LABEL[e.kind]} · {PEOPLE[e.owner].name}</small></span>
              </li>
            )) : <li className="sth-sub">Nothing dated ahead.</li>}
          </ul>
        </div>
      </aside>
    </section>
  );
}
