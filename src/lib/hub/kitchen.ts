/**
 * Saath kitchen — pantry stock, one-tap spends, the month's plan and the menu.
 * Pure and deterministic like metrics.ts, and identical in both repos.
 *
 * Stock is never counted by hand: each item stores how much there was at
 * `stockAt` and how much a day goes, so what is left today, the run-out date
 * and the shopping list all follow from the clock.
 */

import { EXPENSE_CATEGORIES, PANTRY_KINDS, STORES, TXN_TAGS, WEEKDAYS, labelOf, type HubRecords, type KitchenPlan, type Meal, type Pantry, type Person, type View } from "./metrics";

const DAY = 86_400_000;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const round = (v: number, step: number) => Math.round(v / step) * step;

/** What is left of an item right now. */
export function pantryLeft(p: Pick<Pantry, "stock" | "stockAt" | "perDay">, now = new Date()) {
  const days = Math.max(0, (now.getTime() - Date.parse(p.stockAt)) / DAY);
  return Math.max(0, p.stock - p.perDay * days);
}

/** "2.1 kg", "350 g", "4 pcs". */
export function qty(v: number, unit: string) {
  if (unit === "kg" && v < 0.995 && v > 0) return `${Math.round(v * 1000)} g`;
  if (unit === "L" && v < 0.995 && v > 0) return `${Math.round(v * 1000)} ml`;
  const digits = unit === "kg" || unit === "L" ? 1 : 0;
  return `${v.toFixed(digits).replace(/\.0$/, "")} ${unit}`;
}

/** Price of one unit (₹ per kg, per L…) at a pack price. */
const perUnit = (price: number | null, size: number) => (price && size > 0 ? price / size : null);

export const MENU_SLOTS = [
  { key: "b", label: "Breakfast" },
  { key: "l", label: "Lunch" },
  { key: "d", label: "Dinner" },
] as const;

export function computeKitchen(r: HubRecords, view: View = "all", now = new Date()) {
  const person: Person = view === "all" ? r.actor : view;
  const today = istDay(now);
  const month = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const daysLeft = daysInMonth - dayOfMonth + 1;
  const settings = r.kitchen?.[person] ?? {};
  const plan: KitchenPlan | null = settings.plan ?? null;

  /* ── Pantry ──────────────────────────────────────────────────────────── */
  const pantry = (r.pantry ?? [])
    .filter((p) => p.owner === person || p.owner === "joint")
    .map((p) => {
      const left = pantryLeft(p, now);
      const days = p.perDay > 0 ? left / p.perDay : null;
      const runOut = days === null ? null : istDay(new Date(now.getTime() + days * DAY));
      const status: "out" | "low" | "ok" | "idle" = days === null ? (left <= 0 ? "out" : "idle") : left <= 0 ? "out" : days <= p.leadDays ? "low" : "ok";
      const unitPrice = perUnit(p.packPrice, p.packSize);
      const altUnit = perUnit(p.altPrice, p.packSize);
      // The cheaper of the two places you buy it, per pack.
      const best = p.altPrice && p.packPrice && p.altPrice < p.packPrice ? { price: p.altPrice, store: p.altStore ?? "other" } : { price: p.packPrice, store: p.store };
      const costPerDay = unitPrice !== null ? unitPrice * p.perDay : null;
      // Enough packs to last a month from now, at least one.
      const packs = Math.max(1, Math.ceil(Math.max(0, p.perDay * 30 - left) / Math.max(p.packSize, 1e-9)));
      return { ...p, left, days, runOut, status, unitPrice, altUnit, best, costPerDay, packs, kindLabel: labelOf(PANTRY_KINDS, p.kind), share: days === null ? 1 : Math.min(1, days / 30) };
    })
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999) || a.name.localeCompare(b.name));

  const toBuy = pantry.filter((p) => p.status === "out" || p.status === "low");
  const byStore = STORES.map((s) => {
    const rows = toBuy.filter((p) => p.best.store === s.key);
    return { ...s, rows, total: sum(rows.map((p) => (p.best.price ?? 0) * p.packs)) };
  }).filter((s) => s.rows.length);
  const shopTotal = sum(byStore.map((s) => s.total));
  const savingsElsewhere = sum(pantry.map((p) => (p.altPrice && p.packPrice ? Math.max(0, p.packPrice - p.altPrice) * Math.max(0, (p.perDay * 30) / Math.max(p.packSize, 1e-9)) : 0)));
  const kitchenPerDay = sum(pantry.map((p) => p.costPerDay ?? 0));
  const nextOut = pantry.find((p) => p.days !== null) ?? null;

  /* ── This month's spending, by what it was ───────────────────────────── */
  const mine = r.txns.filter((t) => t.owner === person && t.txnDate.startsWith(month));
  const spent = sum(mine.filter((t) => t.kind === "expense").map((t) => t.amount));
  const spentToday = sum(mine.filter((t) => t.kind === "expense" && t.txnDate === today).map((t) => t.amount));
  const incomeLogged = sum(mine.filter((t) => t.kind === "income").map((t) => t.amount));
  const income = incomeLogged > 0 ? incomeLogged : plan?.income ?? 0;
  const byTag = TXN_TAGS.map((t) => ({ ...t, amount: sum(mine.filter((x) => x.kind === "expense" && x.tag === t.key).map((x) => x.amount)) })).filter((t) => t.amount > 0);
  const untaggedFood = sum(mine.filter((x) => x.kind === "expense" && x.category === "food" && !x.tag).map((x) => x.amount));
  const catSpent = (c: string) => sum(mine.filter((t) => t.kind === "expense" && t.category === c).map((t) => t.amount));
  const food = catSpent("food");
  const foodDays = Math.max(1, dayOfMonth);

  /* ── The plan: fixed costs, limits, what to keep ─────────────────────── */
  const fixed = (plan?.fixed ?? []).map((f) => {
    const paid = catSpent(f.category);
    return { ...f, paid, pending: Math.max(0, f.amount - paid) };
  });
  const fixedCats = new Set(fixed.map((f) => f.category));
  const save = plan?.save ?? 0;
  const buckets = EXPENSE_CATEGORIES.filter((c) => !fixedCats.has(c.key)).map((c) => {
    const limit = plan?.buckets[c.key] ?? 0;
    const used = catSpent(c.key);
    const pace = dayOfMonth ? (used / dayOfMonth) * daysInMonth : used;
    return { ...c, limit, used, pace, left: limit - used, over: limit > 0 && pace > limit * 1.02 };
  }).filter((b) => b.limit > 0 || b.used > 0);
  // Month-end if every category ends at its limit or its pace, whichever is higher; fixed costs at plan.
  const projectedVariable = sum(buckets.map((b) => Math.max(b.used, b.limit > 0 ? Math.max(b.limit, Math.min(b.pace, b.limit * 3)) : b.pace)));
  const projectedFixed = sum(fixed.map((f) => Math.max(f.amount, f.paid)));
  const projectedSaving = income - projectedFixed - projectedVariable;
  // Safe to spend per day: what is left for everyday spending once fixed costs (rent…) and savings are
  // set aside, spread over the days remaining (today included). Fixed costs never count against a day.
  const variable = mine.filter((t) => t.kind === "expense" && !fixedCats.has(t.category));
  const variableToday = sum(variable.filter((t) => t.txnDate === today).map((t) => t.amount));
  const variableBefore = sum(variable.map((t) => t.amount)) - variableToday;
  const pool = income - sum(fixed.map((f) => Math.max(f.amount, f.paid))) - save;
  const budgetToday = income > 0 ? (pool - variableBefore) / daysLeft : null;
  const leftToday = budgetToday === null ? null : budgetToday - variableToday;

  /* ── Menu ────────────────────────────────────────────────────────────── */
  const wd = WEEKDAYS[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7].key;
  const menu = WEEKDAYS.map((d) => ({ ...d, meal: (settings.menu?.[d.key] ?? null) as Meal | null, today: d.key === wd }));

  return {
    person,
    today,
    daysLeft,
    dayOfMonth,
    daysInMonth,
    pantry,
    toBuy,
    byStore,
    shopTotal: round(shopTotal, 1),
    savingsElsewhere,
    kitchenPerDay,
    kitchenMonth: kitchenPerDay * 30,
    nextOut,
    spent,
    spentToday,
    income,
    incomeLogged: incomeLogged > 0,
    food,
    foodPerDay: food / foodDays,
    foodLimit: plan?.buckets.food ?? null,
    byTag,
    untaggedFood,
    plan,
    fixed,
    buckets,
    save,
    projectedSaving,
    budgetToday,
    leftToday,
    menu,
    hasMenu: menu.some((d) => d.meal && (d.meal.b || d.meal.l || d.meal.d)),
    quicks: (r.quicks ?? []).filter((q) => q.owner === person).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label)),
  };
}

export type Kitchen = ReturnType<typeof computeKitchen>;

/** A plain-text shopping list for WhatsApp or a quick-commerce search. */
export function shoppingText(k: Kitchen) {
  const lines: string[] = [];
  for (const s of k.byStore) {
    lines.push(`${s.label}`);
    for (const p of s.rows) lines.push(`• ${p.name} — ${p.packs} × ${qty(p.packSize, p.unit)}${p.best.price ? ` (≈ ₹${Math.round(p.best.price * p.packs)})` : ""}`);
    lines.push("");
  }
  lines.push(`Total ≈ ₹${Math.round(k.shopTotal).toLocaleString("en-IN")}`);
  return lines.join("\n");
}

/* ── A starting kitchen: a student cooking for one in Delhi (Blinkit prices, Oct 2026).
   The pantry holds what lasts a week or more; milk, bread, curd and fresh sabzi are one-tap logs. ── */
type SeedItem = Omit<Pantry, "id" | "owner" | "stockAt" | "leadDays" | "altPrice" | "altStore"> & { leadDays?: number; altPrice?: number; altStore?: string };
export const SEED_PANTRY: SeedItem[] = [
  { name: "Basmati rice (everyday)", kind: "staple", unit: "kg", stock: 5, perDay: 0.08, packSize: 5, packPrice: 397, store: "blinkit" },
  { name: "Mustard oil", kind: "staple", unit: "L", stock: 0.91, perDay: 0.025, packSize: 0.91, packPrice: 204, store: "blinkit" },
  { name: "Ghee", kind: "staple", unit: "L", stock: 0.5, perDay: 0.005, packSize: 0.5, packPrice: 325, store: "blinkit", leadDays: 10 },
  { name: "Sugar", kind: "staple", unit: "kg", stock: 1, perDay: 0.02, packSize: 1, packPrice: 73, store: "blinkit" },
  { name: "Salt", kind: "staple", unit: "kg", stock: 1, perDay: 0.008, packSize: 1, packPrice: 29, store: "blinkit" },
  { name: "Pasta", kind: "staple", unit: "g", stock: 800, perDay: 25, packSize: 800, packPrice: 99, store: "blinkit" },
  { name: "Toor daal", kind: "pulse", unit: "kg", stock: 1, perDay: 0.03, packSize: 1, packPrice: 171, store: "blinkit" },
  { name: "Moong daal (dhuli)", kind: "pulse", unit: "kg", stock: 1, perDay: 0.025, packSize: 1, packPrice: 124, store: "blinkit" },
  { name: "Whole moong (sprouts)", kind: "pulse", unit: "kg", stock: 1, perDay: 0.025, packSize: 0.5, packPrice: 83, store: "blinkit" },
  { name: "Kala chana", kind: "pulse", unit: "kg", stock: 1, perDay: 0.02, packSize: 1, packPrice: 122, store: "blinkit" },
  { name: "Soya chunks", kind: "pulse", unit: "g", stock: 400, perDay: 15, packSize: 200, packPrice: 46, store: "blinkit" },
  { name: "Butter", kind: "dairy", unit: "g", stock: 100, perDay: 8, packSize: 100, packPrice: 66, store: "blinkit" },
  { name: "Cheese slices", kind: "dairy", unit: "g", stock: 200, perDay: 6, packSize: 200, packPrice: 115, store: "blinkit" },
  { name: "Onion", kind: "veg", unit: "kg", stock: 2, perDay: 0.1, packSize: 1, packPrice: 64, store: "blinkit", altPrice: 45, altStore: "mandi", leadDays: 3 },
  { name: "Tomato", kind: "veg", unit: "kg", stock: 1, perDay: 0.07, packSize: 1, packPrice: 50, store: "blinkit", altPrice: 40, altStore: "mandi", leadDays: 3 },
  { name: "Potato", kind: "veg", unit: "kg", stock: 2, perDay: 0.08, packSize: 1, packPrice: 24, store: "blinkit", altPrice: 22, altStore: "mandi", leadDays: 3 },
  { name: "Amul Pro (malt drink)", kind: "breakfast", unit: "g", stock: 500, perDay: 15, packSize: 500, packPrice: 170, store: "blinkit" },
  { name: "Almonds", kind: "breakfast", unit: "g", stock: 500, perDay: 8, packSize: 500, packPrice: 551, store: "blinkit", leadDays: 7 },
  { name: "Peanuts", kind: "breakfast", unit: "g", stock: 500, perDay: 15, packSize: 500, packPrice: 111, store: "blinkit" },
  { name: "Poha", kind: "breakfast", unit: "g", stock: 500, perDay: 12, packSize: 500, packPrice: 57, store: "blinkit" },
  { name: "Sattu", kind: "breakfast", unit: "g", stock: 500, perDay: 15, packSize: 500, packPrice: 97, store: "blinkit" },
  { name: "Haldi, mirch, dhaniya", kind: "spice", unit: "g", stock: 300, perDay: 3, packSize: 300, packPrice: 150, store: "local", leadDays: 10 },
  { name: "Jeera", kind: "spice", unit: "g", stock: 100, perDay: 1.2, packSize: 100, packPrice: 45, store: "blinkit", leadDays: 10 },
  { name: "Hing", kind: "spice", unit: "g", stock: 25, perDay: 0.1, packSize: 25, packPrice: 50, store: "blinkit", leadDays: 15 },
  { name: "Elaichi", kind: "spice", unit: "g", stock: 20, perDay: 0.15, packSize: 20, packPrice: 108, store: "blinkit", leadDays: 15 },
];

export const SEED_QUICKS = [
  { label: "Rotis", unitPrice: 5, count: 5, category: "food", tag: "rotis" },
  { label: "Milk 500 ml", unitPrice: 30, count: 1, category: "food", tag: "dairy" },
  { label: "Curd 1 kg", unitPrice: 80, count: 1, category: "food", tag: "dairy" },
  { label: "Bread", unitPrice: 65, count: 1, category: "food", tag: "dairy" },
  { label: "Sabzi & fruit", unitPrice: 100, count: 1, category: "food", tag: "veggies" },
  { label: "Paneer 200 g", unitPrice: 95, count: 1, category: "food", tag: "dairy" },
  { label: "Chai / snack", unitPrice: 20, count: 1, category: "food", tag: "eatout" },
  { label: "Metro · coaching", unitPrice: 21, count: 2, category: "transport", tag: "commute" },
  { label: "Metro · South Ex", unitPrice: 39, count: 2, category: "transport", tag: "visit" },
  { label: "Café date", unitPrice: 800, count: 1, category: "fun", tag: "date" },
  { label: "Protection", unitPrice: 321, count: 1, category: "health", tag: "care" },
];

/** Adarsh's month (₹20,000 from home, ₹13,500 rent, keep ₹1,000). Misti starts empty and fills her own. */
export const SEED_PLAN: Record<Person, KitchenPlan | null> = {
  adarsh: {
    income: 20000,
    fixed: [{ label: "Rent", category: "rent", amount: 13500 }],
    save: 1000,
    buckets: { food: 3000, transport: 1000, fun: 1200, health: 400, bills: 300, shopping: 250, other: 300 },
  },
  misti: null,
};

export const SEED_MENU: Record<(typeof WEEKDAYS)[number]["key"], Meal> = {
  mon: { b: "Milk + Amul Pro, bread-butter, moong sprouts chaat, 6 almonds", l: "Rice, toor daal, aloo-gobhi, curd", d: "5 rotis, soya chunk curry" },
  tue: { b: "Poha with peanuts, milk", l: "Moong khichdi, raita, cucumber", d: "5 rotis, seasonal sabzi, daal" },
  wed: { b: "Milk, bread, kala chana chaat, almonds", l: "Rice, kala chana curry, salad", d: "5 rotis, mixed veg, curd" },
  thu: { b: "Sattu–lemon–jeera drink, bread-butter", l: "Rice, moong tadka, aloo-palak", d: "5 rotis, soya bhurji" },
  fri: { b: "Milk + Amul Pro, sprouts chaat, almonds", l: "Veg pulao, raita", d: "Rotis, paneer bhurji (partner day)" },
  sat: { b: "Cheese toast, milk", l: "Veg pasta with cheese", d: "5 rotis, aloo-matar, curd" },
  sun: { b: "Poha, milk", l: "Rice, daal, paneer (weekly treat)", d: "Light khichdi or out together" },
};
