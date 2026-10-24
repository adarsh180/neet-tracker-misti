"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CalendarPlus, Check, Wand2 } from "lucide-react";

import { BUILT_IN } from "./calendar";
import { useHub } from "./hub-context";
import { CardHead } from "./pages";
import { findRecurring, fundOdds, optimiseBudgets, planDates, studyPatterns } from "../../lib/hub/smart";
import { PEOPLE, rupees, type Person } from "../../lib/hub/metrics";

/**
 * Saath's smart cards (see lib/hub/smart.ts for the models): repeating bills,
 * a budget suggestion, the odds for each fund, study-vs-life patterns and good
 * days to meet. Each card stays out of the way until there is data behind it.
 * Identical in both repos.
 */

const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const nice = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const monthYear = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

function usePerson(): { person: Person; own: boolean } {
  const hub = useHub();
  const me = hub.records?.actor ?? "adarsh";
  const person = hub.view === "all" ? me : hub.view;
  return { person, own: person === me };
}

/* ── 1. Repeating bills and income ─────────────────────────────────── */
export function UpcomingBills() {
  const hub = useHub();
  const r = hub.records;
  const { person, own } = usePerson();
  const today = istToday();
  const list = useMemo(() => (r ? findRecurring(r, person, today).filter((x) => x.dueIn <= 35) : []), [r, person, today]);
  const [paid, setPaid] = useState<string | null>(null);
  if (!r || !list.length) return null;
  const dueOut = list.filter((x) => x.kind === "expense").reduce((s, x) => s + x.amount, 0);
  return (
    <div className="sth-card">
      <CardHead title="Coming up" />
      <p className="sth-sub">Repeats Saath found in {own ? "your" : `${PEOPLE[person].name}'s`} entries · {rupees(dueOut)} going out in the next five weeks.</p>
      <ul className="sth-bills">
        {list.map((x, i) => (
          <li key={x.key} className={`${x.kind === "income" ? "is-in" : ""} ${x.dueIn < 0 ? "is-late" : x.dueIn <= 2 ? "is-soon" : ""}`} style={{ "--i": i } as CSSProperties}>
            <span>
              <b>{x.label}</b>
              <small>
                {x.rhythm === "monthly" ? `monthly on the ${ordinal(Number(x.next.slice(8, 10)))}` : x.rhythm === "weekly" ? "weekly" : `every ${x.every} days`}
                {x.marked && x.count < 3 ? " · you marked it monthly" : ` · seen ${x.count}×`}
              </small>
            </span>
            <span className="sth-bills-when">{x.dueIn < 0 ? `${-x.dueIn}d late` : x.dueIn === 0 ? "today" : x.dueIn === 1 ? "tomorrow" : `in ${x.dueIn}d`}<small>{nice(x.next)}</small></span>
            <b className={`num ${x.kind === "income" ? "t-good" : ""}`}>{x.kind === "income" ? "+" : ""}{rupees(x.amount)}</b>
            {own ? (
              <button
                type="button"
                className="sth-btn is-sm"
                disabled={paid === x.key}
                onClick={async () => {
                  setPaid(x.key);
                  const err = await hub.act({ action: "txn.add", kind: x.kind, amount: x.amount, category: x.category, method: x.method ?? "upi", tag: x.tag ?? undefined, note: x.note ?? x.label, recurring: x.marked, txnDate: today });
                  if (err) alert(err);
                  setPaid(null);
                }}
              >
                <Check size={13} /> {x.kind === "income" ? "Received" : "Paid"}
              </button>
            ) : <span />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── 6. Budget optimiser ──────────────────────────────────────────── */
export function BudgetSuggestion() {
  const hub = useHub();
  const r = hub.records;
  const { person, own } = usePerson();
  const today = istToday();
  const res = useMemo(() => (r ? optimiseBudgets(r, person, today) : null), [r, person, today]);
  const [busy, setBusy] = useState(false);
  if (!r || !res) return null;
  return (
    <div className="sth-card">
      <CardHead title="Budget suggestion" />
      <p className="sth-sub">
        {res.need > 0
          ? <>To keep {rupees(res.save)} of {rupees(res.income)}, trim about <b>{rupees(res.need)}</b> a month — mostly from what bends easily, based on {res.basis}.</>
          : <>At {res.basis}, you can keep about <b>{rupees(res.room)}</b> more than your {rupees(res.save)} target. These limits hold that.</>}
        {res.shortfall ? <> Even the deepest sensible cuts leave {rupees(res.shortfall)} short — lower the savings target or plan more income.</> : null}
      </p>
      <table className="sth-table sth-optim">
        <thead><tr><th>Category</th><th className="num">Usually</th><th className="num">Suggested</th><th className="num">Change</th></tr></thead>
        <tbody>
          {res.suggestions.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td className="num">{rupees(s.typical)}</td>
              <td className="num"><b>{rupees(s.suggested)}</b></td>
              <td className={`num ${s.suggested < s.typical ? "t-warn" : ""}`}>{s.suggested === s.typical ? "—" : `${s.suggested < s.typical ? "−" : "+"}${rupees(Math.abs(s.typical - s.suggested))}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {own ? (
        <button
          type="button"
          className="sth-btn is-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const err = await hub.act({ action: "budget.many", items: res.suggestions.map((s) => ({ category: s.key, monthly: s.suggested })) });
            setBusy(false);
            if (err) alert(err);
          }}
        >
          <Wand2 size={13} /> {busy ? "Saving…" : "Use these as my budgets"}
        </button>
      ) : null}
    </div>
  );
}

/* ── 3. Goal odds ─────────────────────────────────────────────────── */
export function FundOdds() {
  const hub = useHub();
  const r = hub.records;
  const m = hub.m;
  const today = istToday();
  const rows = useMemo(() => {
    if (!r || !m) return [];
    return m.funds.map((f) => ({ f, o: fundOdds(f, f.balance, r.fundEntries.filter((e) => e.fundId === f.id), today) }));
  }, [r, m, today]);
  if (!rows.length) return null;
  return (
    <section className="sth-sect sth-card">
      <CardHead title="Odds of reaching each fund" />
      <p className="sth-sub">2,000 possible futures, each built from your own months of saving — good months, thin months and the ones you skipped.</p>
      <ul className="sth-odds">
        {rows.map(({ f, o }, i) => (
          <li key={f.id} style={{ "--p": o.p ?? 0, "--i": i } as CSSProperties} className={o.p === null ? "is-muted" : o.p >= 0.8 ? "is-good" : o.p >= 0.5 ? "is-warn" : "is-bad"}>
            <span><b>{f.name}</b><small>{rupees(f.balance)} of {rupees(f.target)}{f.targetDate ? ` · by ${monthYear(f.targetDate)}` : ""}</small></span>
            <i className="sth-odds-bar"><i /></i>
            <span className="sth-odds-read">
              {o.status === "done" ? <b>Reached</b>
                : o.status === "undated" ? <small>Give it a date to see the odds</small>
                : o.status === "learning" ? <small>Needs {o.needMonths || 1} more month{(o.needMonths || 1) === 1 ? "" : "s"} of saving to estimate</small>
                : <>
                    <b>{Math.round((o.p ?? 0) * 100)}% chance</b>
                    <small>{o.finish ? `likely done by ${monthYear(o.finish)}` : "not on this path"}{o.extraFor80 ? ` · +${rupees(o.extraFor80)}/month makes it 80%` : ""}</small>
                  </>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── 4. Study vs life (Adarsh's own data) ─────────────────────────── */
export function LifePatterns() {
  const hub = useHub();
  const r = hub.records;
  const sp = useMemo(() => (r?.life && r.actor === "adarsh" ? studyPatterns(r, r.life, "adarsh") : null), [r]);
  if (!r || !sp || hub.view === "misti") return null;
  const max = Math.max(1, ...sp.weekdayHours.filter((x): x is number => x !== null));
  const lines = [...sp.patterns.map((p) => ({ key: p.key, text: p.text, tag: p.strength === "clear" ? "clear" : "likely" })), ...(sp.profile ? [{ key: "profile", text: sp.profile, tag: "weekly" }] : []), ...(sp.spendLink ? [{ key: "spend", text: sp.spendLink, tag: "money" }] : [])];
  return (
    <section className="sth-sect sth-card">
      <CardHead title="Study and the rest of life" />
      <p className="sth-sub">From {sp.studyDays} days of your study log and {sp.trackedDays} days that also have money logged · only you see this.</p>
      <div className="sth-life">
        <ul className="sth-life-list">
          {lines.length ? lines.map((l) => <li key={l.key}><span className={`sth-pill is-${l.tag}`}>{l.tag}</span>{l.text}</li>) : <li>No pattern is strong enough yet to call it one.</li>}
          {sp.need ? <li className="is-muted">About {sp.need} more days of logging both study and spending unlock the date, eating-out and no-spend comparisons.</li> : null}
        </ul>
        <div className="sth-life-week" aria-label="Average study hours by weekday">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => {
            const h = sp.weekdayHours[i];
            return (
              <span key={i} style={{ "--v": h === null ? 0 : h / max } as CSSProperties} title={h === null ? "not enough days" : `${h.toFixed(1)} h`}>
                <i />
                <small>{d}</small>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 5. Good days to meet ─────────────────────────────────────────── */
export function DatePlanner() {
  const hub = useHub();
  const r = hub.records;
  const m = hub.m;
  const today = istToday();
  const plan = useMemo(() => {
    if (!r || !m) return null;
    const sp = r.life ? studyPatterns(r, r.life, "adarsh") : null;
    const fun = m.money.budgetRows.find((b) => b.key === "fun");
    const funLeft = fun ? fun.limit - fun.spent : null;
    return planDates(r, { today, builtIn: BUILT_IN, weekdayHours: sp?.weekdayHours, funLeft });
  }, [r, m, today]);
  const [added, setAdded] = useState<string[]>([]);
  if (!plan || !plan.ideas.length) return null;
  return (
    <section className="sth-sect sth-card">
      <CardHead title="Good days to meet" />
      <p className="sth-sub">
        Weighs both calendars, the lighter study days, the days you usually meet and the outings budget{plan.examSoon ? ` · ${plan.examSoon.title} in ${plan.examSoon.days} days` : ""}.
      </p>
      <ul className="sth-dates">
        {plan.ideas.map((d, i) => (
          <li key={d.date} style={{ "--i": i } as CSSProperties}>
            <span className="sth-dates-day"><b>{nice(d.date)}</b></span>
            <span className="sth-dates-why">
              {d.reasons.length ? d.reasons.join(" · ") : "a clear day for both of you"}
              {d.warn ? <small className="t-warn">{d.warn}</small> : null}
            </span>
            <button
              type="button"
              className="sth-btn is-sm"
              disabled={added.includes(d.date)}
              onClick={async () => {
                const err = await hub.act({ action: "event.add", title: "Together", kind: "date", owner: "joint", eventDate: d.date, budget: plan.cost });
                if (err) alert(err);
                else setAdded((a) => [...a, d.date]);
              }}
            >
              {added.includes(d.date) ? <><Check size={13} /> Added</> : <><CalendarPlus size={13} /> Add</>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
