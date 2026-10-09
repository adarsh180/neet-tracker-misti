import {
  ACCOUNT_KINDS,
  EVENT_KINDS,
  EXPENSE_CATEGORIES,
  FUND_KINDS,
  GOAL_AREAS,
  INCOME_CATEGORIES,
  PEOPLE,
  PLAN_CATEGORIES,
  PRIORITIES,
  rupees,
  type HubMetrics,
  type HubRecords,
  type Owner,
} from "../../lib/hub/metrics";
import type { SheetSpec } from "./sheet";

/**
 * Every edit / rename / add-money dialog in Saath, as data. Each returns a
 * SheetSpec; saving goes through the same server actions (which re-check who
 * may change what). Identical in both repos.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;
type Goal = HubMetrics["goals"][number];
type Fund = HubMetrics["funds"][number];

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const opts = (list: ReadonlyArray<{ key: string; label: string }>) => list.map((x) => ({ value: x.key, label: x.label }));
const prios = PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }));
const whose = (me: "adarsh" | "misti") => [
  { value: me, label: `${PEOPLE[me].name} (me)` },
  { value: "joint", label: "Both of us" },
];

export function editGoal(g: Goal, r: HubRecords, m: HubMetrics, act: Act): SheetSpec {
  return {
    title: "Edit goal",
    subtitle: g.fund ? `Money for it lives in “${g.fund.name}”.` : "Rename it, move the deadline, change its priority or what it needs.",
    fields: [
      { name: "title", label: "Goal", type: "text", value: g.title, required: true, wide: true },
      { name: "area", label: "Area", type: "select", value: g.area, options: opts(GOAL_AREAS) },
      { name: "priority", label: "Priority", type: "select", value: String(g.priority), options: prios },
      { name: "deadline", label: "Deadline", type: "date", value: g.deadline ?? "" },
      { name: "owner", label: "Whose", type: "select", value: g.owner, options: whose(r.actor) },
      { name: "targetAmount", label: "Money needed (₹)", type: "money", value: g.targetAmount ?? "", min: 0, hint: "Leave empty for goals that are not about money" },
      { name: "fundId", label: "Linked fund", type: "select", value: g.fundId ?? "", options: [{ value: "", label: "— none —" }, ...m.funds.filter((f) => f.owner === r.actor || f.owner === "joint").map((f) => ({ value: f.id, label: f.name }))] },
      { name: "status", label: "Status", type: "select", value: g.status, options: [{ value: "planned", label: "Planned" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "done", label: "Done" }, { value: "dropped", label: "Dropped" }] },
      ...(g.fundId && g.targetAmount ? [] : [{ name: "progress", label: "Progress (%)", type: "number" as const, value: g.progress, min: 0, max: 100, step: 5 }]),
      { name: "note", label: "Why it matters", type: "textarea", value: g.note ?? "" },
    ],
    submit: "Save goal",
    onSubmit: (v) => act({ action: "goal.update", id: g.id, ...v }),
    danger: { label: "Delete", confirm: `Delete the goal “${g.title}”? Its tasks stay, unlinked.`, onConfirm: () => act({ action: "goal.delete", id: g.id }) },
  };
}

export function addMoneyToGoal(g: Goal, act: Act): SheetSpec {
  const left = g.targetAmount ? Math.max(0, g.targetAmount - (g.fund?.balance ?? 0)) : null;
  return {
    title: `Add money · ${g.title}`,
    subtitle: g.fund ? `Goes into “${g.fund.name}” — ${rupees(g.fund.balance)} of ${rupees(g.fund.target)} so far${left ? `, ${rupees(left)} to go` : ""}.` : g.targetAmount ? `A fund for this goal is created and linked with your first amount (target ${rupees(g.targetAmount)}).` : "First set how much this goal needs: Edit → Money needed.",
    fields: [
      { name: "amount", label: "Amount (₹) — minus to take out", type: "money", required: true },
      { name: "entryDate", label: "Date", type: "date", value: today() },
      { name: "note", label: "Note", type: "text", placeholder: "e.g. October salary" },
    ],
    quick: [500, 1000, 2000, 5000, 10000],
    submit: "Add",
    onSubmit: (v) => act({ action: "goal.addMoney", id: g.id, ...v }),
  };
}

export function addToFund(f: Fund, act: Act): SheetSpec {
  return {
    title: `Add to ${f.name}`,
    subtitle: `${rupees(f.balance)} of ${rupees(f.target)}${f.needPerMonth ? ` · the date needs ${rupees(f.needPerMonth)} a month` : ""}.`,
    fields: [
      { name: "amount", label: "Amount (₹) — minus to withdraw", type: "money", required: true },
      { name: "entryDate", label: "Date", type: "date", value: today() },
      { name: "note", label: "Note", type: "text" },
    ],
    quick: [500, 1000, 2000, 5000, 10000],
    submit: "Save",
    onSubmit: (v) => act({ action: "fund.entry", fundId: f.id, ...v }),
  };
}

export function editFund(f: Fund, r: HubRecords, act: Act): SheetSpec {
  return {
    title: "Edit fund",
    subtitle: `${f.entries} contribution${f.entries === 1 ? "" : "s"} so far.`,
    fields: [
      { name: "name", label: "Name", type: "text", value: f.name, required: true, wide: true },
      { name: "kind", label: "Kind", type: "select", value: f.kind, options: opts(FUND_KINDS) },
      { name: "owner", label: "Whose", type: "select", value: f.owner, options: whose(r.actor) },
      { name: "target", label: "Target (₹)", type: "money", value: f.target, required: true, min: 1 },
      { name: "targetDate", label: "Reach it by", type: "date", value: f.targetDate ?? "" },
      { name: "note", label: "Note", type: "textarea", value: f.note ?? "" },
    ],
    submit: "Save fund",
    onSubmit: (v) => act({ action: "fund.update", id: f.id, ...v }),
    danger: { label: "Delete", confirm: `Delete “${f.name}” and its whole contribution history?`, onConfirm: () => act({ action: "fund.delete", id: f.id }) },
  };
}

export function editTask(t: HubRecords["tasks"][number], m: HubMetrics, act: Act): SheetSpec {
  return {
    title: "Edit task",
    fields: [
      { name: "title", label: "Task", type: "text", value: t.title, required: true, wide: true },
      { name: "priority", label: "Priority", type: "select", value: String(t.priority), options: prios },
      { name: "due", label: "Due", type: "date", value: t.due ?? "" },
      { name: "goalId", label: "For goal", type: "select", value: t.goalId ?? "", options: [{ value: "", label: "— none —" }, ...m.activeGoals.map((g) => ({ value: g.id, label: g.title }))], wide: true },
    ],
    submit: "Save task",
    onSubmit: (v) => act({ action: "task.update", id: t.id, ...v }),
    danger: { label: "Delete", confirm: `Delete “${t.title}”?`, onConfirm: () => act({ action: "task.delete", id: t.id }) },
  };
}

export function editEvent(e: HubRecords["events"][number], act: Act): SheetSpec {
  return {
    title: "Edit event",
    fields: [
      { name: "title", label: "Event", type: "text", value: e.title, required: true, wide: true },
      { name: "eventDate", label: "Date", type: "date", value: e.eventDate, required: true },
      { name: "kind", label: "Kind", type: "select", value: e.kind, options: opts(EVENT_KINDS) },
      { name: "budget", label: "Budget (₹)", type: "money", value: e.budget ?? "", min: 0 },
      { name: "note", label: "Note", type: "textarea", value: e.note ?? "" },
    ],
    submit: "Save event",
    onSubmit: (v) => act({ action: "event.update", id: e.id, ...v }),
    danger: { label: "Delete", confirm: `Delete “${e.title}”?`, onConfirm: () => act({ action: "event.delete", id: e.id }) },
  };
}

export function editPlan(p: HubRecords["planItems"][number], act: Act): SheetSpec {
  return {
    title: "Edit plan item",
    fields: [
      { name: "title", label: "Item", type: "text", value: p.title, required: true, wide: true },
      { name: "category", label: "Category", type: "select", value: p.category, options: opts(PLAN_CATEGORIES) },
      { name: "status", label: "Status", type: "select", value: p.status, options: [{ value: "todo", label: "To do" }, { value: "booked", label: "Booked" }, { value: "done", label: "Done" }] },
      { name: "estimate", label: "Estimate (₹)", type: "money", value: p.estimate ?? "", min: 0 },
      { name: "paid", label: "Paid so far (₹)", type: "money", value: p.paid, min: 0 },
      { name: "due", label: "Due", type: "date", value: p.due ?? "" },
      { name: "note", label: "Note", type: "textarea", value: p.note ?? "" },
    ],
    submit: "Save item",
    onSubmit: (v) => act({ action: "plan.update", id: p.id, ...v }),
    danger: { label: "Delete", confirm: `Delete “${p.title}”?`, onConfirm: () => act({ action: "plan.delete", id: p.id }) },
  };
}

export function payPlan(p: HubRecords["planItems"][number], act: Act): SheetSpec {
  return {
    title: `Record a payment · ${p.title}`,
    subtitle: `${rupees(p.paid)} paid${p.estimate ? ` of ${rupees(p.estimate)}` : ""}.`,
    fields: [{ name: "addPaid", label: "Amount paid now (₹)", type: "money", required: true, min: 0.01 }],
    submit: "Add payment",
    onSubmit: (v) => act({ action: "plan.update", id: p.id, addPaid: v.addPaid }),
  };
}

export function editTxn(t: HubRecords["txns"][number], act: Act): SheetSpec {
  return {
    title: t.kind === "income" ? "Edit income" : "Edit expense",
    fields: [
      { name: "amount", label: "Amount (₹)", type: "money", value: t.amount, required: true, min: 0.01 },
      { name: "txnDate", label: "Date", type: "date", value: t.txnDate },
      { name: "category", label: "Category", type: "select", value: t.category, options: opts(t.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES) },
      { name: "method", label: "Via", type: "select", value: t.method ?? "upi", options: [{ value: "upi", label: "UPI" }, { value: "cash", label: "Cash" }, { value: "card", label: "Card" }, { value: "bank", label: "Bank" }] },
      { name: "recurring", label: "Repeats monthly", type: "select", value: t.recurring ? "true" : "false", options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }] },
      { name: "note", label: "Note", type: "text", value: t.note ?? "", wide: true },
    ],
    submit: "Save",
    onSubmit: (v) => act({ action: "txn.update", id: t.id, ...v, recurring: v.recurring === "true" }),
    danger: { label: "Delete", confirm: "Delete this entry?", onConfirm: () => act({ action: "txn.delete", id: t.id }) },
  };
}

export function editAccount(a: { id?: string; owner: Owner; name: string; kind: string; balance: number } | null, me: "adarsh" | "misti", act: Act): SheetSpec {
  return {
    title: a ? "Update account" : "Add an account",
    subtitle: "Bank, cash, investments, gold — and anything owed (loans, cards). Net worth adds them up.",
    fields: [
      { name: "name", label: "Name", type: "text", value: a?.name ?? "", required: true, wide: true, placeholder: "e.g. SBI savings" },
      { name: "kind", label: "Kind", type: "select", value: a?.kind ?? "bank", options: ACCOUNT_KINDS.map((k) => ({ value: k.key, label: k.label })) },
      { name: "owner", label: "Whose", type: "select", value: a?.owner ?? me, options: whose(me) },
      { name: "balance", label: "Balance today (₹)", type: "money", value: a?.balance ?? "", required: true, hint: "For loans and cards, enter what is owed" },
    ],
    submit: a ? "Save" : "Add account",
    onSubmit: (v) => act({ action: "account.set", ...(a?.id ? { id: a.id } : {}), ...v }),
    danger: a?.id ? { label: "Delete", confirm: `Delete ${a.name}?`, onConfirm: () => act({ action: "account.delete", id: a.id }) } : undefined,
  };
}

export function newEvent(date: string, me: "adarsh" | "misti", act: Act): SheetSpec {
  return {
    title: "Add to the calendar",
    subtitle: "Birthdays, exams, trips, family visits, anniversaries — anything with a date.",
    fields: [
      { name: "title", label: "What", type: "text", required: true, wide: true, placeholder: "e.g. Mock test series starts" },
      { name: "eventDate", label: "Date", type: "date", value: date, required: true },
      { name: "kind", label: "Kind", type: "select", value: "other", options: opts(EVENT_KINDS) },
      { name: "owner", label: "Whose", type: "select", value: "joint", options: whose(me) },
      { name: "budget", label: "Budget (₹)", type: "money", min: 0 },
      { name: "note", label: "Note", type: "textarea" },
    ],
    submit: "Add",
    onSubmit: (v) => act({ action: "event.add", ...v }),
  };
}
