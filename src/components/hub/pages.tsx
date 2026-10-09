"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDownRight, ArrowUpRight, Check, Pencil, Plus, RefreshCw, Sparkles, Trash2, Wallet } from "lucide-react";

import { addMoneyToGoal, addToFund, editAccount, editEvent, editFund, editGoal, editPlan, editTask, editTxn, payPlan } from "./editors";

import { BudgetBars, CategoryDonut, CategoryPace, FundRings, GoalTrack, IndexOrbit, MoneyBars, PartsList, SpendStrip, TaskWeeks, TrendLine, WeekdaySpend } from "./charts";
import { useHub } from "./hub-context";
import {
  ACCOUNT_KINDS,
  EVENT_KINDS,
  EXPENSE_CATEGORIES,
  FUND_KINDS,
  GOAL_AREAS,
  INCOME_CATEGORIES,
  labelOf,
  PEOPLE,
  PLAN_CATEGORIES,
  PRIORITIES,
  rupees,
  type Owner,
} from "../../lib/hub/metrics";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const short = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const countdown = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : days < 0 ? `${-days}d ago` : `in ${days}d`);

/* ── Shared bits ─────────────────────────────────────────────────────── */
function Page({ kicker, title, accent, lede, children }: { kicker: string; title: string; accent: string; lede: ReactNode; children: ReactNode }) {
  const hub = useHub();
  if (!hub.m || !hub.records) {
    return (
      <main className="sth-page">
        {hub.error ? (
          <div className="sth-empty"><b>The dashboard didn&apos;t load.</b>{hub.error}<button type="button" className="sth-btn" style={{ justifySelf: "start" }} onClick={() => void hub.load()}><RefreshCw size={14} /> Retry</button></div>
        ) : (
          <div className="sth-loading"><span className="sth-loader" /><p>Opening Saath…</p></div>
        )}
      </main>
    );
  }
  return (
    <main className="sth-page">
      <header className="sth-head">
        <span className="sth-kicker">{kicker}</span>
        <h1 className="sth-title">{title} <em>{accent}</em></h1>
        <p className="sth-lede">{lede}</p>
      </header>
      {children}
    </main>
  );
}

function useForm(action: string, extra?: Record<string, unknown>) {
  const hub = useHub();
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data: Record<string, unknown> = { action, ...extra };
    new FormData(form).forEach((v, k) => (data[k] = v));
    form.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((c) => (data[c.name] = c.checked));
    const err = await hub.act(data);
    setError(err);
    if (!err) form.reset();
  };
  return { onSubmit, error, saving: hub.saving };
}

function OwnerSelect({ allowJoint = true, defaultJoint = false }: { allowJoint?: boolean; defaultJoint?: boolean }) {
  const hub = useHub();
  const me = hub.records!.actor;
  if (!allowJoint) return null;
  return (
    <label className="sth-field">Whose
      <select name="owner" defaultValue={defaultJoint ? "joint" : me}>
        <option value={me}>{PEOPLE[me].name} (me)</option>
        <option value="joint">Both of us</option>
      </select>
    </label>
  );
}

function Who({ owner }: { owner: Owner }) {
  return <span className={`sth-who o-${owner}`}>{PEOPLE[owner].name}</span>;
}

function Del({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" className="sth-btn is-icon" aria-label={label} onClick={() => confirm(`${label}?`) && onClick()}><Trash2 size={13} /></button>;
}

function LoggingAs() {
  const hub = useHub();
  const me = hub.records!.actor;
  return <span className={`sth-as o-${me}`}>Logging as {PEOPLE[me].name}</span>;
}

/* ── Overview ────────────────────────────────────────────────────────── */
export function HubOverview() {
  const hub = useHub();
  const m = hub.m;
  return (
    <Page kicker={m ? `${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} · ${hub.view === "all" ? "both of us" : PEOPLE[hub.view].name}` : ""} title="Our life," accent="in one view." lede="Money in and out, what is left, the funds you are building, every goal with its deadline and priority, what to do next and what is coming up — together, against fixed benchmarks.">
      {m ? (
        <>
          <section className="sth-hero">
            <div className="sth-card sth-hero-index">
              <IndexOrbit m={m} />
              <div>
                <PartsList m={m} />
                {m.lever ? <p className="sth-lever">Biggest lever: <b>{m.lever.label.toLowerCase()}</b> — up to <b>+{m.lever.points}</b> points.</p> : null}
              </div>
            </div>
            <div className="sth-figs">
              <Fig label="Saved this month" value={rupees(m.money.saved, { compact: true })} tone={m.money.saved >= 0 ? "good" : "bad"} note={m.money.savingsRate === null ? "log income to see the rate" : `${Math.round(m.money.savingsRate * 100)}% of ${rupees(m.money.cur.income, { compact: true })} in`} />
              <Fig label="Spent this month" value={rupees(m.money.cur.expense, { compact: true })} note={`heading to ${rupees(m.money.runRate, { compact: true })} by month end`} />
              <Fig label="Emergency cover" value={m.emergency.cover === null ? "—" : `${m.emergency.cover.toFixed(1)} mo`} tone={m.emergency.cover !== null && m.emergency.cover >= m.emergency.target ? "good" : "warn"} note={`${rupees(m.emergency.balance, { compact: true })} · aim ${m.emergency.target} months`} />
              <Fig label="Net worth" value={rupees(m.netWorth.net, { compact: true })} note={`${rupees(m.netWorth.assets, { compact: true })} assets · ${rupees(m.netWorth.liabilities, { compact: true })} owed`} />
              <Fig label="Goals on track" value={`${m.activeGoals.filter((g) => g.health === "on-track").length}/${m.activeGoals.length}`} tone={m.activeGoals.some((g) => g.health === "overdue") ? "bad" : undefined} note={`${m.activeGoals.filter((g) => g.health === "overdue").length} overdue · ${m.activeGoals.filter((g) => g.health === "at-risk").length} at risk`} />
              <Fig label="To-do" value={String(m.tasks.open)} tone={m.tasks.overdue.length ? "bad" : undefined} note={`${m.tasks.overdue.length} overdue · ${m.tasks.doneThisWeek} done this week`} />
            </div>
          </section>

          <section className="sth-sect sth-card sth-recs">
            <h2>What to do about it</h2>
            <ul>
              {m.recs.map((r, i) => <li key={i} className={`tone-${r.tone}`} style={{ "--i": i } as CSSProperties}>{r.text}</li>)}
            </ul>
          </section>

          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <CardHead title="Money, six months" link={`${hub.base}/money`} />
              <MoneyBars m={m} />
            </div>
            <div className="sth-card">
              <CardHead title="Where it went this month" link={`${hub.base}/money`} />
              <CategoryDonut m={m} />
            </div>
          </section>

          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <CardHead title="Budgets" link={`${hub.base}/money`} />
              <BudgetBars m={m} />
              <h3 className="sth-h3">Last 30 days</h3>
              <SpendStrip m={m} />
              <p className="sth-sub">{m.money.noSpendDays} no-spend days · recurring this month {rupees(m.money.recurring)}</p>
            </div>
            <div className="sth-card">
              <CardHead title="Funds" link={`${hub.base}/funds`} />
              <FundRings m={m} compact onAdd={(f) => hub.openSheet(addToFund(f, hub.act))} />
            </div>
          </section>

          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <CardHead title="Goals by deadline" link={`${hub.base}/goals`} />
              <GoalTrack m={m} />
            </div>
            <div className="sth-card">
              <CardHead title="Next up" link={`${hub.base}/goals`} />
              <TaskList compact />
              <h3 className="sth-h3">Tasks finished per week</h3>
              <TaskWeeks m={m} />
            </div>
          </section>

          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <CardHead title="Coming up" link={`${hub.base}/plans`} />
              <EventList limit={6} />
            </div>
            <div className="sth-card">
              <CardHead title="Marriage plan" link={`${hub.base}/plans`} />
              <WeddingSummary />
            </div>
          </section>
        </>
      ) : null}
    </Page>
  );
}

function Fig({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="sth-fig">
      <span>{label}</span>
      <strong className={tone ? `t-${tone}` : ""}>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function CardHead({ title, link }: { title: string; link?: string }) {
  return (
    <div className="sth-card-head">
      <h2>{title}</h2>
      {link ? <Link href={link} className="sth-more">Open →</Link> : null}
    </div>
  );
}

/* ── Money ───────────────────────────────────────────────────────────── */
export function HubMoney() {
  const hub = useHub();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const add = useForm("txn.add", { kind });
  const budget = useForm("budget.set");
  const m = hub.m;
  const r = hub.records;
  const txns = r ? r.txns.filter((t) => hub.view === "all" || t.owner === hub.view) : [];
  return (
    <Page kicker="Money · income, expenses, budgets" title="Every rupee," accent="both of us." lede="Each of you logs your own income and spending here; the view toggle at the top switches between Adarsh's, Misti's and both together. Budgets are per person and per category.">
      {m && r ? (
        <>
          <section className="sth-figs is-row">
            <Fig label="In this month" value={rupees(m.money.cur.income)} note={`${PEOPLE.adarsh.name} ${rupees(m.money.cur.adarsh.income, { compact: true })} · ${PEOPLE.misti.name} ${rupees(m.money.cur.misti.income, { compact: true })}`} />
            <Fig label="Out this month" value={rupees(m.money.cur.expense)} note={`${PEOPLE.adarsh.name} ${rupees(m.money.cur.adarsh.expense, { compact: true })} · ${PEOPLE.misti.name} ${rupees(m.money.cur.misti.expense, { compact: true })}`} />
            <Fig label="Left" value={rupees(m.money.saved)} tone={m.money.saved >= 0 ? "good" : "bad"} note={m.money.savingsRate === null ? "—" : `${Math.round(m.money.savingsRate * 100)}% saved · aim ${Math.round(m.settings.savingsRateTarget * 100)}%`} />
            <Fig label="Daily average" value={rupees(m.money.cur.expense / Math.max(1, m.money.dayOfMonth))} note={`3-month monthly average ${rupees(m.money.avgMonthlyExpense, { compact: true })}`} />
          </section>

          <section className="sth-sect sth-grid g2">
            <form className="sth-card sth-form" onSubmit={add.onSubmit} key={kind}>
              <div className="sth-card-head"><h2>Log {kind === "expense" ? "an expense" : "income"}</h2><LoggingAs /></div>
              <div className="sth-seg" role="group" aria-label="Kind">
                <button type="button" aria-pressed={kind === "expense"} onClick={() => setKind("expense")}><ArrowDownRight size={14} /> Expense</button>
                <button type="button" aria-pressed={kind === "income"} onClick={() => setKind("income")}><ArrowUpRight size={14} /> Income</button>
              </div>
              <div className="sth-row">
                <label className="sth-field">Amount (₹)<input name="amount" type="number" inputMode="decimal" min={0.01} step="0.01" required /></label>
                <label className="sth-field">Date<input name="txnDate" type="date" defaultValue={today()} max={today()} /></label>
              </div>
              <div className="sth-row">
                <label className="sth-field">Category
                  <select name="category">{(kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                </label>
                <label className="sth-field">Paid via
                  <select name="method" defaultValue="upi"><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option></select>
                </label>
              </div>
              <label className="sth-field">Note<input name="note" maxLength={300} placeholder={kind === "expense" ? "e.g. Laxmikanth 7th edition" : "e.g. October stipend"} /></label>
              <label className="sth-check"><input type="checkbox" name="recurring" /> Repeats every month</label>
              {add.error ? <p className="sth-error" role="alert">{add.error}</p> : null}
              <button type="submit" className="sth-btn is-primary" disabled={add.saving}><Plus size={15} /> Save</button>
            </form>
            <div className="sth-card">
              <CardHead title="Six months" />
              <MoneyBars m={m} />
            </div>
          </section>

          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <CardHead title="This month by category" />
              <CategoryDonut m={m} />
            </div>
            <div className="sth-card">
              <div className="sth-card-head"><h2>Budgets</h2><LoggingAs /></div>
              <BudgetBars m={m} />
              <form className="sth-inline" onSubmit={budget.onSubmit}>
                <select name="category" aria-label="Budget category">{EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                <input name="monthly" type="number" min={0} step="100" placeholder="₹ a month (0 removes)" aria-label="Monthly limit" required />
                <button type="submit" className="sth-btn" disabled={budget.saving}>Set</button>
              </form>
              {budget.error ? <p className="sth-error" role="alert">{budget.error}</p> : null}
            </div>
          </section>

          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <CardHead title="Twelve months" />
              <p className="sth-sub">Spending and income month by month. The dashed line is a least-squares fit through spending — its slope says how fast the monthly bill is moving.</p>
              <TrendLine m={m} />
            </div>
            <div className="sth-card">
              <CardHead title="Patterns" />
              <p className="sth-sub">Last 30 days by weekday, and each category's month-end pace against its own 3-month average.</p>
              <WeekdaySpend m={m} />
              <h3 className="sth-h3">Categories vs their average</h3>
              <CategoryPace m={m} />
            </div>
          </section>

          <section className="sth-sect sth-card">
            <CardHead title={`Entries · ${hub.view === "all" ? "both" : PEOPLE[hub.view].name}`} />
            {txns.length ? (
              <div className="sth-scroll">
                <table className="sth-table">
                  <thead><tr><th>Date</th><th>Who</th><th>What</th><th>Via</th><th className="num">Amount</th><th /></tr></thead>
                  <tbody>
                    {txns.slice(0, 40).map((t) => (
                      <tr key={t.id}>
                        <td>{short(t.txnDate)}</td>
                        <td><Who owner={t.owner} /></td>
                        <td>{labelOf(t.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES, t.category)}{t.recurring ? <span className="sth-pill">monthly</span> : null}{t.note ? <small className="sth-note">{t.note}</small> : null}</td>
                        <td>{t.method?.toUpperCase() ?? "—"}</td>
                        <td className={`num ${t.kind === "income" ? "t-good" : ""}`}>{t.kind === "income" ? "+" : "−"}{rupees(t.amount)}</td>
                        <td>{t.owner === r.actor ? <button type="button" className="sth-btn is-sm is-icon" aria-label="Edit this entry" onClick={() => hub.openSheet(editTxn(t, hub.act))}><Pencil size={13} /></button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="sth-empty"><b>Nothing logged yet</b>Your first expense or income starts every chart on this page.</div>}
          </section>
        </>
      ) : null}
    </Page>
  );
}

/* ── Goals & tasks ───────────────────────────────────────────────────── */
export function HubGoals() {
  const hub = useHub();
  const goal = useForm("goal.add");
  const task = useForm("task.add");
  const m = hub.m;
  const r = hub.records;
  return (
    <Page kicker="Goals · deadlines and priorities" title="Where we are" accent="going." lede="Future goals with a deadline and a priority — yours, hers, or shared. A goal is at risk when its progress falls behind the share of its time already used. Break each one into tasks.">
      {m && r ? (
        <>
          <section className="sth-grid g2">
            <form className="sth-card sth-form" onSubmit={goal.onSubmit}>
              <div className="sth-card-head"><h2>New goal</h2><LoggingAs /></div>
              <label className="sth-field">Goal<input name="title" maxLength={200} required placeholder="e.g. Clear UPSC Prelims 2027" /></label>
              <div className="sth-row">
                <label className="sth-field">Area<select name="area" defaultValue="career">{GOAL_AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label>
                <label className="sth-field">Priority<select name="priority" defaultValue={2}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
                <OwnerSelect />
              </div>
              <div className="sth-row">
                <label className="sth-field">Deadline<input name="deadline" type="date" min={today()} /></label>
                <label className="sth-field">Money needed (₹)<input name="targetAmount" type="number" min={0} step="100" /></label>
                <label className="sth-field">Linked fund
                  <select name="fundId" defaultValue=""><option value="">— none —</option>{m.funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                </label>
              </div>
              <label className="sth-field">Why it matters<input name="note" maxLength={4000} /></label>
              {goal.error ? <p className="sth-error" role="alert">{goal.error}</p> : null}
              <button type="submit" className="sth-btn is-primary" disabled={goal.saving}><Plus size={15} /> Add goal</button>
            </form>
            <form className="sth-card sth-form" onSubmit={task.onSubmit}>
              <div className="sth-card-head"><h2>New task</h2><LoggingAs /></div>
              <label className="sth-field">Task<input name="title" maxLength={200} required placeholder="e.g. Open the recurring deposit" /></label>
              <div className="sth-row">
                <label className="sth-field">Priority<select name="priority" defaultValue={2}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
                <label className="sth-field">Due<input name="due" type="date" /></label>
                <OwnerSelect />
              </div>
              <label className="sth-field">For goal<select name="goalId" defaultValue=""><option value="">— none —</option>{m.activeGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
              {task.error ? <p className="sth-error" role="alert">{task.error}</p> : null}
              <button type="submit" className="sth-btn is-primary" disabled={task.saving}><Plus size={15} /> Add task</button>
              <h3 className="sth-h3">Open tasks</h3>
              <TaskList />
            </form>
          </section>

          <section className="sth-sect sth-card">
            <CardHead title="Deadline track" />
            <GoalTrack m={m} />
          </section>

          <section className="sth-sect sth-goals">
            {m.goals.length ? m.goals.map((g, i) => (
              <article key={g.id} className={`sth-card sth-goal h-${g.health} o-${g.owner}`} style={{ "--p": g.progress / 100, "--i": i } as CSSProperties}>
                <header>
                  <span className={`sth-prio p${g.priority}`}>{labelOf(PRIORITIES.map((p) => ({ key: String(p.value), label: p.label })), String(g.priority))}</span>
                  <span className="sth-chip">{labelOf(GOAL_AREAS, g.area)}</span>
                  <Who owner={g.owner} />
                </header>
                <h3>{g.title}</h3>
                <p className="sth-sub">
                  {g.deadline ? `${fmtDate(g.deadline)} · ${g.days !== null && g.days < 0 ? `${-g.days} days overdue` : `${g.days} days left`}` : "No deadline"}
                  {g.targetAmount ? ` · needs ${rupees(g.targetAmount)}` : ""}
                  {g.openTasks ? ` · ${g.openTasks} open task${g.openTasks === 1 ? "" : "s"}` : ""}
                </p>
                {g.fund ? (
                  <p className="sth-goal-money"><Wallet size={13} /> {rupees(g.fund.balance)} of {rupees(g.targetAmount ?? g.fund.target)} in <b>{g.fund.name}</b></p>
                ) : null}
                <div className="sth-goal-bar"><i /><b>{g.progress}%</b></div>
                {g.status !== "done" && g.etaDate ? (
                  <p className={`sth-eta ${g.slackDays !== null && g.slackDays < 0 ? "t-bad" : ""}`}>
                    At this pace: done by {fmtDate(g.etaDate)}{g.slackDays !== null ? ` · ${Math.abs(g.slackDays)} days ${g.slackDays >= 0 ? "before" : "after"} the deadline` : ""}
                  </p>
                ) : null}
                <div className="sth-goal-foot">
                  <span className={`sth-health h-${g.health}`}>{g.health.replace("-", " ")}</span>
                  {g.owner === r.actor || g.owner === "joint" ? (
                    <span className="sth-goal-acts">
                      {g.status !== "done" && (g.targetAmount || g.fund) ? (
                        <button type="button" className="sth-btn is-sm is-primary" onClick={() => hub.openSheet(addMoneyToGoal(g, hub.act))}><Plus size={13} /> Add money</button>
                      ) : null}
                      {g.status !== "done" && !(g.fundId && g.targetAmount) ? (
                        <input type="range" min={0} max={100} step={5} defaultValue={g.progress} aria-label={`Progress of ${g.title}`} onPointerUp={(e) => void hub.act({ action: "goal.update", id: g.id, progress: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => e.key.startsWith("Arrow") && void hub.act({ action: "goal.update", id: g.id, progress: Number((e.target as HTMLInputElement).value) })} />
                      ) : null}
                      {g.status !== "done" ? (
                        <button type="button" className="sth-btn is-sm is-icon" title="Mark done" aria-label={`Mark ${g.title} done`} onClick={() => void hub.act({ action: "goal.update", id: g.id, status: "done" })}><Check size={14} /></button>
                      ) : <button type="button" className="sth-btn is-sm" onClick={() => void hub.act({ action: "goal.update", id: g.id, status: "active" })}>Reopen</button>}
                      <button type="button" className="sth-btn is-sm is-icon" title="Edit" aria-label={`Edit ${g.title}`} onClick={() => hub.openSheet(editGoal(g, r, m, hub.act))}><Pencil size={13} /></button>
                    </span>
                  ) : null}
                </div>
              </article>
            )) : <div className="sth-empty"><b>No goals yet</b>Start with the two or three that matter most this year.</div>}
          </section>
        </>
      ) : null}
    </Page>
  );
}

function TaskList({ compact = false }: { compact?: boolean }) {
  const hub = useHub();
  const m = hub.m!;
  const me = hub.records!.actor;
  const list = compact ? m.tasks.next.slice(0, 6) : [...m.tasks.all].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.priority - b.priority).slice(0, 40);
  if (!list.length) return <div className="sth-empty"><b>Nothing to do</b>Add tasks on the Goals page.</div>;
  return (
    <ul className="sth-tasks">
      {list.map((t, i) => {
        const overdue = t.status !== "done" && t.due && t.due < m.today;
        const mine = t.owner === me || t.owner === "joint";
        return (
          <li key={t.id} className={`${t.status === "done" ? "is-done" : ""} ${overdue ? "is-overdue" : ""}`} style={{ "--i": i } as CSSProperties}>
            <button type="button" className="tick" disabled={!mine} aria-label={t.status === "done" ? `Reopen ${t.title}` : `Mark ${t.title} done`} onClick={() => void hub.act({ action: "task.toggle", id: t.id })}><Check size={12} /></button>
            <span><b>{t.title}</b><small>P{t.priority}{t.due ? ` · ${overdue ? "was due" : "due"} ${short(t.due)}` : ""} · {PEOPLE[t.owner].name}</small></span>
            {mine ? <button type="button" className="sth-btn is-sm is-icon" aria-label={`Edit ${t.title}`} onClick={() => hub.openSheet(editTask(t, m, hub.act))}><Pencil size={13} /></button> : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ── Funds, emergency, net worth ─────────────────────────────────────── */
export function HubFunds() {
  const hub = useHub();
  const fund = useForm("fund.add");
  const entry = useForm("fund.entry");
  const settings = useForm("settings.set");
  const m = hub.m;
  const r = hub.records;
  return (
    <Page kicker="Funds · emergency, marriage, goals, net worth" title="What we are" accent="building." lede="Every fund has a target and, ideally, a date — the dashboard works out the monthly amount the date needs and compares it with your real pace over the last 90 days. Emergency comes first.">
      {m && r ? (
        <>
          <section className="sth-figs is-row">
            <Fig label="Emergency fund" value={rupees(m.emergency.balance)} tone={m.emergency.cover !== null && m.emergency.cover >= m.emergency.target ? "good" : "warn"} note={m.emergency.cover === null ? "log expenses to measure cover" : `${m.emergency.cover.toFixed(1)} of ${m.emergency.target} months · ${rupees(m.emergency.needed, { compact: true })} to go`} />
            <Fig label="All funds" value={rupees(m.funds.reduce((s, f) => s + f.balance, 0))} note={`${m.funds.length} active`} />
            <Fig label="Net worth" value={rupees(m.netWorth.net)} note={`${m.netWorth.accounts.length} accounts`} />
            <Fig label="Owed" value={rupees(m.netWorth.liabilities)} tone={m.netWorth.liabilities > 0 ? "warn" : undefined} note="loans and cards" />
          </section>

          <section className="sth-sect sth-card">
            <CardHead title="Funds" />
            <p className="sth-sub">Tap <b>+ Add</b> on a fund to put money in (or take it out with a minus amount); <b>Edit</b> renames it or changes its target and date. Goals linked to a fund fill from it automatically.</p>
            <FundRings m={m} onAdd={(f) => hub.openSheet(addToFund(f, hub.act))} onEdit={(f) => hub.openSheet(editFund(f, r, hub.act))} />
          </section>

          <section className="sth-sect sth-grid g2">
            <form className="sth-card sth-form" onSubmit={entry.onSubmit}>
              <div className="sth-card-head"><h2>Add to a fund</h2><LoggingAs /></div>
              <label className="sth-field">Fund<select name="fundId" required defaultValue="">{<option value="" disabled>Choose a fund</option>}{m.funds.filter((f) => f.owner === r.actor || f.owner === "joint").map((f) => <option key={f.id} value={f.id}>{f.name} · {PEOPLE[f.owner].name}</option>)}</select></label>
              <div className="sth-row">
                <label className="sth-field">Amount (₹, minus to withdraw)<input name="amount" type="number" step="0.01" required /></label>
                <label className="sth-field">Date<input name="entryDate" type="date" defaultValue={today()} max={today()} /></label>
              </div>
              <label className="sth-field">Note<input name="note" maxLength={300} /></label>
              {entry.error ? <p className="sth-error" role="alert">{entry.error}</p> : null}
              <button type="submit" className="sth-btn is-primary" disabled={entry.saving || !m.funds.length}><Plus size={15} /> Save contribution</button>
            </form>
            <form className="sth-card sth-form" onSubmit={fund.onSubmit}>
              <div className="sth-card-head"><h2>New fund</h2><LoggingAs /></div>
              <div className="sth-row">
                <label className="sth-field">Name<input name="name" maxLength={120} required placeholder="e.g. Emergency fund" /></label>
                <label className="sth-field">Kind<select name="kind" defaultValue={m.funds.some((f) => f.kind === "emergency") ? "marriage" : "emergency"}>{FUND_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
              </div>
              <div className="sth-row">
                <label className="sth-field">Target (₹)<input name="target" type="number" min={1} step="100" required /></label>
                <label className="sth-field">By<input name="targetDate" type="date" min={today()} /></label>
                <OwnerSelect defaultJoint />
              </div>
              {fund.error ? <p className="sth-error" role="alert">{fund.error}</p> : null}
              <button type="submit" className="sth-btn is-primary" disabled={fund.saving}><Plus size={15} /> Create fund</button>
            </form>
          </section>

          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <CardHead title="Recent contributions" />
              {r.fundEntries.length ? (
                <ul className="sth-entries">
                  {r.fundEntries.slice(0, 20).map((e) => (
                    <li key={e.id}>
                      <span><b>{r.funds.find((f) => f.id === e.fundId)?.name ?? "Fund"}</b><small>{short(e.entryDate)} · {PEOPLE[e.owner].name}{e.note ? ` · ${e.note}` : ""}</small></span>
                      <em className={e.amount >= 0 ? "t-good" : "t-bad"}>{e.amount >= 0 ? "+" : "−"}{rupees(Math.abs(e.amount))}</em>
                      {e.owner === r.actor ? <Del label="Delete this contribution" onClick={() => void hub.act({ action: "fund.entryDelete", id: e.id })} /> : <span />}
                    </li>
                  ))}
                </ul>
              ) : <div className="sth-empty"><b>No contributions yet</b>Every deposit or withdrawal is kept, so you can see the pace.</div>}
              {m.funds.filter((f) => f.owner === r.actor || f.owner === "joint").length ? (
                <div className="sth-fund-admin">
                  {m.funds.filter((f) => f.owner === r.actor || f.owner === "joint").map((f) => (
                    <span key={f.id}>
                      {f.name}
                      <button type="button" className="sth-btn is-sm" onClick={() => void hub.act({ action: "fund.archive", id: f.id })}>Archive</button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="sth-card sth-form">
              <div className="sth-card-head"><h2>Accounts &amp; net worth</h2><LoggingAs /></div>
              {m.netWorth.accounts.length ? (
                <ul className="sth-entries">
                  {m.netWorth.accounts.map((a) => (
                    <li key={a.id}>
                      <span><b>{a.name}</b><small>{labelOf(ACCOUNT_KINDS, a.kind)} · {PEOPLE[a.owner].name} · updated {short(a.updatedAt)}</small></span>
                      <em className={ACCOUNT_KINDS.find((k) => k.key === a.kind)?.liability ? "t-bad" : ""}>{ACCOUNT_KINDS.find((k) => k.key === a.kind)?.liability ? "−" : ""}{rupees(Math.abs(a.balance))}</em>
                      {a.owner === r.actor || a.owner === "joint" ? (
                        <button type="button" className="sth-btn is-sm is-icon" aria-label={`Update ${a.name}`} onClick={() => hub.openSheet(editAccount(a, r.actor, hub.act))}><Pencil size={13} /></button>
                      ) : <span />}
                    </li>
                  ))}
                </ul>
              ) : <p className="sth-sub">Add bank, cash, investments and anything owed — net worth adds them up.</p>}
              <div className="sth-figs is-mini">
                <Fig label="Cash runway" value={m.netWorth.runwayMonths === null ? "—" : `${m.netWorth.runwayMonths.toFixed(1)} mo`} note="bank + cash ÷ average monthly spend" />
                <Fig label="Debt ratio" value={m.netWorth.debtRatio === null ? "—" : `${Math.round(m.netWorth.debtRatio * 100)}%`} tone={m.netWorth.debtRatio !== null && m.netWorth.debtRatio > 0.3 ? "warn" : undefined} note="owed ÷ assets · keep under 30%" />
              </div>
              <button type="button" className="sth-btn" onClick={() => hub.openSheet(editAccount(null, r.actor, hub.act))}><Plus size={15} /> Add an account</button>
            </div>
          </section>

          <section className="sth-sect">
            <form className="sth-card sth-form" onSubmit={settings.onSubmit}>
              <h2>Benchmarks</h2>
              <p className="sth-sub">Fixed bars the dashboard measures you against. Raise them when you can; they never lower themselves.</p>
              <div className="sth-row">
                <label className="sth-field">Emergency cover (months)<input name="emergencyMonths" type="number" min={1} max={24} defaultValue={m.settings.emergencyMonths} /></label>
                <label className="sth-field">Savings-rate target (0.2 = 20%)<input name="savingsRateTarget" type="number" min={0.05} max={0.9} step={0.05} defaultValue={m.settings.savingsRateTarget} /></label>
              </div>
              {settings.error ? <p className="sth-error" role="alert">{settings.error}</p> : null}
              <button type="submit" className="sth-btn" disabled={settings.saving}>Save benchmarks</button>
            </form>
          </section>
        </>
      ) : null}
    </Page>
  );
}

/* ── Plans: events + marriage ────────────────────────────────────────── */
function EventList({ limit }: { limit?: number }) {
  const hub = useHub();
  const m = hub.m!;
  const me = hub.records!.actor;
  const list = limit ? m.events.slice(0, limit) : m.events;
  if (!list.length) return <div className="sth-empty"><b>Nothing coming up</b>Add birthdays, exams, trips and family events on the Plans page.</div>;
  return (
    <ul className="sth-events">
      {list.map((e, i) => (
        <li key={e.id} className={`k-${e.kind} ${e.days <= 7 ? "is-soon" : ""}`} style={{ "--i": i } as CSSProperties}>
          <span className="date"><b>{new Date(`${e.eventDate}T00:00:00`).getDate()}</b><small>{new Date(`${e.eventDate}T00:00:00`).toLocaleDateString("en-IN", { month: "short" })}</small></span>
          <span><b>{e.title}</b><small>{labelOf(EVENT_KINDS, e.kind)} · {PEOPLE[e.owner].name}{e.budget ? ` · ${rupees(e.budget)}` : ""}</small></span>
          <em>{countdown(e.days)}</em>
          {!limit && (e.owner === me || e.owner === "joint") ? <button type="button" className="sth-btn is-sm is-icon" aria-label={`Edit ${e.title}`} onClick={() => hub.openSheet(editEvent(e, hub.act))}><Pencil size={13} /></button> : null}
        </li>
      ))}
    </ul>
  );
}

function WeddingSummary() {
  const hub = useHub();
  const w = hub.m!.wedding;
  if (!w.date && !w.items.length && !w.budget) return <div className="sth-empty"><b>No plan yet</b>Set a date and budget and add items on the Plans page — the marriage fund on Funds pays for it.</div>;
  const budget = w.budget || 1;
  return (
    <div className="sth-wedding">
      <div className="sth-wedding-top">
        <div><span>Date</span><b>{w.date ? fmtDate(w.date) : "not set"}</b>{w.days !== null ? <small>{w.days >= 0 ? `${w.days} days to go` : "done"}</small> : null}</div>
        <div><span>Budget</span><b>{rupees(w.budget, { compact: true })}</b><small>{rupees(w.estimate, { compact: true })} estimated</small></div>
        <div><span>Saved</span><b>{rupees(w.saved, { compact: true })}</b><small>{Math.round((w.saved / budget) * 100)}% of budget</small></div>
      </div>
      <div className="sth-wedding-bar" style={{ "--paid": Math.min(1, w.paid / budget), "--saved": Math.min(1, w.saved / budget), "--est": Math.min(1.2, w.estimate / budget) } as CSSProperties}>
        <i className="saved" /><i className="paid" /><u />
      </div>
      <div className="sth-legend"><span><i className="k-saved" />saved in marriage funds</span><span><i className="k-paid" />already paid</span><span><i className="k-est" />estimated total</span></div>
      <p className="sth-sub">{w.done}/{w.items.length} items done · {rupees(w.paid)} paid</p>
    </div>
  );
}

export function HubPlans() {
  const hub = useHub();
  const ev = useForm("event.add");
  const plan = useForm("plan.add");
  const settings = useForm("settings.set");
  const m = hub.m;
  const r = hub.records;
  return (
    <Page kicker="Plans · events and our marriage" title="What is" accent="coming." lede="Upcoming events with countdowns and budgets, and the marriage plan — every item with an estimate, what is paid and what is booked — measured against the marriage fund.">
      {m && r ? (
        <>
          <section className="sth-grid g2">
            <div className="sth-card">
              <CardHead title="Upcoming events" />
              <EventList />
            </div>
            <form className="sth-card sth-form" onSubmit={ev.onSubmit}>
              <div className="sth-card-head"><h2>Add an event</h2><LoggingAs /></div>
              <label className="sth-field">Event<input name="title" maxLength={200} required placeholder="e.g. Misti's birthday" /></label>
              <div className="sth-row">
                <label className="sth-field">Date<input name="eventDate" type="date" required /></label>
                <label className="sth-field">Kind<select name="kind">{EVENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
                <OwnerSelect defaultJoint />
              </div>
              <div className="sth-row">
                <label className="sth-field">Budget (₹)<input name="budget" type="number" min={0} step="100" /></label>
                <label className="sth-field">Note<input name="note" maxLength={2000} /></label>
              </div>
              {ev.error ? <p className="sth-error" role="alert">{ev.error}</p> : null}
              <button type="submit" className="sth-btn is-primary" disabled={ev.saving}><Plus size={15} /> Add event</button>
            </form>
          </section>

          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <CardHead title="Marriage plan" />
              <WeddingSummary />
              <form className="sth-inline is-wrap" onSubmit={settings.onSubmit} style={{ marginTop: 14 }}>
                <label className="sth-field">Date<input name="weddingDate" type="date" defaultValue={m.wedding.date ?? ""} /></label>
                <label className="sth-field">Total budget (₹)<input name="weddingBudget" type="number" min={0} step="1000" defaultValue={m.settings.weddingBudget ?? ""} /></label>
                <button type="submit" className="sth-btn" disabled={settings.saving}>Save</button>
              </form>
              {m.wedding.byCategory.length ? (
                <ul className="sth-plancats">
                  {m.wedding.byCategory.map((c, i) => (
                    <li key={c.key} style={{ "--e": c.estimate / Math.max(1, ...m.wedding.byCategory.map((x) => x.estimate)), "--p": c.estimate ? Math.min(1, c.paid / c.estimate) : 0, "--i": i } as CSSProperties}>
                      <span>{c.label}<small>{c.done}/{c.items} done</small></span>
                      <span className="bar"><i /><u /></span>
                      <b>{rupees(c.estimate, { compact: true })}</b>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <form className="sth-card sth-form" onSubmit={plan.onSubmit}>
              <div className="sth-card-head"><h2>Add a plan item</h2><LoggingAs /></div>
              <label className="sth-field">Item<input name="title" maxLength={200} required placeholder="e.g. Book the venue" /></label>
              <div className="sth-row">
                <label className="sth-field">Category<select name="category">{PLAN_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
                <label className="sth-field">Estimate (₹)<input name="estimate" type="number" min={0} step="500" /></label>
                <label className="sth-field">Due<input name="due" type="date" /></label>
              </div>
              <OwnerSelect defaultJoint />
              {plan.error ? <p className="sth-error" role="alert">{plan.error}</p> : null}
              <button type="submit" className="sth-btn is-primary" disabled={plan.saving}><Plus size={15} /> Add item</button>
            </form>
          </section>

          <section className="sth-sect sth-card">
            <CardHead title="Plan checklist" />
            {m.wedding.items.length ? (
              <div className="sth-scroll">
                <table className="sth-table">
                  <thead><tr><th>Item</th><th>Category</th><th>Due</th><th className="num">Estimate</th><th className="num">Paid</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {m.wedding.items.map((p) => {
                      const mine = p.owner === r.actor || p.owner === "joint";
                      return (
                        <tr key={p.id}>
                          <td><b>{p.title}</b> <Who owner={p.owner} /></td>
                          <td>{labelOf(PLAN_CATEGORIES, p.category)}</td>
                          <td>{p.due ? short(p.due) : "—"}</td>
                          <td className="num">{p.estimate ? rupees(p.estimate) : "—"}</td>
                          <td className="num">{rupees(p.paid)}{mine ? <button type="button" className="sth-btn is-sm sth-pay" onClick={() => hub.openSheet(payPlan(p, hub.act))}>+ Pay</button> : null}</td>
                          <td>
                            {mine ? (
                              <select value={p.status} aria-label={`Status of ${p.title}`} onChange={(e) => void hub.act({ action: "plan.update", id: p.id, status: e.target.value })}>
                                <option value="todo">To do</option><option value="booked">Booked</option><option value="done">Done</option>
                              </select>
                            ) : p.status}
                          </td>
                          <td>{mine ? <button type="button" className="sth-btn is-sm is-icon" aria-label={`Edit ${p.title}`} onClick={() => hub.openSheet(editPlan(p, hub.act))}><Pencil size={13} /></button> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="sth-empty"><b>No items yet</b>Venue, clothes, jewellery, food, photos, documents — each with an estimate.</div>}
          </section>
        </>
      ) : null}
    </Page>
  );
}

/* ── Insights: AI on request + the full metric breakdown ────────────── */
export function HubInsights({ analyzeApi }: { analyzeApi: string }) {
  const hub = useHub();
  const m = hub.m;
  const [text, setText] = useState("");
  const [meta, setMeta] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const c = new AbortController();
    fetch(analyzeApi, { signal: c.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        const a = d.items?.[0];
        if (a) {
          setText(a.text);
          setMeta(`${PEOPLE[a.actor as "adarsh" | "misti"]?.name ?? ""} · ${new Date(a.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`);
        }
      })
      .catch(() => {});
    return () => c.abort();
  }, [analyzeApi]);

  const run = async () => {
    setBusy(true);
    setError(null);
    ctrl.current = new AbortController();
    try {
      const res = await fetch(analyzeApi, { method: "POST", signal: ctrl.current.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
      setText(data.text);
      setMeta(`just now · asked by ${PEOPLE[data.actor as "adarsh" | "misti"]?.name ?? "you"}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page kicker="Insights · analysis and recommendations" title="Read it" accent="together." lede="The rule-based recommendations update with every entry. The AI coach reads the whole dashboard — both of you — and runs only when you press the button.">
      {m ? (
        <>
          <section className="sth-grid g2">
            <div className="sth-card sth-recs">
              <h2>Recommendations</h2>
              <ul>{m.recs.map((r, i) => <li key={i} className={`tone-${r.tone}`} style={{ "--i": i } as CSSProperties}>{r.text}</li>)}</ul>
            </div>
            <div className="sth-card">
              <div className="sth-card-head">
                <h2>AI coach</h2>
                <span style={{ display: "flex", gap: 8 }}>
                  {busy ? <button type="button" className="sth-btn is-sm" onClick={() => ctrl.current?.abort()}>Cancel</button> : null}
                  <button type="button" className="sth-btn is-primary is-sm" onClick={run} disabled={busy}><Sparkles size={14} /> {busy ? "Reading…" : "Analyse"}</button>
                </span>
              </div>
              {meta ? <p className="sth-sub">{meta}</p> : <p className="sth-sub">No analysis yet.</p>}
              {error ? <p className="sth-error" role="alert">{error}</p> : null}
              <div className="sth-ai" aria-live="polite">
                {text ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : busy ? null : <p>Press Analyse for a verdict, money and fund advice, goal priorities and a plan for this week.</p>}
                {busy ? <span className="sth-caret" /> : null}
              </div>
            </div>
          </section>
          <section className="sth-sect sth-card">
            <h2>The numbers behind it</h2>
            <p className="sth-sub">Every figure on Saath comes from a formula you can check — here they are with today&apos;s values.</p>
            <div className="sth-figs is-math">
              <Fig label="Savings rate" value={m.money.savingsRate === null ? "—" : `${Math.round(m.money.savingsRate * 100)}%`} note="(income − spending) ÷ income, this month" />
              <Fig label="Spend run-rate" value={rupees(m.money.runRate, { compact: true })} note={`spent so far ÷ ${m.money.dayOfMonth} days × ${m.money.daysInMonth}`} />
              <Fig label="Daily spend" value={`${rupees(m.money.dailyMean, { compact: true })} ± ${rupees(m.money.dailySd, { compact: true })}`} note="mean ± standard deviation, last 30 days" />
              <Fig label="Month on month" value={m.money.momExpense === null ? "—" : `${m.money.momExpense >= 0 ? "+" : "−"}${Math.abs(Math.round(m.money.momExpense * 100))}%`} tone={m.money.momExpense !== null && m.money.momExpense > 0.1 ? "warn" : undefined} note="this month's run-rate ÷ last month − 1" />
              <Fig label="Spending trend" value={m.money.spendTrend === null ? "—" : `${m.money.spendTrend >= 0 ? "+" : "−"}${rupees(Math.abs(m.money.spendTrend), { compact: true })}/mo`} note="least-squares slope over 11 months" />
              <Fig label="Average saving" value={rupees(m.money.avgMonthlySaving, { compact: true })} tone={m.money.avgMonthlySaving >= 0 ? "good" : "bad"} note="mean of the last three full months" />
              <Fig label="Emergency cover" value={m.emergency.cover === null ? "—" : `${m.emergency.cover.toFixed(1)} mo`} note="emergency funds ÷ average monthly spend" />
              <Fig label="Cash runway" value={m.netWorth.runwayMonths === null ? "—" : `${m.netWorth.runwayMonths.toFixed(1)} mo`} note="bank + cash ÷ average monthly spend" />
              <Fig label="Debt ratio" value={m.netWorth.debtRatio === null ? "—" : `${Math.round(m.netWorth.debtRatio * 100)}%`} note="what you owe ÷ what you own" />
              <Fig label="Net worth in 12 months" value={rupees(m.netWorth.projected12, { compact: true })} tone={m.netWorth.projected12 >= m.netWorth.net ? "good" : "bad"} note="today + 12 × average monthly saving" />
            </div>
            <ul className="sth-formulas">
              <li><b>Fund dates</b> — a least-squares line through each fund&apos;s running balance gives its rupees-per-day pace; the target is reached at (target − balance) ÷ pace.</li>
              <li><b>Goal dates</b> — progress ÷ days since the goal was set gives its pace; it finishes in (100 − progress) ÷ pace days.</li>
              <li><b>At risk</b> — a goal is at risk when its progress is more than 15 points behind the share of its time already used, or when its pace-based finish date lands more than two weeks after the deadline.</li>
              <li><b>Together index</b> — six parts with fixed weights (savings 20, emergency 20, goals 20, follow-through 15, fund pace 15, budgets 10), each scored 0–1 against the benchmark; anything without data scores 0.</li>
            </ul>
          </section>
          <section className="sth-sect sth-grid g2">
            <div className="sth-card">
              <h2>Together index, part by part</h2>
              <PartsList m={m} />
            </div>
            <div className="sth-card">
              <h2>Who carries what</h2>
              <Split m={m} />
            </div>
          </section>
          <section className="sth-sect sth-card">
            <h2>Biggest expenses this month</h2>
            {m.money.topExpenses.length ? (
              <ul className="sth-entries">
                {m.money.topExpenses.map((t) => (
                  <li key={t.id}><span><b>{labelOf(EXPENSE_CATEGORIES, t.category)}</b><small>{short(t.txnDate)} · {PEOPLE[t.owner].name}{t.note ? ` · ${t.note}` : ""}</small></span><em>{rupees(t.amount)}</em><span /></li>
                ))}
              </ul>
            ) : <div className="sth-empty"><b>No expenses this month</b>They appear here as you log them.</div>}
          </section>
        </>
      ) : null}
    </Page>
  );
}

/** Income, spending and fund contributions this month, split between the two of you. */
function Split({ m }: { m: NonNullable<ReturnType<typeof useHub>["m"]> }) {
  const hub = useHub();
  const r = hub.records!;
  const month = m.today.slice(0, 7);
  const contrib = (p: "adarsh" | "misti") => r.fundEntries.filter((e) => e.owner === p && e.entryDate.startsWith(month)).reduce((s, e) => s + e.amount, 0);
  const rows = [
    { label: "Income", a: m.money.cur.adarsh.income, b: m.money.cur.misti.income },
    { label: "Spending", a: m.money.cur.adarsh.expense, b: m.money.cur.misti.expense },
    { label: "Into funds", a: contrib("adarsh"), b: contrib("misti") },
    { label: "Tasks done (7d)", a: m.tasks.all.filter((t) => t.owner === "adarsh" && t.doneAt && t.doneAt.slice(0, 10) > new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).length, b: m.tasks.all.filter((t) => t.owner === "misti" && t.doneAt && t.doneAt.slice(0, 10) > new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).length, count: true },
  ];
  return (
    <ul className="sth-split">
      {rows.map((x) => {
        const tot = Math.max(1e-9, x.a + x.b);
        return (
          <li key={x.label} style={{ "--a": x.a / tot } as CSSProperties}>
            <span>{x.label}</span>
            <span className="bar"><i className="a" /><i className="m" /></span>
            <small><b className="o-adarsh">{x.count ? x.a : rupees(x.a, { compact: true })}</b> · <b className="o-misti">{x.count ? x.b : rupees(x.b, { compact: true })}</b></small>
          </li>
        );
      })}
    </ul>
  );
}
