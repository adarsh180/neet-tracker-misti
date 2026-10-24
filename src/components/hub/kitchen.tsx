"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { BellRing, Check, ClipboardCopy, PackagePlus, Pencil, Ruler, ShoppingBasket, Sparkles } from "lucide-react";

import { SaathAdd } from "./add-icon";
import { useHub } from "./hub-context";
import { Btn, CardHead, Empty, Fig, Page } from "./pages";
import type { SheetSpec } from "./sheet";
import { computeKitchen, MENU_SLOTS, qty, shoppingText, type Kitchen } from "../../lib/hub/kitchen";
import { learnKitchen, rangeText, type KitchenLearning } from "../../lib/hub/learn";
import { EXPENSE_CATEGORIES, PANTRY_KINDS, PANTRY_UNITS, PEOPLE, STORES, TXN_TAGS, WEEKDAYS, labelOf, rupees, type KitchenPlan, type Meal, type Person } from "../../lib/hub/metrics";

/**
 * Kitchen — what is in the pantry and when it runs out, one-tap logging for
 * the everyday spends (rotis, milk, metro), the month's plan against what has
 * gone, and the week's menu. Identical in both repos.
 */

type Act = (body: Record<string, unknown>) => Promise<string | null>;
type Item = Kitchen["pantry"][number];
type QuickBtn = Kitchen["quicks"][number];

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const short = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const opts = (list: ReadonlyArray<{ key: string; label: string }>) => list.map((x) => ({ value: x.key, label: x.label }));
const storeName = (k: string | null) => (k ? labelOf(STORES, k) : "—");
const methods = [{ value: "upi", label: "UPI" }, { value: "cash", label: "Cash" }, { value: "card", label: "Card" }];
const num = (v: number, digits = 2) => String(Math.round(v * 10 ** digits) / 10 ** digits);

/** ₹ per kg / L / piece; per 100 g or ml for small units, which read better. */
function unitRate(price: number | null, unit: string) {
  if (price === null) return null;
  if (unit === "g" || unit === "ml") return `${rupees(price * 100)}/100 ${unit}`;
  return `${rupees(price)}/${unit}`;
}

/* ── Sheets ──────────────────────────────────────────────────────────── */
function logQuick(q: QuickBtn, act: Act, usual = q.count): SheetSpec {
  return {
    title: q.label,
    subtitle: `${rupees(q.unitPrice)} each · logged as ${labelOf(TXN_TAGS, q.tag).toLowerCase()}${usual !== q.count ? ` · ${usual} is your usual lately` : ""}.`,
    fields: [
      { name: "count", label: "How many", type: "number", value: usual, min: 1, max: 200, step: 1, required: true },
      { name: "txnDate", label: "Date", type: "date", value: today() },
      { name: "method", label: "Via", type: "select", value: "upi", options: methods },
    ],
    submit: "Log it",
    onSubmit: (v) => act({ action: "quick.use", id: q.id, ...v }),
  };
}

function editQuick(q: QuickBtn | null, act: Act): SheetSpec {
  return {
    title: q ? "Edit button" : "New one-tap button",
    subtitle: "For spends that repeat: rotis, milk, the metro to coaching, a café date.",
    fields: [
      { name: "label", label: "Name", type: "text", value: q?.label ?? "", required: true, wide: true, placeholder: "e.g. Rotis" },
      { name: "unitPrice", label: "Price each (₹)", type: "money", value: q?.unitPrice ?? "", required: true, min: 0.01 },
      { name: "count", label: "Usually how many", type: "number", value: q?.count ?? 1, min: 1, max: 50, step: 1, hint: "More than 1 asks before logging" },
      { name: "category", label: "Category", type: "select", value: q?.category ?? "food", options: opts(EXPENSE_CATEGORIES) },
      { name: "tag", label: "Exactly", type: "select", value: q?.tag ?? "groceries", options: opts(TXN_TAGS) },
    ],
    submit: q ? "Save" : "Add button",
    onSubmit: (v) => act({ action: q ? "quick.update" : "quick.add", ...(q ? { id: q.id } : {}), ...v }),
    danger: q ? { label: "Remove", confirm: `Remove the “${q.label}” button? Entries already logged stay.`, onConfirm: () => act({ action: "quick.delete", id: q.id }) } : undefined,
  };
}

function editItem(p: Item | null, me: Person, act: Act): SheetSpec {
  return {
    title: p ? `Edit ${p.name}` : "Add to the pantry",
    subtitle: "How much a day goes is what lets Saath tell you when it runs out.",
    fields: [
      { name: "name", label: "Item", type: "text", value: p?.name ?? "", required: true, wide: true, placeholder: "e.g. Basmati rice" },
      { name: "kind", label: "Shelf", type: "select", value: p?.kind ?? "staple", options: opts(PANTRY_KINDS) },
      { name: "unit", label: "Unit", type: "select", value: p?.unit ?? "kg", options: PANTRY_UNITS.map((u) => ({ value: u, label: u })) },
      ...(p ? [] : [{ name: "stock", label: "Have now", type: "number" as const, min: 0, step: 0.001, required: true }]),
      { name: "perDay", label: "Use per day", type: "number", value: p?.perDay ?? "", min: 0, step: 0.001, hint: "Rice for one: about 0.08 kg" },
      { name: "packSize", label: "Pack size", type: "number", value: p?.packSize ?? 1, min: 0.001, step: 0.001 },
      { name: "packPrice", label: "Pack price (₹)", type: "money", value: p?.packPrice ?? "", min: 0 },
      { name: "store", label: "Usually from", type: "select", value: p?.store ?? "blinkit", options: opts(STORES) },
      { name: "altPrice", label: "Same pack elsewhere (₹)", type: "money", value: p?.altPrice ?? "", min: 0, hint: "Optional — to compare" },
      { name: "altStore", label: "Elsewhere is", type: "select", value: p?.altStore ?? "", options: [{ value: "", label: "—" }, ...opts(STORES)] },
      { name: "leadDays", label: "Remind when days left", type: "number", value: p?.leadDays ?? 5, min: 0, max: 60, step: 1 },
      { name: "owner", label: "Whose", type: "select", value: p?.owner ?? me, options: [{ value: me, label: `${PEOPLE[me].name} (me)` }, { value: "joint", label: "Both of us" }] },
    ],
    submit: p ? "Save" : "Add item",
    onSubmit: (v) => act({ action: p ? "pantry.update" : "pantry.add", ...(p ? { id: p.id } : {}), ...v }),
    danger: p ? { label: "Delete", confirm: `Remove ${p.name} from the pantry?`, onConfirm: () => act({ action: "pantry.delete", id: p.id }) } : undefined,
  };
}

function restock(p: Item, act: Act): SheetSpec {
  const price = p.best.price ?? p.packPrice;
  return {
    title: `Bought ${p.name}`,
    subtitle: `${qty(p.left, p.unit)} left now. The packs are added to that, and what you paid is logged under food.`,
    fields: [
      { name: "packs", label: `Packs of ${qty(p.packSize, p.unit)}`, type: "number", value: p.packs, min: 0.5, step: 0.5, required: true },
      { name: "paid", label: "Paid in all (₹)", type: "money", value: price ? Math.round(price * p.packs) : "", min: 0, hint: "Leave empty to only update the stock" },
      { name: "store", label: "From", type: "select", value: p.best.store, options: opts(STORES) },
      { name: "txnDate", label: "Date", type: "date", value: today() },
      { name: "method", label: "Via", type: "select", value: "upi", options: methods },
    ],
    submit: "Save",
    onSubmit: (v) => act({ action: "pantry.restock", id: p.id, ...v }),
  };
}

function setLeft(p: Item, act: Act): SheetSpec {
  return {
    title: `How much ${p.name} is left?`,
    subtitle: `Saath thinks about ${qty(p.left, p.unit)}. Correct it and the countdown starts again from today.`,
    fields: [{ name: "left", label: `Left (${p.unit})`, type: "number", value: num(p.left, 3), min: 0, step: 0.001, required: true }],
    submit: "Save",
    onSubmit: (v) => act({ action: "pantry.stock", id: p.id, ...v }),
  };
}

const PLAN_BUCKETS = ["food", "transport", "fun", "health", "bills", "shopping", "study", "other"] as const;

function editPlan(plan: KitchenPlan | null, reminders: boolean, act: Act): SheetSpec {
  const rent = plan?.fixed.find((f) => f.category === "rent");
  const otherFixed = plan?.fixed.find((f) => f.category !== "rent");
  return {
    title: "Your month",
    subtitle: "What comes in, what is fixed, what you want to keep, and a limit for each kind of spend.",
    fields: [
      { name: "income", label: "Comes in each month (₹)", type: "money", value: plan?.income ?? "", min: 0, step: 100, required: true },
      { name: "rent", label: "Rent (₹)", type: "money", value: rent?.amount ?? "", min: 0, step: 100 },
      { name: "save", label: "Keep aside (₹)", type: "money", value: plan?.save ?? "", min: 0, step: 100 },
      { name: "otherFixed", label: "Other fixed (₹)", type: "money", value: otherFixed?.amount ?? "", min: 0, step: 50, hint: "Coaching instalment, subscriptions…" },
      ...PLAN_BUCKETS.map((c) => ({ name: `b_${c}`, label: `${labelOf(EXPENSE_CATEGORIES, c)} (₹)`, type: "money" as const, value: plan?.buckets[c] ?? "", min: 0, step: 50 })),
      { name: "reminders", label: "Reminders", type: "select", value: reminders ? "on" : "off", options: [{ value: "on", label: "On — 6 am stock, 9 pm habits" }, { value: "off", label: "Off" }], wide: true },
    ],
    submit: "Save plan",
    onSubmit: (v) => {
      const fixed = [
        ...(Number(v.rent) > 0 ? [{ label: "Rent", category: "rent", amount: Number(v.rent) }] : []),
        ...(Number(v.otherFixed) > 0 ? [{ label: otherFixed?.label ?? "Other fixed", category: otherFixed?.category ?? "subscriptions", amount: Number(v.otherFixed) }] : []),
      ];
      const buckets = Object.fromEntries(PLAN_BUCKETS.map((c) => [c, Number(v[`b_${c}`]) || 0]));
      return act({ action: "kitchen.set", plan: { income: Number(v.income) || 0, save: Number(v.save) || 0, fixed, buckets }, reminders: v.reminders !== "off" });
    },
  };
}

function editMenu(day: (typeof WEEKDAYS)[number], meal: Meal | null, act: Act): SheetSpec {
  return {
    title: `${day.label}'s menu`,
    fields: MENU_SLOTS.map((s) => ({ name: s.key, label: s.label, type: "text" as const, value: meal?.[s.key] ?? "", wide: true })),
    submit: "Save",
    onSubmit: (v) => act({ action: "kitchen.set", menu: { [day.key]: { b: v.b, l: v.l, d: v.d } } }),
  };
}

/* ── Pieces ──────────────────────────────────────────────────────────── */
function daysText(p: Item, L?: KitchenLearning | null) {
  const learned = L?.byId.get(p.id);
  if (learned) return rangeText(learned);
  if (p.days === null) return "not used daily";
  if (p.left <= 0) return "finished";
  if (p.days < 1) return "runs out today";
  return `${Math.round(p.days)} day${Math.round(p.days) === 1 ? "" : "s"} · till ${short(p.runOut!)}`;
}

function QuickRow({ k, L, act, onOpen, editing }: { k: Kitchen; L: KitchenLearning | null; act: Act; onOpen: (s: SheetSpec) => void; editing: boolean }) {
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tap = async (q: QuickBtn) => {
    if (editing) return onOpen(editQuick(q, act));
    const h = L?.habits.find((x) => x.id === q.id);
    if (q.count > 1) return onOpen(logQuick(q, act, h?.usualCount ?? q.count));
    setBusy(q.id);
    const err = await act({ action: "quick.use", id: q.id });
    setBusy(null);
    if (err) return alert(err);
    setDone(q.id);
    setTimeout(() => setDone((d) => (d === q.id ? null : d)), 1600);
  };
  return (
    <div className={`sth-kq ${editing ? "is-editing" : ""}`}>
      {k.quicks.map((q, i) => (
        <button key={q.id} type="button" className={`sth-kq-btn ${done === q.id ? "is-done" : ""} ${L?.missing.some((m) => m.id === q.id) ? "is-due" : ""}`} title={L?.missing.some((m) => m.id === q.id) ? "You usually log this by now" : undefined} style={{ "--i": i } as CSSProperties} disabled={busy === q.id} onClick={() => void tap(q)}>
          <b>{done === q.id ? <><Check size={14} strokeWidth={3} /> Logged</> : q.label}</b>
          <small>{q.count > 1 ? `${q.count} × ${rupees(q.unitPrice)}` : rupees(q.unitPrice)}</small>
          {editing ? <Pencil size={12} className="sth-kq-pen" /> : null}
        </button>
      ))}
      <button type="button" className="sth-kq-btn is-new" onClick={() => onOpen(editQuick(null, act))}>
        <b><SaathAdd size={14} /> New</b>
        <small>button</small>
      </button>
    </div>
  );
}

/** A glance for the Overview: today's allowance and what runs out first. */
export function KitchenGlance({ link }: { link: string }) {
  const hub = useHub();
  const k = useMemo(() => (hub.records ? computeKitchen(hub.records, hub.view) : null), [hub.records, hub.view]);
  const L = useMemo(() => (hub.records && k ? learnKitchen(hub.records, k) : null), [hub.records, k]);
  if (!k || (!k.pantry.length && !k.plan)) return null;
  const soon = k.pantry.filter((p) => p.status !== "ok" && p.status !== "idle").slice(0, 4);
  const top = L?.alerts.find((a) => a.kind !== "habit");
  return (
    <div className="sth-card">
      <CardHead title="Kitchen" link={link} />
      {k.leftToday !== null ? (
        <p className="sth-kg-big">
          <b className={k.leftToday < 0 ? "t-bad" : "t-good"}>{rupees(k.leftToday)}</b> safe to spend today
          <small>{rupees(k.budgetToday ?? 0)} a day for the {k.daysLeft} days left</small>
        </p>
      ) : null}
      {top ? <p className={`sth-kg-alert tone-${top.tone}`}><Sparkles size={13} /> {top.title}</p> : null}
      {soon.length ? (
        <ul className="sth-kg-list">
          {soon.map((p) => (
            <li key={p.id} className={`s-${p.status}`}>
              <span>{p.name}</span>
              <small>{daysText(p, L)}</small>
            </li>
          ))}
        </ul>
      ) : <p className="sth-sub">Nothing runs out this week.</p>}
    </div>
  );
}

/* ── The page ────────────────────────────────────────────────────────── */
export function HubKitchen() {
  const hub = useHub();
  const r = hub.records;
  const me = r?.actor ?? "adarsh";
  const k = useMemo(() => (r ? computeKitchen(r, hub.view) : null), [r, hub.view]);
  const L = useMemo(() => (r && k ? learnKitchen(r, k) : null), [r, k]);
  const reminders = k ? r?.kitchen?.[k.person]?.reminders !== false : true;
  const istHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const notices = L ? L.alerts.filter((a) => a.slot === "morning" || istHour >= 12) : [];
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const act = hub.act;
  const open = hub.openSheet;
  const own = k?.person === me;
  const canEdit = (p: Item) => p.owner === me || p.owner === "joint";

  const empty = k ? !k.pantry.length && !k.quicks.length && !k.plan && !k.hasMenu : false;
  const foodPace = k && k.foodLimit ? (k.food / Math.max(1, k.dayOfMonth)) * k.daysInMonth : null;
  const kinds = k ? PANTRY_KINDS.map((kd) => ({ ...kd, rows: k.pantry.filter((p) => p.kind === kd.key) })).filter((g) => g.rows.length) : [];
  const tagMax = k ? Math.max(1, ...k.byTag.map((t) => t.amount), k.untaggedFood) : 1;

  return (
    <Page
      title="Kitchen"
      summary={k ? `${rupees(k.food)} on food this month · ${rupees(k.foodPerDay)} a day${k.nextOut && k.nextOut.days !== null ? ` · ${k.nextOut.name.toLowerCase()} lasts ${Math.max(0, Math.round(k.nextOut.days))} more days` : ""}` : undefined}
      actions={k && !empty ? <><Btn primary onClick={() => open(editItem(null, me, act))} icon={<SaathAdd size={16} />}>Item</Btn><Btn onClick={() => open(editPlan(k.plan, reminders, act))} icon={<Ruler size={15} />}>Plan</Btn></> : undefined}
    >
      {k && r ? (
        empty ? (
          own ? (
            <Empty
              boxed
              title="Set up the kitchen"
              actions={
                <>
                  <Btn
                    primary
                    onClick={async () => {
                      setSeeding(true);
                      const err = await act({ action: "kitchen.seed" });
                      setSeeding(false);
                      if (err) alert(err);
                    }}
                    icon={<PackagePlus size={15} />}
                  >
                    {seeding ? "Setting up…" : "Start with the Delhi student list"}
                  </Btn>
                  <Btn onClick={() => open(editItem(null, me, act))} icon={<SaathAdd size={15} />}>Add an item</Btn>
                </>
              }
            >
              The starting list holds 25 staples with today&apos;s Blinkit prices and everyday use for one person, ten one-tap buttons (rotis, milk, metro, café), a month plan and a week&apos;s menu. Change anything afterwards.
            </Empty>
          ) : <Empty boxed title={`${PEOPLE[k.person].name} hasn't set up a kitchen yet`} />
        ) : (
          <>
            <section className="sth-figs is-row">
              <Fig
                label="Safe to spend today"
                value={k.leftToday === null ? "—" : rupees(k.leftToday)}
                tone={k.leftToday === null ? undefined : k.leftToday < 0 ? "bad" : "good"}
                note={k.budgetToday === null ? "log this month's income or set a plan" : `${rupees(k.budgetToday)} a day for ${k.daysLeft} days${k.incomeLogged ? "" : " · income from plan"}`}
              />
              <Fig
                label="Food this month"
                value={rupees(k.food)}
                tone={foodPace !== null && k.foodLimit ? (foodPace > k.foodLimit * 1.05 ? "warn" : "good") : undefined}
                note={k.foodLimit ? `of ${rupees(k.foodLimit)} · heading to ${rupees(foodPace ?? 0)}` : `${rupees(k.foodPerDay)} a day`}
              />
              {L?.forecastSaving !== null && L?.forecastSaving !== undefined ? (
                <Fig
                  label="You'll keep"
                  value={rupees(L.forecastSaving)}
                  tone={L.forecastSaving >= k.save ? "good" : L.forecastSaving >= 0 ? "warn" : "bad"}
                  note={`aim ${rupees(k.save)} · forecast from your last 8 weeks`}
                />
              ) : (
                <Fig
                  label="You'll keep"
                  value={k.plan ? rupees(k.projectedSaving) : "—"}
                  tone={!k.plan ? undefined : k.projectedSaving >= k.save ? "good" : k.projectedSaving >= 0 ? "warn" : "bad"}
                  note={k.plan ? `aim ${rupees(k.save)} · if every limit holds` : "set a month plan"}
                />
              )}
              <Fig
                label="Runs out next"
                value={k.nextOut && k.nextOut.days !== null ? `${Math.max(0, Math.round(k.nextOut.days))} days` : "—"}
                tone={k.nextOut && k.nextOut.status !== "ok" ? "warn" : undefined}
                note={k.nextOut ? k.nextOut.name : "add pantry items"}
              />
            </section>

            {notices.length ? (
              <section className="sth-sect sth-knotice" aria-label="Saath noticed">
                <header>
                  <Sparkles size={15} /> <b>Saath noticed</b>
                  <small>{reminders ? <><BellRing size={12} /> reminders on · 6 am & 9 pm</> : "reminders off"}{L && L.learnedCount ? ` · learned ${L.learnedCount} item${L.learnedCount === 1 ? "" : "s"}` : ""}</small>
                </header>
                <ul>
                  {notices.map((a, i) => (
                    <li key={a.key} className={`tone-${a.tone}`} style={{ "--i": i } as CSSProperties}>
                      <b>{a.title}</b>
                      <span>{a.body}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {own ? (
              <section className="sth-sect sth-card">
                <CardHead title="One-tap log">
                  <button type="button" className="sth-more" onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</button>
                </CardHead>
                <QuickRow k={k} L={L} act={act} onOpen={open} editing={editing} />
              </section>
            ) : null}

            <section className="sth-sect sth-cards">
              <div className="sth-card">
                <CardHead title="Shopping list">
                  {k.toBuy.length ? (
                    <button
                      type="button"
                      className="sth-more"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shoppingText(k));
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1600);
                        } catch {
                          alert(shoppingText(k));
                        }
                      }}
                    >
                      {copied ? "Copied" : <><ClipboardCopy size={13} /> Copy</>}
                    </button>
                  ) : null}
                </CardHead>
                {L?.order ? (
                  <p className="sth-korder">
                    <b>{L.order.days === 0 ? "Order today" : L.order.days === 1 ? "Order tomorrow" : `Next order ${short(L.order.date)}`}</b>
                    <span>{L.order.items.length} item{L.order.items.length === 1 ? "" : "s"} · about {rupees(L.order.total)}{L.order.coversUntil ? ` · then nothing runs out until ${short(L.order.coversUntil)}` : ""}</span>
                    <small>{L.order.items.map((i) => i.name).join(", ")}</small>
                  </p>
                ) : null}
                {k.toBuy.length ? (
                  <>
                    {k.byStore.map((s) => (
                      <div key={s.key} className="sth-shop">
                        <h3 className="sth-h3">{s.label} <span>{rupees(s.total)}</span></h3>
                        <ul>
                          {s.rows.map((p) => (
                            <li key={p.id} className={`s-${p.status}`}>
                              <span><b>{p.name}</b><small>{p.packs} × {qty(p.packSize, p.unit)} · {p.left <= 0 ? "finished" : `${qty(p.left, p.unit)} left`}</small></span>
                              <span className="sth-shop-price">{p.best.price ? rupees(p.best.price * p.packs) : "—"}</span>
                              {canEdit(p) ? <button type="button" className="sth-btn is-sm" onClick={() => open(restock(p, act))}><ShoppingBasket size={13} /> Bought</button> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <p className="sth-sub">About <b>{rupees(k.shopTotal)}</b> to cover the next month of these.</p>
                  </>
                ) : <p className="sth-sub">Nothing is running low.{k.pantry.length ? ` The kitchen costs about ${rupees(k.kitchenPerDay)} a day to run.` : ""}</p>}
                {k.savingsElsewhere >= 30 ? <p className="sth-sub">Buying the marked items at the cheaper place saves about <b>{rupees(k.savingsElsewhere)}</b> a month.</p> : null}
              </div>

              <div className="sth-card">
                <CardHead title="This month against the plan">
                  {own ? <button type="button" className="sth-more" onClick={() => open(editPlan(k.plan, reminders, act))}>{k.plan ? "Edit" : "Set"}</button> : null}
                </CardHead>
                {k.plan ? (
                  <>
                    <ul className="sth-kplan">
                      {k.fixed.map((f) => (
                        <li key={f.label} className={f.pending ? "" : "is-paid"}>
                          <span>{f.label}</span>
                          <i className="sth-kplan-bar" style={{ "--p": Math.min(1, f.paid / Math.max(1, f.amount)) } as CSSProperties}><i /></i>
                          <small>{f.pending ? `${rupees(f.pending)} due` : "paid"}</small>
                        </li>
                      ))}
                      {k.buckets.map((b) => (
                        <li key={b.key} className={b.over ? "is-over" : ""}>
                          <span>{b.label}</span>
                          <i className="sth-kplan-bar" style={{ "--p": b.limit ? Math.min(1, b.used / b.limit) : 1, "--q": b.limit ? Math.min(1, b.pace / b.limit) : 0 } as CSSProperties}><i /><em /></i>
                          <small>{rupees(b.used)}{b.limit ? ` / ${rupees(b.limit)}` : " · no limit"}</small>
                        </li>
                      ))}
                    </ul>
                    <p className="sth-sub">
                      {rupees(k.income)} in · keep {rupees(k.save)} · projected {rupees(k.projectedSaving)} left at month end.
                      {own ? <> <button type="button" className="sth-link" onClick={async () => { const err = await act({ action: "kitchen.budgets" }); if (err) alert(err); }}>Use these limits as Money budgets</button></> : null}
                    </p>
                  </>
                ) : <p className="sth-sub">A plan turns income, rent and limits into a daily allowance and a month-end saving.</p>}
              </div>

              <div className="sth-card">
                <CardHead title="Where it went" />
                {k.byTag.length || k.untaggedFood ? (
                  <ul className="sth-ktags">
                    {k.byTag.map((t) => (
                      <li key={t.key} className={`c-${t.category}`} style={{ "--p": t.amount / tagMax } as CSSProperties}>
                        <span>{t.label}</span>
                        <i><i /></i>
                        <b>{rupees(t.amount)}</b>
                      </li>
                    ))}
                    {k.untaggedFood ? (
                      <li className="c-food is-plain" style={{ "--p": k.untaggedFood / tagMax } as CSSProperties}>
                        <span>Food, not split</span>
                        <i><i /></i>
                        <b>{rupees(k.untaggedFood)}</b>
                      </li>
                    ) : null}
                  </ul>
                ) : <p className="sth-sub">One-tap logs and pantry purchases show up here, split into rotis, milk, groceries, travel and dates.</p>}
              </div>

              <div className="sth-card">
                <CardHead title="This week's menu" />
                <ul className="sth-kmenu">
                  {k.menu.map((d) => (
                    <li key={d.key} className={d.today ? "is-today" : ""}>
                      <button type="button" disabled={!own} onClick={() => open(editMenu(d, d.meal, act))} aria-label={`Edit ${d.label}'s menu`}>
                        <b>{d.label.slice(0, 3)}</b>
                        {MENU_SLOTS.map((s) => <span key={s.key}><small>{s.label}</small>{d.meal?.[s.key] || "—"}</span>)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="sth-sect sth-card">
              <CardHead title={`Pantry · ${k.pantry.length} item${k.pantry.length === 1 ? "" : "s"}`}>
                {own ? <button type="button" className="sth-more" onClick={() => open(editItem(null, me, act))}>Add</button> : null}
              </CardHead>
              {k.pantry.length ? (
                kinds.map((g) => (
                  <div key={g.key} className="sth-pan-group">
                    <h3 className="sth-h3">{g.label}</h3>
                    <ul className="sth-pan">
                      {g.rows.map((p, i) => (
                        <li key={p.id} className={`s-${p.status}`} style={{ "--p": p.share, "--i": i } as CSSProperties}>
                          <span className="sth-pan-name">
                            <b>
                              {p.name}
                              {p.owner === "joint" ? <span className="sth-pill">shared</span> : null}
                              {L?.byId.get(p.id)?.learned ? <span className="sth-pill is-learned" title={`Learned from ${L.byId.get(p.id)!.checks} check${L.byId.get(p.id)!.checks === 1 ? "" : "s"}`}>learned</span> : null}
                            </b>
                            <small>{qty(p.left, p.unit)} left · {daysText(p, L)}</small>
                            {(() => {
                              const x = L?.byId.get(p.id);
                              const bits = [
                                x?.drift !== null && x?.drift !== undefined && Math.abs(x.drift) >= 0.15 ? `you use ${Math.round(Math.abs(x.drift) * 100)}% ${x.drift > 0 ? "more" : "less"} than you set` : null,
                                x?.rhythm ? `bought every ~${Math.round(x.rhythm.every)} days` : null,
                              ].filter(Boolean);
                              return bits.length ? <small className="sth-pan-learn">{bits.join(" · ")}</small> : null;
                            })()}
                          </span>
                          <i className="sth-pan-bar"><i /></i>
                          <span className="sth-pan-price">
                            {unitRate(p.unitPrice, p.unit) ?? "—"}
                            <small>{storeName(p.store)}{p.altPrice && p.packPrice && p.altPrice < p.packPrice ? ` · ${rupees(p.packPrice - p.altPrice)} less at ${storeName(p.altStore)}` : ""}</small>
                            {L?.byId.get(p.id)?.priceUp ? <small className="t-warn">last bought {Math.round(L.byId.get(p.id)!.priceUp! * 100)}% above your usual</small> : null}
                            {L?.byId.get(p.id)?.cheapest && L.byId.get(p.id)!.cheapest!.key !== p.store ? <small>usually cheapest at {L.byId.get(p.id)!.cheapest!.label}</small> : null}
                          </span>
                          {canEdit(p) ? (
                            <span className="sth-pan-acts">
                              <button type="button" className="sth-btn is-sm" onClick={() => open(restock(p, act))}>Bought</button>
                              <button type="button" className="sth-btn is-sm" onClick={() => open(setLeft(p, act))}>Left?</button>
                              {p.left > 0 && p.perDay > 0 ? (
                                <button type="button" className="sth-btn is-sm" title="It's finished — Saath learns how fast it goes" onClick={async () => { if (!confirm(`${p.name} is finished?`)) return; const err = await act({ action: "pantry.out", id: p.id }); if (err) alert(err); }}>Finished</button>
                              ) : null}
                              <button type="button" className="sth-btn is-sm is-icon" aria-label={`Edit ${p.name}`} onClick={() => open(editItem(p, me, act))}><Pencil size={13} /></button>
                            </span>
                          ) : <span />}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : <p className="sth-sub">Add what you keep at home; each item counts down from how much a day goes.</p>}
            </section>
          </>
        )
      ) : null}
    </Page>
  );
}
