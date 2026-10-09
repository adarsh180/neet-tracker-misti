/**
 * Personal hub — the shared life dashboard of Adarsh and Misti. This file is
 * identical in the UPSC and NEET repos: types, vocabularies and every metric,
 * pure and deterministic (no I/O). Benchmarks are fixed (20% savings rate,
 * 6 months of emergency cover…), never adapted down to past behaviour.
 */

export type Person = "adarsh" | "misti";
export type Owner = Person | "joint";
export const PEOPLE: Record<Owner, { name: string; short: string }> = {
  adarsh: { name: "Adarsh", short: "A" },
  misti: { name: "Misti", short: "M" },
  joint: { name: "Together", short: "A+M" },
};

export const GOAL_AREAS = [
  { key: "career", label: "Career" },
  { key: "study", label: "Study & exams" },
  { key: "finance", label: "Money" },
  { key: "health", label: "Health" },
  { key: "family", label: "Family" },
  { key: "marriage", label: "Marriage" },
  { key: "home", label: "Home" },
  { key: "travel", label: "Travel" },
  { key: "learning", label: "Skills" },
  { key: "life", label: "Life" },
] as const;
export const PRIORITIES = [
  { value: 1, label: "Critical" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
] as const;
export const EXPENSE_CATEGORIES = [
  { key: "food", label: "Food & groceries" },
  { key: "rent", label: "Rent & housing" },
  { key: "bills", label: "Bills & utilities" },
  { key: "transport", label: "Transport" },
  { key: "study", label: "Books & courses" },
  { key: "health", label: "Health" },
  { key: "shopping", label: "Shopping" },
  { key: "fun", label: "Outings & fun" },
  { key: "gifts", label: "Gifts" },
  { key: "family", label: "Family" },
  { key: "travel", label: "Travel" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "emi", label: "EMI & loans" },
  { key: "other", label: "Other" },
] as const;
export const INCOME_CATEGORIES = [
  { key: "salary", label: "Salary / stipend" },
  { key: "family", label: "From family" },
  { key: "freelance", label: "Freelance / tuition" },
  { key: "scholarship", label: "Scholarship" },
  { key: "interest", label: "Interest & returns" },
  { key: "gift", label: "Gift" },
  { key: "other", label: "Other" },
] as const;
export const METHODS = ["upi", "cash", "card", "bank"] as const;
export const FUND_KINDS = [
  { key: "emergency", label: "Emergency" },
  { key: "marriage", label: "Marriage" },
  { key: "home", label: "Home" },
  { key: "travel", label: "Travel" },
  { key: "education", label: "Education" },
  { key: "investment", label: "Investment" },
  { key: "goal", label: "Other goal" },
] as const;
export const ACCOUNT_KINDS = [
  { key: "bank", label: "Bank", liability: false },
  { key: "cash", label: "Cash", liability: false },
  { key: "investment", label: "Investments", liability: false },
  { key: "gold", label: "Gold", liability: false },
  { key: "loan", label: "Loan", liability: true },
  { key: "credit", label: "Credit card", liability: true },
] as const;
export const EVENT_KINDS = [
  { key: "birthday", label: "Birthday" },
  { key: "anniversary", label: "Anniversary" },
  { key: "exam", label: "Exam" },
  { key: "wedding", label: "Wedding" },
  { key: "family", label: "Family" },
  { key: "trip", label: "Trip" },
  { key: "date", label: "Date" },
  { key: "other", label: "Other" },
] as const;
export const PLAN_CATEGORIES = [
  { key: "venue", label: "Venue" },
  { key: "attire", label: "Clothes" },
  { key: "jewellery", label: "Jewellery" },
  { key: "catering", label: "Food" },
  { key: "decor", label: "Decor" },
  { key: "photo", label: "Photo & video" },
  { key: "rituals", label: "Rituals" },
  { key: "guests", label: "Guests & invites" },
  { key: "travel", label: "Travel & stay" },
  { key: "legal", label: "Documents" },
  { key: "home", label: "New home" },
  { key: "other", label: "Other" },
] as const;

export type Goal = { id: string; owner: Owner; title: string; area: string; priority: number; deadline: string | null; status: string; progress: number; targetAmount: number | null; fundId: string | null; note: string | null; completedAt: string | null; createdAt: string };
export type Task = { id: string; owner: Owner; title: string; priority: number; due: string | null; goalId: string | null; status: string; doneAt: string | null; createdAt: string };
export type Txn = { id: string; owner: Person; kind: "income" | "expense"; amount: number; category: string; method: string | null; txnDate: string; note: string | null; recurring: boolean };
export type Budget = { id: string; owner: Person; category: string; monthly: number };
export type Fund = { id: string; owner: Owner; name: string; kind: string; target: number; targetDate: string | null; note: string | null; archived: boolean; createdAt: string };
export type FundEntry = { id: string; fundId: string; owner: Person; amount: number; entryDate: string; note: string | null };
export type Account = { id: string; owner: Owner; name: string; kind: string; balance: number; updatedAt: string };
export type HubEvent = { id: string; owner: Owner; title: string; kind: string; eventDate: string; budget: number | null; note: string | null };
export type PlanItem = { id: string; plan: string; owner: Owner; title: string; category: string; estimate: number | null; paid: number; due: string | null; status: string; note: string | null };
export type Settings = { weddingDate?: string | null; weddingBudget?: number | null; emergencyMonths?: number | null; savingsRateTarget?: number | null };
export type HubRecords = { actor: Person; goals: Goal[]; tasks: Task[]; txns: Txn[]; budgets: Budget[]; funds: Fund[]; fundEntries: FundEntry[]; accounts: Account[]; events: HubEvent[]; planItems: PlanItem[]; settings: Settings };
export type View = "all" | Person;

const DAY = 86_400_000;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const monthKey = (iso: string) => iso.slice(0, 7);
const dayDiff = (iso: string, today: string) => Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
export const rupees = (v: number, opts: { compact?: boolean } = {}) => {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (opts.compact && a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (opts.compact && a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (opts.compact && a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${sign}₹${Math.round(a).toLocaleString("en-IN")}`;
};
export const labelOf = (list: ReadonlyArray<{ key: string; label: string }>, key: string) => list.find((x) => x.key === key)?.label ?? key;

/** Does a row belong in the current view? Joint rows show for everyone. */
const inView = (owner: Owner, view: View) => view === "all" || owner === view || owner === "joint";

export function computeHub(r: HubRecords, view: View = "all", now = new Date()) {
  const today = istDay(now);
  const thisMonth = monthKey(today);
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const s = {
    weddingDate: r.settings.weddingDate ?? null,
    weddingBudget: r.settings.weddingBudget ?? null,
    emergencyMonths: r.settings.emergencyMonths ?? 6,
    savingsRateTarget: r.settings.savingsRateTarget ?? 0.2,
  };

  /* ── Money ─────────────────────────────────────────────────────────── */
  const txns = r.txns.filter((t) => inView(t.owner, view));
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - (5 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const monthRow = (m: string) => {
    const rows = txns.filter((t) => monthKey(t.txnDate) === m);
    const byPerson = (p: Person, k: "income" | "expense") => sum(rows.filter((t) => t.owner === p && t.kind === k).map((t) => t.amount));
    return {
      month: m,
      income: sum(rows.filter((t) => t.kind === "income").map((t) => t.amount)),
      expense: sum(rows.filter((t) => t.kind === "expense").map((t) => t.amount)),
      adarsh: { income: byPerson("adarsh", "income"), expense: byPerson("adarsh", "expense") },
      misti: { income: byPerson("misti", "income"), expense: byPerson("misti", "expense") },
    };
  };
  const series = months.map(monthRow);
  const cur = series[5];
  const saved = cur.income - cur.expense;
  const savingsRate = cur.income > 0 ? saved / cur.income : null;
  const pastMonths = series.slice(0, 5).filter((m) => m.expense > 0);
  const avgMonthlyExpense = pastMonths.length ? sum(pastMonths.map((m) => m.expense)) / pastMonths.length : cur.expense > 0 ? (cur.expense / dayOfMonth) * daysInMonth : 0;
  const runRate = dayOfMonth ? (cur.expense / dayOfMonth) * daysInMonth : cur.expense;
  const monthExp = txns.filter((t) => t.kind === "expense" && monthKey(t.txnDate) === thisMonth);
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({ ...c, amount: sum(monthExp.filter((t) => t.category === c.key).map((t) => t.amount)) }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const budgets = r.budgets.filter((b) => inView(b.owner, view));
  const budgetRows = EXPENSE_CATEGORIES.map((c) => {
    const limit = sum(budgets.filter((b) => b.category === c.key).map((b) => b.monthly));
    const spent = sum(monthExp.filter((t) => t.category === c.key && budgets.some((b) => b.category === c.key && b.owner === t.owner)).map((t) => t.amount));
    return { ...c, limit, spent, projected: dayOfMonth ? (spent / dayOfMonth) * daysInMonth : spent };
  }).filter((b) => b.limit > 0);
  const recurring = sum(txns.filter((t) => t.kind === "expense" && t.recurring && monthKey(t.txnDate) === thisMonth).map((t) => t.amount));
  const topExpenses = [...monthExp].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const last30 = txns.filter((t) => t.kind === "expense" && dayDiff(t.txnDate, today) > -30 && dayDiff(t.txnDate, today) <= 0);
  const spendDays = Array.from({ length: 30 }, (_, i) => {
    const d = istDay(new Date(now.getTime() - (29 - i) * DAY));
    return { date: d, amount: sum(last30.filter((t) => t.txnDate === d).map((t) => t.amount)) };
  });
  const noSpendDays = spendDays.filter((d) => d.amount === 0).length;

  /* ── Funds & net worth ─────────────────────────────────────────────── */
  const funds = r.funds.filter((f) => !f.archived && inView(f.owner, view)).map((f) => {
    const entries = r.fundEntries.filter((e) => e.fundId === f.id);
    const balance = sum(entries.map((e) => e.amount));
    const monthsLeft = f.targetDate ? Math.max(0, dayDiff(f.targetDate, today) / 30.44) : null;
    const needPerMonth = monthsLeft !== null && monthsLeft > 0 ? Math.max(0, (f.target - balance) / monthsLeft) : null;
    const in90 = sum(entries.filter((e) => dayDiff(e.entryDate, today) > -90).map((e) => e.amount)) / 3;
    const etaMonths = balance >= f.target ? 0 : in90 > 0 ? (f.target - balance) / in90 : null;
    const byPerson = { adarsh: sum(entries.filter((e) => e.owner === "adarsh").map((e) => e.amount)), misti: sum(entries.filter((e) => e.owner === "misti").map((e) => e.amount)) };
    return { ...f, balance, share: f.target > 0 ? balance / f.target : 0, needPerMonth, monthlyPace: in90, etaMonths, onTrack: needPerMonth === null ? null : in90 >= needPerMonth * 0.95, byPerson, entries: entries.length };
  });
  const emergency = funds.filter((f) => f.kind === "emergency");
  const emergencyBalance = sum(emergency.map((f) => f.balance));
  const emergencyCover = avgMonthlyExpense > 0 ? emergencyBalance / avgMonthlyExpense : null;
  const marriageFunds = funds.filter((f) => f.kind === "marriage");
  const accounts = r.accounts.filter((a) => inView(a.owner, view));
  const isLiability = (k: string) => ACCOUNT_KINDS.find((x) => x.key === k)?.liability ?? false;
  const assets = sum(accounts.filter((a) => !isLiability(a.kind)).map((a) => a.balance));
  const liabilities = sum(accounts.filter((a) => isLiability(a.kind)).map((a) => Math.abs(a.balance)));
  const netWorth = assets - liabilities;

  /* ── Goals & tasks ─────────────────────────────────────────────────── */
  const goals = r.goals.filter((g) => inView(g.owner, view)).map((g) => {
    const days = g.deadline ? dayDiff(g.deadline, today) : null;
    const span = g.deadline ? Math.max(1, dayDiff(g.deadline, g.createdAt.slice(0, 10))) : null;
    const elapsed = span && days !== null ? clamp(1 - days / span) : null;
    const fund = g.fundId ? funds.find((f) => f.id === g.fundId) : null;
    const progress = fund && g.targetAmount ? Math.round(clamp(fund.balance / g.targetAmount) * 100) : g.progress;
    const status = g.status === "done" ? "done" : g.status === "dropped" ? "dropped" : days !== null && days < 0 ? "overdue" : elapsed !== null && progress / 100 < elapsed - 0.15 ? "at-risk" : "on-track";
    const openTasks = r.tasks.filter((t) => t.goalId === g.id && t.status !== "done").length;
    return { ...g, days, elapsed, progress, health: status, openTasks, urgency: (5 - g.priority) * 10 + (days === null ? 0 : Math.max(0, 60 - days) / 3) };
  });
  const activeGoals = goals.filter((g) => g.status !== "done" && g.status !== "dropped");
  const tasks = r.tasks.filter((t) => inView(t.owner, view));
  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => t.due && dayDiff(t.due, today) < 0);
  const doneThisWeek = tasks.filter((t) => t.doneAt && dayDiff(t.doneAt.slice(0, 10), today) > -7).length;
  const created30 = tasks.filter((t) => dayDiff(t.createdAt.slice(0, 10), today) > -30);
  const closure30 = created30.length ? created30.filter((t) => t.status === "done").length / created30.length : null;
  const nextTasks = [...openTasks].sort((a, b) => a.priority - b.priority || (a.due ?? "9999").localeCompare(b.due ?? "9999")).slice(0, 8);
  const taskWeeks = Array.from({ length: 8 }, (_, i) => {
    const from = 7 * (7 - i);
    return { label: `w-${7 - i}`, done: tasks.filter((t) => t.doneAt && dayDiff(t.doneAt.slice(0, 10), today) <= -from && dayDiff(t.doneAt.slice(0, 10), today) > -from - 7).length };
  });

  /* ── Events & plans ────────────────────────────────────────────────── */
  const events = r.events
    .filter((e) => inView(e.owner, view))
    .map((e) => ({ ...e, days: dayDiff(e.eventDate, today) }))
    .filter((e) => e.days >= -1)
    .sort((a, b) => a.days - b.days);
  const plan = r.planItems.filter((p) => p.plan === "wedding" && inView(p.owner, view));
  const planEstimate = sum(plan.map((p) => p.estimate ?? 0));
  const planPaid = sum(plan.map((p) => p.paid));
  const planBudget = s.weddingBudget ?? planEstimate;
  const marriageSaved = sum(marriageFunds.map((f) => f.balance));
  const weddingDays = s.weddingDate ? dayDiff(s.weddingDate, today) : null;
  const planByCategory = PLAN_CATEGORIES.map((c) => {
    const rows = plan.filter((p) => p.category === c.key);
    return { ...c, estimate: sum(rows.map((p) => p.estimate ?? 0)), paid: sum(rows.map((p) => p.paid)), items: rows.length, done: rows.filter((p) => p.status === "done").length };
  }).filter((c) => c.items > 0);

  /* ── Together index (0–100) against fixed benchmarks ──────────────── */
  const parts = [
    { key: "savings", label: "Savings rate", weight: 20, score: savingsRate === null ? 0 : clamp(savingsRate / s.savingsRateTarget), value: savingsRate === null ? "no income logged this month" : `${Math.round(savingsRate * 100)}% saved`, note: `benchmark ${Math.round(s.savingsRateTarget * 100)}% of income`, evidence: savingsRate !== null },
    { key: "emergency", label: "Emergency cover", weight: 20, score: emergencyCover === null ? 0 : clamp(emergencyCover / s.emergencyMonths), value: emergencyCover === null ? "no emergency fund or spend yet" : `${emergencyCover.toFixed(1)} months covered`, note: `benchmark ${s.emergencyMonths} months of expenses`, evidence: emergencyCover !== null },
    { key: "budget", label: "Budget discipline", weight: 10, score: budgetRows.length ? sum(budgetRows.map((b) => (b.projected <= b.limit ? 1 : clamp(b.limit / b.projected)))) / budgetRows.length : 0, value: budgetRows.length ? `${budgetRows.filter((b) => b.projected > b.limit).length} of ${budgetRows.length} heading over` : "no budgets set", note: "projected month-end spend vs each limit", evidence: budgetRows.length > 0 },
    { key: "goals", label: "Goals on track", weight: 20, score: activeGoals.length ? activeGoals.filter((g) => g.health === "on-track").length / activeGoals.length : 0, value: activeGoals.length ? `${activeGoals.filter((g) => g.health === "on-track").length}/${activeGoals.length} on track` : "no active goals", note: "progress keeping pace with the time used", evidence: activeGoals.length > 0 },
    { key: "tasks", label: "Follow-through", weight: 15, score: closure30 === null ? 0 : clamp(closure30 / 0.8) * (overdueTasks.length ? clamp(1 - overdueTasks.length / Math.max(1, openTasks.length)) : 1), value: closure30 === null ? "no tasks in 30 days" : `${Math.round(closure30 * 100)}% closed · ${overdueTasks.length} overdue`, note: "close 80% of what you add, nothing overdue", evidence: closure30 !== null },
    { key: "funds", label: "Fund pace", weight: 15, score: funds.filter((f) => f.onTrack !== null).length ? funds.filter((f) => f.onTrack).length / funds.filter((f) => f.onTrack !== null).length : 0, value: funds.length ? `${funds.filter((f) => f.onTrack).length} of ${funds.filter((f) => f.onTrack !== null).length} dated funds on pace` : "no funds yet", note: "monthly pace (90 days) vs what the target date needs", evidence: funds.some((f) => f.onTrack !== null) },
  ];
  const index = Math.round(sum(parts.map((p) => p.weight * p.score)));
  const lever = [...parts].sort((a, b) => b.weight * (1 - b.score) - a.weight * (1 - a.score))[0];

  /* ── Recommendations: deterministic, always on ─────────────────────── */
  const recs: Array<{ tone: "good" | "warn" | "bad"; text: string }> = [];
  if (savingsRate !== null && savingsRate < s.savingsRateTarget) recs.push({ tone: savingsRate < 0 ? "bad" : "warn", text: `This month you have saved ${Math.round(savingsRate * 100)}% — ${rupees(Math.max(0, cur.income * s.savingsRateTarget - saved))} more reaches ${Math.round(s.savingsRateTarget * 100)}%.` });
  if (emergencyCover !== null && emergencyCover < s.emergencyMonths) recs.push({ tone: emergencyCover < 3 ? "bad" : "warn", text: `Emergency fund covers ${emergencyCover.toFixed(1)} months; ${rupees(Math.max(0, avgMonthlyExpense * s.emergencyMonths - emergencyBalance))} more makes ${s.emergencyMonths}.` });
  if (!emergency.length) recs.push({ tone: "warn", text: "Start an emergency fund first — it protects every other goal." });
  for (const b of budgetRows.filter((b) => b.projected > b.limit).slice(0, 2)) recs.push({ tone: "warn", text: `${b.label} is heading to ${rupees(b.projected)} against a ${rupees(b.limit)} budget.` });
  for (const g of activeGoals.filter((g) => g.health === "overdue" || g.health === "at-risk").sort((a, b) => a.priority - b.priority).slice(0, 2)) recs.push({ tone: g.health === "overdue" ? "bad" : "warn", text: `“${g.title}” is ${g.health === "overdue" ? "past its deadline" : "behind schedule"} at ${g.progress}% — break the next step into a task.` });
  for (const f of funds.filter((f) => f.onTrack === false).slice(0, 2)) recs.push({ tone: "warn", text: `${f.name} needs ${rupees(f.needPerMonth ?? 0)} a month to hit its date; the last 90 days averaged ${rupees(f.monthlyPace)}.` });
  if (overdueTasks.length) recs.push({ tone: "bad", text: `${overdueTasks.length} task${overdueTasks.length === 1 ? " is" : "s are"} overdue — clear or reschedule them today.` });
  const soon = events.filter((e) => e.days >= 0 && e.days <= 14);
  for (const e of soon.slice(0, 2)) recs.push({ tone: "good", text: `${e.title} is ${e.days === 0 ? "today" : `in ${e.days} day${e.days === 1 ? "" : "s"}`}${e.budget ? ` — keep ${rupees(e.budget)} ready` : ""}.` });
  if (weddingDays !== null && planBudget > 0 && marriageSaved < planBudget && weddingDays > 0) recs.push({ tone: "warn", text: `Marriage fund holds ${rupees(marriageSaved)} of ${rupees(planBudget)}; that is ${rupees((planBudget - marriageSaved) / Math.max(1, weddingDays / 30.44))} a month until the date.` });
  if (!recs.length) recs.push({ tone: "good", text: "Everything is on pace. Keep logging — the numbers only help when they are current." });

  return {
    today,
    view,
    index,
    band: index >= 80 ? "Thriving" : index >= 60 ? "Steady" : index >= 40 ? "Building" : "Starting",
    parts,
    lever: lever ? { label: lever.label, points: Math.round(lever.weight * (1 - lever.score)) } : null,
    money: { series, cur, saved, savingsRate, avgMonthlyExpense, runRate, byCategory, budgetRows, recurring, topExpenses, spendDays, noSpendDays, dayOfMonth, daysInMonth },
    funds,
    emergency: { balance: emergencyBalance, cover: emergencyCover, target: s.emergencyMonths, needed: Math.max(0, avgMonthlyExpense * s.emergencyMonths - emergencyBalance) },
    netWorth: { assets, liabilities, net: netWorth, accounts },
    goals,
    activeGoals,
    tasks: { open: openTasks.length, overdue: overdueTasks, doneThisWeek, closure30, next: nextTasks, weeks: taskWeeks, all: tasks },
    events,
    wedding: { date: s.weddingDate ?? null, days: weddingDays, budget: planBudget, estimate: planEstimate, paid: planPaid, saved: marriageSaved, items: plan, byCategory: planByCategory, done: plan.filter((p) => p.status === "done").length },
    recs,
    settings: s,
  };
}

export type HubMetrics = ReturnType<typeof computeHub>;
