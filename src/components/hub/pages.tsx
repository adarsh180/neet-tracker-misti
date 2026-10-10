"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDownRight, ArrowUpRight, CalendarPlus, Check, Goal, ListPlus, Pencil, PiggyBank, Plus, RefreshCw, Sparkles, Target, Trash2, Wallet } from "lucide-react";

import { BUILT_IN, HubCalendar } from "./calendar";
import { addMoneyToGoal, addToFund, editAccount, editEvent, editFund, editGoal, editPlan, editTask, editTxn, fundDeposit, newEvent, newFund, newGoal, newPlanItem, newTask, newTxn, payPlan, setBudget } from "./editors";

import { BudgetBars, CategoryDonut, CategoryPace, FundRings, GoalTrack, IndexOrbit, MoneyBars, PartsList, SpendStrip, TaskWeeks, TrendLine, WeekdaySpend } from "./charts";
import { useHub } from "./hub-context";
import { ACCOUNT_KINDS, EVENT_KINDS, EXPENSE_CATEGORIES, GOAL_AREAS, INCOME_CATEGORIES, labelOf, PEOPLE, PLAN_CATEGORIES, PRIORITIES, rupees, type Owner } from "../../lib/hub/metrics";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const short = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const countdown = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : days < 0 ? `${-days}d ago` : `in ${days}d`);
const monthName = () => new Date().toLocaleDateString("en-IN", { month: "long", timeZone: "Asia/Kolkata" });

/* ── Shared bits ─────────────────────────────────────────────────────── */
/** A page: a plain title, one line of live numbers, and the page's own actions. No marketing copy. */
function Page({ title, summary, actions, children }: { title: string; summary?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const hub = useHub();
  if (!hub.m || !hub.records) {
    return (
      <main className="sth-page">
        {hub.error ? (
          <div className="sth-empty is-boxed"><b>Saath didn&apos;t load.</b><span>{hub.error}</span><div className="sth-empty-acts"><button type="button" className="sth-btn" onClick={() => void hub.load()}><RefreshCw size={14} /> Try again</button></div></div>
        ) : (
          <div className="sth-skeleton" aria-busy="true" aria-label="Loading Saath"><i className="h" /><i className="s" /><div><i /><i /><i /></div><i className="b" /></div>
        )}
      </main>
    );
  }
  return (
    <main className="sth-page">
      <header className="sth-head">
        <div>
          <h1 className="sth-title">{title}</h1>
          {summary ? <p className="sth-sum">{summary}</p> : null}
        </div>
        {actions ? <div className="sth-head-acts">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

function Empty({ title, children, actions, boxed }: { title: string; children?: ReactNode; actions?: ReactNode; boxed?: boolean }) {
  return (
    <div className={`sth-empty ${boxed ? "is-boxed" : ""}`}>
      <b>{title}</b>
      {children ? <span>{children}</span> : null}
      {actions ? <div className="sth-empty-acts">{actions}</div> : null}
    </div>
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
    const err = await hub.act(data);
    setError(err);
  };
  return { onSubmit, error, saving: hub.saving };
}

function Who({ owner }: { owner: Owner }) {
  return <span className={`sth-who o-${owner}`}>{PEOPLE[owner].name}</span>;
}

function Del({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" className="sth-btn is-icon" aria-label={label} onClick={() => confirm(`${label}?`) && onClick()}><Trash2 size={13} /></button>;
}

function Fig({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="sth-fig">
      <span>{label}</span>
      <strong className={tone ? `t-${tone}` : ""}>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function CardHead({ title, link, children }: { title: string; link?: string; children?: ReactNode }) {
  return (
    <div className="sth-card-head">
      <h2>{title}</h2>
      {children}
      {link ? <Link href={link} className="sth-more">See all</Link> : null}
    </div>
  );
}

/** The add buttons every page shares, wired to the sheets. */
function useAdders() {
  const hub = useHub();
  const r = hub.records;
  const m = hub.m;
  const me = r?.actor ?? "adarsh";
  return {
    expense: () => hub.openSheet(newTxn("expense", hub.act)),
    income: () => hub.openSheet(newTxn("income", hub.act)),
    budget: () => hub.openSheet(setBudget(hub.act)),
    goal: () => m && hub.openSheet(newGoal(m, me, hub.act)),
    task: () => m && hub.openSheet(newTask(m, me, hub.act)),
    fund: () => m && hub.openSheet(newFund(m, me, hub.act)),
    deposit: () => m && hub.openSheet(fundDeposit(m, me, hub.act)),
    event: () => hub.openSheet(newEvent(today(), me, hub.act)),
    plan: () => hub.openSheet(newPlanItem(me, hub.act)),
    account: () => hub.openSheet(editAccount(null, me, hub.act)),
  };
}

function Btn({ onClick, icon, children, primary }: { onClick: () => void; icon?: ReactNode; children: ReactNode; primary?: boolean }) {
  return <button type="button" className={`sth-btn ${primary ? "is-primary" : ""}`} onClick={onClick}>{icon}{children}</button>;
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/* ── Overview ────────────────────────────────────────────────────────── */
export function HubOverview() {
  const hub = useHub();
  const add = useAdders();
  const m = hub.m;
  const r = hub.records;
  const me = r?.actor;
  const has = m && r ? {
    money: r.txns.length > 0,
    spend: m.money.cur.expense > 0,
    funds: m.funds.length > 0,
    goals: m.goals.length > 0,
    tasks: m.tasks.all.length > 0,
    events: m.events.length > 0,
    budgets: m.money.budgetRows.length > 0,
    accounts: m.netWorth.accounts.length > 0,
    wedding: Boolean(m.wedding.date || m.wedding.items.length || m.wedding.budget),
  } : null;
  const started = Boolean(has && (has.money || has.funds || has.goals || has.tasks || has.accounts));
  const viewLabel = hub.view === "all" ? "both of you" : `${PEOPLE[hub.view].name} only`;

  return (
    <Page
      title={me ? `${greeting()}, ${PEOPLE[me].name}.` : "Saath"}
      summary={`${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })} · ${viewLabel}`}
      actions={started ? <><Btn primary onClick={add.expense} icon={<ArrowDownRight size={15} />}>Expense</Btn><Btn onClick={add.goal} icon={<Plus size={15} />}>Goal</Btn></> : undefined}
    >
      {m && r && has ? (
        started ? (
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
                <Fig label="Saved this month" value={rupees(m.money.saved, { compact: true })} tone={m.money.saved > 0 ? "good" : m.money.saved < 0 ? "bad" : undefined} note={m.money.savingsRate === null ? undefined : `${Math.round(m.money.savingsRate * 100)}% of what came in`} />
                <Fig label="Spent this month" value={rupees(m.money.cur.expense, { compact: true })} note={m.money.cur.expense ? `heading to ${rupees(m.money.runRate, { compact: true })}` : undefined} />
                <Fig label="Net worth" value={rupees(m.netWorth.net, { compact: true })} note={has.accounts ? `${rupees(m.netWorth.liabilities, { compact: true })} owed` : undefined} />
                <Fig label="Open tasks" value={String(m.tasks.open)} tone={m.tasks.overdue.length ? "bad" : undefined} note={m.tasks.overdue.length ? `${m.tasks.overdue.length} overdue` : m.tasks.doneThisWeek ? `${m.tasks.doneThisWeek} done this week` : undefined} />
              </div>
            </section>

            {m.recs.length ? (
              <ul className="sth-nudges" aria-label="What to do next">
                {m.recs.slice(0, 3).map((x, i) => <li key={i} className={`tone-${x.tone}`} style={{ "--i": i } as CSSProperties}>{x.text}</li>)}
              </ul>
            ) : null}

            <section className="sth-sect sth-cards">
              {has.money ? (
                <div className="sth-card">
                  <CardHead title="Money, six months" link={`${hub.base}/money`} />
                  <MoneyBars m={m} />
                </div>
              ) : null}
              {has.spend ? (
                <div className="sth-card">
                  <CardHead title={`Where it went in ${monthName()}`} link={`${hub.base}/money`} />
                  <CategoryDonut m={m} />
                </div>
              ) : null}
              {has.budgets ? (
                <div className="sth-card">
                  <CardHead title="Budgets" link={`${hub.base}/money`} />
                  <BudgetBars m={m} />
                  <h3 className="sth-h3">Last 30 days</h3>
                  <SpendStrip m={m} />
                  <p className="sth-sub">{m.money.noSpendDays} no-spend days · recurring {rupees(m.money.recurring)} a month</p>
                </div>
              ) : null}
              {has.funds ? (
                <div className="sth-card">
                  <CardHead title="Funds" link={`${hub.base}/funds`} />
                  <FundRings m={m} compact onAdd={(f) => hub.openSheet(addToFund(f, hub.act))} />
                </div>
              ) : null}
              {has.goals ? (
                <div className="sth-card">
                  <CardHead title="Goals by deadline" link={`${hub.base}/goals`} />
                  <GoalTrack m={m} />
                </div>
              ) : null}
              {has.tasks ? (
                <div className="sth-card">
                  <CardHead title="Next up" link={`${hub.base}/goals`} />
                  <TaskList compact />
                  <h3 className="sth-h3">Finished per week</h3>
                  <TaskWeeks m={m} />
                </div>
              ) : null}
              <BigDays />
              {has.events ? (
                <div className="sth-card">
                  <CardHead title="Coming up" link={`${hub.base}/calendar`} />
                  <EventList limit={6} />
                </div>
              ) : null}
              {has.wedding ? (
                <div className="sth-card">
                  <CardHead title="Marriage plan" link={`${hub.base}/plans`} />
                  <WeddingSummary />
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <section className="sth-start-wrap">
            <StartHere has={has} />
            <div className="sth-start-side">
              <BigDays />
              {has.events ? (
                <div className="sth-card">
                  <CardHead title="Coming up" link={`${hub.base}/calendar`} />
                  <EventList limit={6} />
                </div>
              ) : null}
            </div>
          </section>
        )
      ) : null}
    </Page>
  );
}

/** The two exam days both dashboards are built around, counted down. */
function BigDays() {
  const now = new Date(`${today()}T00:00:00`).getTime();
  const list = BUILT_IN.map((b) => ({ ...b, days: Math.round((new Date(`${b.date}T00:00:00`).getTime() - now) / 864e5) })).filter((b) => b.days >= 0);
  if (!list.length) return null;
  return (
    <div className="sth-card sth-bigdays">
      <CardHead title="The two big days" />
      <ul>
        {list.map((b, i) => (
          <li key={b.date} className={`o-${b.owner}`} style={{ "--i": i } as CSSProperties}>
            <b>{b.days}</b>
            <span><strong>{b.title}</strong><small>{PEOPLE[b.owner].name} · {fmtDate(b.date)}</small></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** First run: four steps instead of a wall of empty charts. */
function StartHere({ has }: { has: { money: boolean; funds: boolean; goals: boolean; events: boolean } }) {
  const add = useAdders();
  const steps = [
    { done: has.money, title: "Log what comes in and goes out", note: "Income and spending start the savings rate and every money chart.", acts: <><Btn primary onClick={add.income} icon={<ArrowUpRight size={14} />}>Income</Btn><Btn onClick={add.expense} icon={<ArrowDownRight size={14} />}>Expense</Btn></> },
    { done: has.funds, title: "Start an emergency fund", note: "Six months of expenses first — it protects every other goal.", acts: <Btn onClick={add.fund} icon={<PiggyBank size={14} />}>Create a fund</Btn> },
    { done: has.goals, title: "Write down two or three goals", note: "Each with a deadline, so Saath can tell when one falls behind.", acts: <Btn onClick={add.goal} icon={<Target size={14} />}>Add a goal</Btn> },
    { done: has.events, title: "Put the big dates in", note: "Birthdays, exams, trips — they land on the shared calendar.", acts: <Btn onClick={add.event} icon={<CalendarPlus size={14} />}>Add a date</Btn> },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="sth-card sth-start">
      <div className="sth-card-head">
        <h2>Start here</h2>
        <span className="sth-start-count">{done} of {steps.length}</span>
      </div>
      <p className="sth-sub">The dashboard fills in as you two log. Nothing is estimated for you.</p>
      <ol>
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "is-done" : ""} style={{ "--i": i } as CSSProperties}>
            <span className="sth-step">{s.done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
            <span className="sth-step-text"><b>{s.title}</b><small>{s.note}</small></span>
            {s.done ? <span className="sth-step-ok">Done</span> : <span className="sth-step-acts">{s.acts}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Money ───────────────────────────────────────────────────────────── */
export function HubMoney() {
  const hub = useHub();
  const add = useAdders();
  const m = hub.m;
  const r = hub.records;
  const txns = r ? r.txns.filter((t) => hub.view === "all" || t.owner === hub.view) : [];
  return (
    <Page
      title="Money"
      summary={m ? `${monthName()} · ${rupees(m.money.cur.income, { compact: true })} in · ${rupees(m.money.cur.expense, { compact: true })} out · ${rupees(m.money.saved, { compact: true })} left` : undefined}
      actions={r?.txns.length ? <><Btn primary onClick={add.expense} icon={<ArrowDownRight size={15} />}>Expense</Btn><Btn onClick={add.income} icon={<ArrowUpRight size={15} />}>Income</Btn><Btn onClick={add.budget}>Budget</Btn></> : undefined}
    >
      {m && r ? (
        r.txns.length ? (
          <>
            <section className="sth-figs is-row">
              <Fig label="In" value={rupees(m.money.cur.income)} note={`${PEOPLE.adarsh.name} ${rupees(m.money.cur.adarsh.income, { compact: true })} · ${PEOPLE.misti.name} ${rupees(m.money.cur.misti.income, { compact: true })}`} />
              <Fig label="Out" value={rupees(m.money.cur.expense)} note={`${PEOPLE.adarsh.name} ${rupees(m.money.cur.adarsh.expense, { compact: true })} · ${PEOPLE.misti.name} ${rupees(m.money.cur.misti.expense, { compact: true })}`} />
              <Fig label="Left" value={rupees(m.money.saved)} tone={m.money.saved > 0 ? "good" : m.money.saved < 0 ? "bad" : undefined} note={m.money.savingsRate === null ? undefined : `${Math.round(m.money.savingsRate * 100)}% saved · aim ${Math.round(m.settings.savingsRateTarget * 100)}%`} />
              <Fig label="Per day" value={rupees(m.money.cur.expense / Math.max(1, m.money.dayOfMonth))} note={m.money.avgMonthlyExpense ? `usually ${rupees(m.money.avgMonthlyExpense, { compact: true })} a month` : undefined} />
            </section>

            <section className="sth-sect sth-cards">
              <div className="sth-card">
                <CardHead title="Six months" />
                <MoneyBars m={m} />
              </div>
              <div className="sth-card">
                <CardHead title={`${monthName()} by category`} />
                <CategoryDonut m={m} />
              </div>
              <div className="sth-card">
                <CardHead title="Budgets"><button type="button" className="sth-more" onClick={add.budget}>Set</button></CardHead>
                <BudgetBars m={m} />
              </div>
              <div className="sth-card">
                <CardHead title="Twelve months" />
                <TrendLine m={m} />
                <p className="sth-sub">Dashed line: the spending trend.</p>
              </div>
              <div className="sth-card">
                <CardHead title="Patterns" />
                <WeekdaySpend m={m} />
                <h3 className="sth-h3">Categories against their usual</h3>
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
              ) : <Empty title={`Nothing from ${hub.view === "all" ? "either of you" : PEOPLE[hub.view].name} yet`} />}
            </section>
          </>
        ) : (
          <Empty boxed title="No money logged yet" actions={<><Btn primary onClick={add.expense} icon={<ArrowDownRight size={14} />}>Log an expense</Btn><Btn onClick={add.income} icon={<ArrowUpRight size={14} />}>Log income</Btn></>}>
            Each of you logs your own. The first entry starts the monthly totals, budgets and every chart here.
          </Empty>
        )
      ) : null}
    </Page>
  );
}

/* ── Goals & tasks ───────────────────────────────────────────────────── */
export function HubGoals() {
  const hub = useHub();
  const add = useAdders();
  const m = hub.m;
  const r = hub.records;
  const onTrack = m ? m.activeGoals.filter((g) => g.health === "on-track").length : 0;
  return (
    <Page
      title="Goals"
      summary={m ? `${m.activeGoals.length} active · ${onTrack} on track · ${m.tasks.open} task${m.tasks.open === 1 ? "" : "s"} open` : undefined}
      actions={m && (m.goals.length || m.tasks.all.length) ? <><Btn primary onClick={add.goal} icon={<Goal size={15} />}>Goal</Btn><Btn onClick={add.task} icon={<ListPlus size={15} />}>Task</Btn></> : undefined}
    >
      {m && r ? (
        m.goals.length || m.tasks.all.length ? (
          <>
            {m.goals.length ? (
              <section className="sth-goals">
                {m.goals.map((g, i) => (
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
                    {g.fund ? <p className="sth-goal-money"><Wallet size={13} /> {rupees(g.fund.balance)} of {rupees(g.targetAmount ?? g.fund.target)} in <b>{g.fund.name}</b></p> : null}
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
                          {g.status !== "done" && (g.targetAmount || g.fund) ? <button type="button" className="sth-btn is-sm is-primary" onClick={() => hub.openSheet(addMoneyToGoal(g, hub.act))}><Plus size={13} /> Add money</button> : null}
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
                ))}
              </section>
            ) : null}
            <section className="sth-sect sth-cards">
              {m.activeGoals.length ? (
                <div className="sth-card">
                  <CardHead title="Deadline track" />
                  <GoalTrack m={m} />
                </div>
              ) : null}
              <div className="sth-card">
                <CardHead title="Tasks"><button type="button" className="sth-more" onClick={add.task}>Add</button></CardHead>
                <TaskList />
              </div>
            </section>
          </>
        ) : (
          <Empty boxed title="No goals yet" actions={<><Btn primary onClick={add.goal} icon={<Goal size={14} />}>Add a goal</Btn><Btn onClick={add.task} icon={<ListPlus size={14} />}>Add a task</Btn></>}>
            Start with the two or three that matter most this year — yours, hers or shared — each with a deadline. Break them into tasks.
          </Empty>
        )
      ) : null}
    </Page>
  );
}

function TaskList({ compact = false }: { compact?: boolean }) {
  const hub = useHub();
  const m = hub.m!;
  const me = hub.records!.actor;
  const list = compact ? m.tasks.next.slice(0, 6) : [...m.tasks.all].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.priority - b.priority).slice(0, 40);
  if (!list.length) return <Empty title="Nothing to do" />;
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
  const add = useAdders();
  const settings = useForm("settings.set");
  const m = hub.m;
  const r = hub.records;
  const total = m ? m.funds.reduce((s, f) => s + f.balance, 0) : 0;
  const mine = m && r ? m.funds.filter((f) => f.owner === r.actor || f.owner === "joint") : [];
  return (
    <Page
      title="Funds"
      summary={m ? `${rupees(total, { compact: true })} across ${m.funds.length} fund${m.funds.length === 1 ? "" : "s"} · net worth ${rupees(m.netWorth.net, { compact: true })}` : undefined}
      actions={<>{mine.length ? <Btn primary onClick={add.deposit} icon={<Plus size={15} />}>Add money</Btn> : null}<Btn primary={!mine.length} onClick={add.fund} icon={<PiggyBank size={15} />}>New fund</Btn><Btn onClick={add.account}>Account</Btn></>}
    >
      {m && r ? (
        <>
          <section className="sth-figs is-row">
            <Fig label="Emergency fund" value={rupees(m.emergency.balance)} tone={m.emergency.cover !== null && m.emergency.cover >= m.emergency.target ? "good" : undefined} note={m.emergency.cover === null ? `aim ${m.emergency.target} months of spending` : `${m.emergency.cover.toFixed(1)} of ${m.emergency.target} months · ${rupees(m.emergency.needed, { compact: true })} to go`} />
            <Fig label="All funds" value={rupees(total)} note={`${m.funds.length} active`} />
            <Fig label="Net worth" value={rupees(m.netWorth.net)} note={`${m.netWorth.accounts.length} account${m.netWorth.accounts.length === 1 ? "" : "s"}`} />
            <Fig label="Owed" value={rupees(m.netWorth.liabilities)} tone={m.netWorth.liabilities > 0 ? "warn" : undefined} note="loans and cards" />
          </section>

          <section className="sth-sect sth-card">
            <CardHead title="Funds" />
            {m.funds.length ? (
              <>
                <FundRings m={m} onAdd={(f) => hub.openSheet(addToFund(f, hub.act))} onEdit={(f) => hub.openSheet(editFund(f, r, hub.act))} />
                {mine.length ? (
                  <div className="sth-fund-admin">
                    {mine.map((f) => (
                      <span key={f.id}>
                        {f.name}
                        <button type="button" className="sth-btn is-sm" onClick={() => void hub.act({ action: "fund.archive", id: f.id })}>Archive</button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <Empty title="No funds yet" actions={<Btn primary onClick={add.fund} icon={<PiggyBank size={14} />}>Create the emergency fund</Btn>}>
                Emergency first — six months of spending — then marriage and the rest. Goals linked to a fund fill from it.
              </Empty>
            )}
          </section>

          <section className="sth-sect sth-cards">
            {r.fundEntries.length ? (
              <div className="sth-card">
                <CardHead title="Recent contributions" />
                <ul className="sth-entries">
                  {r.fundEntries.slice(0, 20).map((e) => (
                    <li key={e.id}>
                      <span><b>{r.funds.find((f) => f.id === e.fundId)?.name ?? "Fund"}</b><small>{short(e.entryDate)} · {PEOPLE[e.owner].name}{e.note ? ` · ${e.note}` : ""}</small></span>
                      <em className={e.amount >= 0 ? "t-good" : "t-bad"}>{e.amount >= 0 ? "+" : "−"}{rupees(Math.abs(e.amount))}</em>
                      {e.owner === r.actor ? <Del label="Delete this contribution" onClick={() => void hub.act({ action: "fund.entryDelete", id: e.id })} /> : <span />}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="sth-card">
              <CardHead title="Accounts & net worth"><button type="button" className="sth-more" onClick={add.account}>Add</button></CardHead>
              {m.netWorth.accounts.length ? (
                <>
                  <ul className="sth-entries">
                    {m.netWorth.accounts.map((a) => (
                      <li key={a.id}>
                        <span><b>{a.name}</b><small>{labelOf(ACCOUNT_KINDS, a.kind)} · {PEOPLE[a.owner].name} · updated {short(a.updatedAt)}</small></span>
                        <em className={ACCOUNT_KINDS.find((k) => k.key === a.kind)?.liability ? "t-bad" : ""}>{ACCOUNT_KINDS.find((k) => k.key === a.kind)?.liability ? "−" : ""}{rupees(Math.abs(a.balance))}</em>
                        {a.owner === r.actor || a.owner === "joint" ? <button type="button" className="sth-btn is-sm is-icon" aria-label={`Update ${a.name}`} onClick={() => hub.openSheet(editAccount(a, r.actor, hub.act))}><Pencil size={13} /></button> : <span />}
                      </li>
                    ))}
                  </ul>
                  <div className="sth-figs is-mini">
                    <Fig label="Cash runway" value={m.netWorth.runwayMonths === null ? "—" : `${m.netWorth.runwayMonths.toFixed(1)} mo`} note="bank + cash ÷ monthly spend" />
                    <Fig label="Debt ratio" value={m.netWorth.debtRatio === null ? "—" : `${Math.round(m.netWorth.debtRatio * 100)}%`} tone={m.netWorth.debtRatio !== null && m.netWorth.debtRatio > 0.3 ? "warn" : undefined} note="keep under 30%" />
                  </div>
                </>
              ) : <Empty title="No accounts yet">Add bank, cash, investments and anything owed — net worth adds them up.</Empty>}
            </div>
          </section>

          <details className="sth-sect sth-card sth-details">
            <summary>Benchmarks</summary>
            <form className="sth-form" onSubmit={settings.onSubmit}>
              <p className="sth-sub">Fixed bars the dashboard measures you against. Raise them when you can; they never lower themselves.</p>
              <div className="sth-row">
                <label className="sth-field">Emergency cover (months)<input name="emergencyMonths" type="number" min={1} max={24} defaultValue={m.settings.emergencyMonths} /></label>
                <label className="sth-field">Savings-rate target (0.2 = 20%)<input name="savingsRateTarget" type="number" min={0.05} max={0.9} step={0.05} defaultValue={m.settings.savingsRateTarget} /></label>
              </div>
              {settings.error ? <p className="sth-error" role="alert">{settings.error}</p> : null}
              <button type="submit" className="sth-btn" disabled={settings.saving}>Save benchmarks</button>
            </form>
          </details>
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
  if (!list.length) return <Empty title="Nothing coming up">Birthdays, exams, trips and family events, with a countdown each.</Empty>;
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
  if (!w.date && !w.items.length && !w.budget) return <Empty title="No plan yet">Set the date and a total budget below; the marriage fund pays for it.</Empty>;
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
  const add = useAdders();
  const settings = useForm("settings.set");
  const m = hub.m;
  const r = hub.records;
  return (
    <Page
      title="Plans"
      summary={m ? `${m.events.length} date${m.events.length === 1 ? "" : "s"} ahead${m.wedding.days !== null && m.wedding.days >= 0 ? ` · wedding in ${m.wedding.days} days` : ""}` : undefined}
      actions={<><Btn primary onClick={add.event} icon={<CalendarPlus size={15} />}>Date</Btn><Btn onClick={add.plan} icon={<ListPlus size={15} />}>Plan item</Btn></>}
    >
      {m && r ? (
        <>
          <section className="sth-cards">
            <div className="sth-card">
              <CardHead title="Upcoming" />
              <EventList />
            </div>
            <div className="sth-card">
              <CardHead title="Marriage plan" />
              <WeddingSummary />
              <form className="sth-inline is-wrap" onSubmit={settings.onSubmit} style={{ marginTop: 14 }}>
                <label className="sth-field">Date<input name="weddingDate" type="date" defaultValue={m.wedding.date ?? ""} /></label>
                <label className="sth-field">Total budget (₹)<input name="weddingBudget" type="number" min={0} step="1000" defaultValue={m.settings.weddingBudget ?? ""} /></label>
                <button type="submit" className="sth-btn" disabled={settings.saving}>Save</button>
              </form>
              {settings.error ? <p className="sth-error" role="alert">{settings.error}</p> : null}
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
          </section>

          {m.wedding.items.length ? (
            <section className="sth-sect sth-card">
              <CardHead title="Plan checklist"><button type="button" className="sth-more" onClick={add.plan}>Add</button></CardHead>
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
            </section>
          ) : null}
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
    <Page
      title="Insights"
      summary={meta ? `Last read ${meta}` : "The AI coach reads only when you ask."}
      actions={<>{busy ? <Btn onClick={() => ctrl.current?.abort()}>Cancel</Btn> : null}<button type="button" className="sth-btn is-primary" onClick={run} disabled={busy}><Sparkles size={15} /> {busy ? "Reading…" : "Analyse"}</button></>}
    >
      {m ? (
        <>
          <section className="sth-card sth-coach">
            {error ? <p className="sth-error" role="alert">{error}</p> : null}
            <div className="sth-ai" aria-live="polite">
              {text ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : busy ? null : <p className="sth-sub">Press <b>Analyse</b> for a verdict, money and fund advice, goal priorities and a plan for this week — written from both of your numbers.</p>}
              {busy ? <span className="sth-caret" /> : null}
            </div>
          </section>

          <section className="sth-sect sth-cards">
            <div className="sth-card sth-recs">
              <CardHead title="What the numbers say" />
              <ul>{m.recs.map((x, i) => <li key={i} className={`tone-${x.tone}`} style={{ "--i": i } as CSSProperties}>{x.text}</li>)}</ul>
            </div>
            <div className="sth-card">
              <CardHead title="Who carries what" />
              <Split m={m} />
            </div>
          </section>

          <section className="sth-sect sth-card">
            <CardHead title="The numbers" />
            <div className="sth-figs is-math">
              <Fig label="Savings rate" value={m.money.savingsRate === null ? "—" : `${Math.round(m.money.savingsRate * 100)}%`} note="(income − spending) ÷ income" />
              <Fig label="Spend run-rate" value={rupees(m.money.runRate, { compact: true })} note={`spent ÷ ${m.money.dayOfMonth} days × ${m.money.daysInMonth}`} />
              <Fig label="Daily spend" value={`${rupees(m.money.dailyMean, { compact: true })} ± ${rupees(m.money.dailySd, { compact: true })}`} note="mean ± SD, 30 days" />
              <Fig label="Month on month" value={m.money.momExpense === null ? "—" : `${m.money.momExpense >= 0 ? "+" : "−"}${Math.abs(Math.round(m.money.momExpense * 100))}%`} tone={m.money.momExpense !== null && m.money.momExpense > 0.1 ? "warn" : undefined} note="run-rate ÷ last month − 1" />
              <Fig label="Spending trend" value={m.money.spendTrend === null ? "—" : `${m.money.spendTrend >= 0 ? "+" : "−"}${rupees(Math.abs(m.money.spendTrend), { compact: true })}/mo`} note="slope over 11 months" />
              <Fig label="Average saving" value={rupees(m.money.avgMonthlySaving, { compact: true })} tone={m.money.avgMonthlySaving > 0 ? "good" : m.money.avgMonthlySaving < 0 ? "bad" : undefined} note="last three full months" />
              <Fig label="Emergency cover" value={m.emergency.cover === null ? "—" : `${m.emergency.cover.toFixed(1)} mo`} note="funds ÷ monthly spend" />
              <Fig label="Cash runway" value={m.netWorth.runwayMonths === null ? "—" : `${m.netWorth.runwayMonths.toFixed(1)} mo`} note="bank + cash ÷ monthly spend" />
              <Fig label="Debt ratio" value={m.netWorth.debtRatio === null ? "—" : `${Math.round(m.netWorth.debtRatio * 100)}%`} note="owed ÷ owned" />
              <Fig label="Net worth in a year" value={rupees(m.netWorth.projected12, { compact: true })} tone={m.netWorth.projected12 > m.netWorth.net ? "good" : m.netWorth.projected12 < m.netWorth.net ? "bad" : undefined} note="today + 12 × average saving" />
            </div>
            <details className="sth-details is-inline">
              <summary>How the dates and the index are worked out</summary>
              <ul className="sth-formulas">
                <li><b>Fund dates</b> — a least-squares line through each fund&apos;s running balance gives its rupees-per-day pace; the target is reached at (target − balance) ÷ pace.</li>
                <li><b>Goal dates</b> — progress ÷ days since the goal was set gives its pace; it finishes in (100 − progress) ÷ pace days.</li>
                <li><b>At risk</b> — progress more than 15 points behind the share of time used, or a pace-based finish more than two weeks after the deadline.</li>
                <li><b>Together index</b> — six parts with fixed weights (savings 20, emergency 20, goals 20, follow-through 15, fund pace 15, budgets 10), each scored 0–1 against the benchmark; anything without data scores 0.</li>
              </ul>
            </details>
          </section>

          {m.money.topExpenses.length ? (
            <section className="sth-sect sth-card">
              <CardHead title={`Biggest expenses in ${monthName()}`} />
              <ul className="sth-entries">
                {m.money.topExpenses.map((t) => (
                  <li key={t.id}><span><b>{labelOf(EXPENSE_CATEGORIES, t.category)}</b><small>{short(t.txnDate)} · {PEOPLE[t.owner].name}{t.note ? ` · ${t.note}` : ""}</small></span><em>{rupees(t.amount)}</em><span /></li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}

/** Income, spending, fund contributions and tasks this month, split between the two of you. */
function Split({ m }: { m: NonNullable<ReturnType<typeof useHub>["m"]> }) {
  const hub = useHub();
  const r = hub.records!;
  const month = m.today.slice(0, 7);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const contrib = (p: "adarsh" | "misti") => r.fundEntries.filter((e) => e.owner === p && e.entryDate.startsWith(month)).reduce((s, e) => s + e.amount, 0);
  const done = (p: "adarsh" | "misti") => m.tasks.all.filter((t) => t.owner === p && t.doneAt && t.doneAt.slice(0, 10) > weekAgo).length;
  const rows = [
    { label: "Income", a: m.money.cur.adarsh.income, b: m.money.cur.misti.income },
    { label: "Spending", a: m.money.cur.adarsh.expense, b: m.money.cur.misti.expense },
    { label: "Into funds", a: contrib("adarsh"), b: contrib("misti") },
    { label: "Tasks done (7d)", a: done("adarsh"), b: done("misti"), count: true },
  ];
  return (
    <ul className="sth-split">
      {rows.map((x) => {
        const tot = x.a + x.b;
        return (
          <li key={x.label} className={tot > 0 ? "" : "is-empty"} style={{ "--a": tot > 0 ? x.a / tot : 0 } as CSSProperties}>
            <span>{x.label}</span>
            <span className="bar">{tot > 0 ? <><i className="a" /><i className="m" /></> : null}</span>
            <small>{tot > 0 ? <><b className="o-adarsh">{x.count ? x.a : rupees(x.a, { compact: true })}</b> · <b className="o-misti">{x.count ? x.b : rupees(x.b, { compact: true })}</b></> : "nothing yet"}</small>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Calendar ────────────────────────────────────────────────────────── */
export function HubCalendarPage() {
  const hub = useHub();
  const add = useAdders();
  const m = hub.m;
  const soon = m ? m.events.filter((e) => e.days >= 0 && e.days <= 30).length : 0;
  return (
    <Page title="Calendar" summary={m ? `${soon} in the next 30 days · exams, deadlines, funds and plans in one month view` : undefined} actions={<Btn primary onClick={add.event} icon={<CalendarPlus size={15} />}>Add a date</Btn>}>
      <HubCalendar />
    </Page>
  );
}
