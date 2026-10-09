"use client";

import { useState, type CSSProperties } from "react";

import { PEOPLE, rupees, type HubMetrics } from "../../lib/hub/metrics";

const tone = (s: number) => (s >= 0.7 ? "good" : s >= 0.4 ? "warn" : "bad");
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

/**
 * Together index as a skyline: one glass column per part, its width the
 * part's weight and its fill the score against the benchmark. Hover or focus a
 * column to read that part; the headline is the whole index.
 */
export function IndexOrbit({ m }: { m: HubMetrics }) {
  const [hot, setHot] = useState<string | null>(null);
  const total = m.parts.reduce((s, p) => s + p.weight, 0) || 1;
  const h = m.parts.find((p) => p.key === hot) ?? null;
  const short = (key: string, label: string) => ({ savings: "Savings", emergency: "Cover", budget: "Budgets", goals: "Goals", tasks: "Tasks", funds: "Funds" } as Record<string, string>)[key] ?? label.split(" ")[0];
  return (
    <div className="sth-tower" onMouseLeave={() => setHot(null)}>
      <div className="sth-tower-read" aria-live="polite">
        {h ? (
          <>
            <strong>{Math.round(h.score * h.weight)}<small>/{h.weight}</small></strong>
            <span>{h.label}</span>
            <em>{h.value}</em>
          </>
        ) : (
          <>
            <strong>{m.index}<small>/100</small></strong>
            <span>Together index</span>
            <em>{m.band}</em>
          </>
        )}
      </div>
      <div className="sth-tower-cols" role="list" aria-label="Together index by part">
        {m.parts.map((p, i) => (
          <button
            key={p.key}
            type="button"
            role="listitem"
            className={`col tone-${tone(p.score)} ${hot === p.key ? "is-hot" : hot ? "is-dim" : ""}`}
            style={{ "--w": p.weight / total, "--f": Math.max(0.02, p.score), "--i": i } as CSSProperties}
            onMouseEnter={() => setHot(p.key)}
            onFocus={() => setHot(p.key)}
            onBlur={() => setHot(null)}
            aria-label={`${p.label}: ${Math.round(p.score * p.weight)} of ${p.weight}`}
          >
            <span className="glass"><i className="fill" /><i className="cap" /></span>
            <b>{Math.round(p.score * p.weight)}<small>/{p.weight}</small></b>
            <small>{short(p.key, p.label)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Six months: income and spending side by side, each split by person. */
export function MoneyBars({ m }: { m: HubMetrics }) {
  const [hot, setHot] = useState<number | null>(null);
  const series = m.money.series;
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));
  const h = hot === null ? series.at(-1)! : series[hot];
  return (
    <div className="sth-money">
      <div className="sth-money-read">
        <b>{monthName(h.month)}</b>
        <span><i className="k-in" /> in {rupees(h.income)}</span>
        <span><i className="k-out" /> out {rupees(h.expense)}</span>
        <span className={h.income - h.expense >= 0 ? "t-good" : "t-bad"}>{h.income - h.expense >= 0 ? "saved" : "over by"} {rupees(Math.abs(h.income - h.expense))}</span>
      </div>
      <div className="sth-money-bars" onMouseLeave={() => setHot(null)}>
        {series.map((s, i) => (
          <button key={s.month} type="button" className={`mb ${hot === i ? "is-hot" : ""}`} onMouseEnter={() => setHot(i)} onFocus={() => setHot(i)} style={{ "--i": i } as CSSProperties} aria-label={`${monthName(s.month)}: income ${rupees(s.income)}, spent ${rupees(s.expense)}`}>
            <span className="col in">
              <i className="a" style={{ height: `${(s.adarsh.income / max) * 100}%` }} />
              <i className="m" style={{ height: `${(s.misti.income / max) * 100}%` }} />
            </span>
            <span className="col out">
              <i className="a" style={{ height: `${(s.adarsh.expense / max) * 100}%` }} />
              <i className="m" style={{ height: `${(s.misti.expense / max) * 100}%` }} />
            </span>
            <small>{monthName(s.month)}</small>
          </button>
        ))}
      </div>
      <div className="sth-legend">
        <span><i className="k-a" />{PEOPLE.adarsh.name}</span>
        <span><i className="k-m" />{PEOPLE.misti.name}</span>
        <span>left bar income · right bar spending</span>
      </div>
    </div>
  );
}

const CAT_HUES = [205, 340, 42, 160, 265, 15, 190, 300, 95, 230, 55, 320, 130, 0];

export function CategoryDonut({ m }: { m: HubMetrics }) {
  const [hot, setHot] = useState<string | null>(null);
  const cats = m.money.byCategory;
  const total = cats.reduce((s, c) => s + c.amount, 0);
  if (!total) return <div className="sth-empty"><b>No spending logged this month</b>Log expenses on the Money page and they group here by category.</div>;
  let cursor = 0;
  const h = cats.find((c) => c.key === hot) ?? null;
  return (
    <div className="sth-donut" onMouseLeave={() => setHot(null)}>
      <div className="sth-donut-plate">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <g transform="rotate(-90 60 60)">
            {cats.map((c, i) => {
              const len = (c.amount / total) * 100;
              const start = cursor;
              cursor += len;
              return <circle key={c.key} className={hot && hot !== c.key ? "is-dim" : ""} onMouseEnter={() => setHot(c.key)} cx="60" cy="60" r="46" pathLength={100} stroke={`hsl(${CAT_HUES[i % CAT_HUES.length]} 70% 60%)`} strokeDasharray={`${Math.max(0.2, len - 0.6)} 100`} strokeDashoffset={-start} style={{ "--i": i } as CSSProperties} />;
            })}
          </g>
        </svg>
        <div className="sth-donut-read">
          <strong>{rupees(h?.amount ?? total, { compact: true })}</strong>
          <span>{h ? h.label : "this month"}</span>
        </div>
      </div>
      <ul className="sth-cats">
        {cats.slice(0, 7).map((c, i) => (
          <li key={c.key} onMouseEnter={() => setHot(c.key)} style={{ "--c": `hsl(${CAT_HUES[i % CAT_HUES.length]} 70% 60%)` } as CSSProperties}>
            <i />
            <span>{c.label}</span>
            <b>{rupees(c.amount)}</b>
            <em>{Math.round((c.amount / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BudgetBars({ m }: { m: HubMetrics }) {
  if (!m.money.budgetRows.length) return <div className="sth-empty"><b>No budgets yet</b>Set monthly limits per category on the Money page.</div>;
  const pace = m.money.dayOfMonth / m.money.daysInMonth;
  return (
    <ul className="sth-budgets" style={{ "--pace": pace } as CSSProperties}>
      {m.money.budgetRows.map((b, i) => {
        const used = b.spent / b.limit;
        return (
          <li key={b.key} className={b.projected > b.limit ? "is-over" : used > pace ? "is-warn" : ""} style={{ "--u": Math.min(1, used), "--i": i } as CSSProperties}>
            <span><b>{b.label}</b><small>{rupees(b.spent)} of {rupees(b.limit)} · heading to {rupees(b.projected)}</small></span>
            <span className="bar"><i /><u /></span>
          </li>
        );
      })}
      <li className="sth-legend"><span><i className="k-pace" />where you should be today ({Math.round(pace * 100)}% of the month)</span></li>
    </ul>
  );
}

/** Each fund as a ring: filled share, with each person's contribution on the inner track. */
export function FundRings({ m, compact = false, onAdd, onEdit }: { m: HubMetrics; compact?: boolean; onAdd?: (f: HubMetrics["funds"][number]) => void; onEdit?: (f: HubMetrics["funds"][number]) => void }) {
  if (!m.funds.length) return <div className="sth-empty"><b>No funds yet</b>Create an emergency fund first, then marriage and other goals, on the Funds page.</div>;
  const etaText = (f: HubMetrics["funds"][number]) => {
    if (f.share >= 1) return "Target reached";
    if (!f.etaDate) return "Add money to see when it fills";
    const d = new Date(`${f.etaDate}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    return f.slackDays === null ? `Full by ${d} at this rate` : f.slackDays >= 0 ? `Full by ${d} · ${f.slackDays}d early` : `Full by ${d} · ${-f.slackDays}d late`;
  };
  return (
    <div className={`sth-funds ${compact ? "is-compact" : ""}`}>
      {m.funds.map((f, i) => {
        const a = f.target ? f.byPerson.adarsh / f.target : 0;
        const mm = f.target ? f.byPerson.misti / f.target : 0;
        const mine = !onAdd ? false : f.owner === "joint" || f.owner === m.viewer;
        return (
          <div key={f.id} className={`sth-fund k-${f.kind} sth-lit`} style={{ "--i": i } as CSSProperties}>
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle className="trk" cx="50" cy="50" r="42" />
              <circle className="fil" cx="50" cy="50" r="42" pathLength={100} strokeDasharray={`${Math.min(100, f.share * 100)} 100`} transform="rotate(-90 50 50)" />
              <circle className="trk2" cx="50" cy="50" r="33" />
              <circle className="pa" cx="50" cy="50" r="33" pathLength={100} strokeDasharray={`${Math.min(100, a * 100)} 100`} transform="rotate(-90 50 50)" />
              <circle className="pm" cx="50" cy="50" r="33" pathLength={100} strokeDasharray={`${Math.min(100, mm * 100)} 100`} strokeDashoffset={-Math.min(100, a * 100)} transform="rotate(-90 50 50)" />
            </svg>
            <div className="sth-fund-read"><strong>{Math.round(f.share * 100)}%</strong></div>
            <b>{f.name}</b>
            <small>{rupees(f.balance, { compact: true })} of {rupees(f.target, { compact: true })}</small>
            {f.needPerMonth !== null ? <em className={f.onTrack ? "t-good" : "t-warn"}>{rupees(f.needPerMonth, { compact: true })}/mo needed · pace {rupees(f.monthlyPace, { compact: true })}</em> : <em>{PEOPLE[f.owner].name}</em>}
            {!compact ? <em className="sth-eta">{etaText(f)}</em> : null}
            {mine ? (
              <span className="sth-fund-acts">
                <button type="button" className="sth-btn is-sm is-primary" onClick={() => onAdd?.(f)}>+ Add</button>
                {onEdit ? <button type="button" className="sth-btn is-sm" onClick={() => onEdit(f)}>Edit</button> : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Twelve months of spending as an area, with its least-squares trend line. */
export function TrendLine({ m }: { m: HubMetrics }) {
  const s = m.money.series12;
  const W = 600;
  const H = 180;
  const max = Math.max(1, ...s.flatMap((x) => [x.expense, x.income]));
  const x = (i: number) => 30 + (i / 11) * (W - 40);
  const y = (v: number) => H - 22 - (v / max) * (H - 40);
  const path = (k: "expense" | "income") => s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const fitted = s.slice(0, 11).map((p, i) => ({ i, v: p.expense })).filter((p) => p.v > 0);
  const mean = fitted.length ? fitted.reduce((a, p) => a + p.v, 0) / fitted.length : 0;
  const mi = fitted.length ? fitted.reduce((a, p) => a + p.i, 0) / fitted.length : 0;
  const b = m.money.spendTrend ?? 0;
  const line = fitted.length >= 2 ? `M${x(0)},${y(Math.max(0, mean + b * (0 - mi)))} L${x(11)},${y(Math.max(0, mean + b * (11 - mi)))}` : null;
  return (
    <div className="sth-trend">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Twelve months of income and spending">
        {[0.5, 1].map((f) => <line key={f} className="grid" x1="30" x2={W - 10} y1={y(max * f)} y2={y(max * f)} />)}
        <path className="area" d={`${path("expense")} L${x(11)},${y(0)} L${x(0)},${y(0)} Z`} />
        <path className="inc" d={path("income")} />
        <path className="exp" d={path("expense")} />
        {line ? <path className="fit" d={line} /> : null}
        {s.map((p, i) => (i % 2 === 1 ? <text key={p.month} x={x(i)} y={H - 4} textAnchor="middle">{new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</text> : null))}
      </svg>
      <div className="sth-legend">
        <span><i className="k-inc" />income</span>
        <span><i className="k-exp" />spending</span>
        <span><i className="k-fit" />trend {b ? `${b > 0 ? "+" : "−"}${rupees(Math.abs(b), { compact: true })}/month` : "—"}</span>
      </div>
    </div>
  );
}

export function WeekdaySpend({ m }: { m: HubMetrics }) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(1, ...m.money.weekdayTotals);
  const total = m.money.weekdayTotals.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="sth-weekday">
      {m.money.weekdayTotals.map((v, i) => (
        <span key={names[i]} style={{ "--v": v / max, "--i": i } as CSSProperties}>
          <i />
          <b>{Math.round((v / total) * 100)}%</b>
          <small>{names[i]}</small>
        </span>
      ))}
    </div>
  );
}

/** Each category's month-end pace against its own 3-month average. */
export function CategoryPace({ m }: { m: HubMetrics }) {
  const rows = [...m.money.catDelta].sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  if (!rows.length) return <div className="sth-empty"><b>Not enough history yet</b>After a month or two of logging, each category is compared with its own average here.</div>;
  return (
    <ul className="sth-catpace">
      {rows.map((c) => (
        <li key={c.key} className={c.delta === null ? "" : c.delta > 0.15 ? "is-up" : c.delta < -0.15 ? "is-down" : ""}>
          <span>{c.label}</span>
          <b>{rupees(c.projected, { compact: true })}</b>
          <small>avg {rupees(c.avg3, { compact: true })}</small>
          <em>{c.delta === null ? "new" : `${c.delta > 0 ? "+" : "−"}${Math.abs(Math.round(c.delta * 100))}%`}</em>
        </li>
      ))}
    </ul>
  );
}

/** Goals on a deadline track: dot position = deadline, fill = progress, colour = whose. */
export function GoalTrack({ m }: { m: HubMetrics }) {
  const goals = m.activeGoals.filter((g) => g.deadline).sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const undated = m.activeGoals.filter((g) => !g.deadline);
  if (!m.activeGoals.length) return <div className="sth-empty"><b>No goals yet</b>Add your future goals with a deadline and priority on the Goals page.</div>;
  const horizon = Math.max(90, ...goals.map((g) => g.days ?? 0));
  return (
    <div className="sth-goaltrack">
      {goals.length ? (
        <ul>
          {goals.slice(0, 10).map((g, i) => (
            <li key={g.id} className={`h-${g.health} o-${g.owner}`} style={{ "--x": Math.max(0, Math.min(1, (g.days ?? 0) / horizon)), "--p": g.progress / 100, "--i": i } as CSSProperties}>
              <span className="nm"><b>{g.title}</b><small>P{g.priority} · {g.days !== null && g.days < 0 ? `${-g.days}d overdue` : `${g.days}d left`} · {PEOPLE[g.owner].name}</small></span>
              <span className="line"><i className="fill" /><i className="pin" /></span>
              <em>{g.progress}%</em>
            </li>
          ))}
        </ul>
      ) : null}
      {undated.length ? <p className="sth-sub">{undated.length} goal{undated.length === 1 ? "" : "s"} without a deadline — add one so the dashboard can tell you if you are on pace.</p> : null}
    </div>
  );
}

/** 30 days of spending as a strip; no-spend days glow. */
export function SpendStrip({ m }: { m: HubMetrics }) {
  const max = Math.max(1, ...m.money.spendDays.map((d) => d.amount));
  return (
    <div className="sth-strip" role="img" aria-label="Spending per day, last 30 days">
      {m.money.spendDays.map((d, i) => (
        <i key={d.date} className={d.amount ? "" : "is-zero"} style={{ "--v": d.amount / max, "--i": i } as CSSProperties} title={`${d.date}: ${rupees(d.amount)}`} />
      ))}
    </div>
  );
}

export function TaskWeeks({ m }: { m: HubMetrics }) {
  const max = Math.max(1, ...m.tasks.weeks.map((w) => w.done));
  return (
    <div className="sth-taskweeks" role="img" aria-label="Tasks finished per week, last 8 weeks">
      {m.tasks.weeks.map((w, i) => (
        <span key={w.label} style={{ "--v": w.done / max, "--i": i } as CSSProperties}>
          <i />
          <small>{w.done}</small>
        </span>
      ))}
    </div>
  );
}

export function PartsList({ m }: { m: HubMetrics }) {
  return (
    <ul className="sth-parts">
      {m.parts.map((p) => (
        <li key={p.key} className={`tone-${tone(p.score)} ${p.evidence ? "" : "no-ev"}`} style={{ "--s": p.score } as CSSProperties}>
          <span className="n"><b>{p.label}</b><small>{p.value}</small></span>
          <span className="b"><i /></span>
          <span className="p">{Math.round(p.score * p.weight)}<small>/{p.weight}</small></span>
          <span className="w">{p.evidence ? p.note : `Nothing logged yet — ${p.note}`}</span>
        </li>
      ))}
    </ul>
  );
}
