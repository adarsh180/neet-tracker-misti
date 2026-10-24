/**
 * Saath's learning — small statistical models, no language model. Every
 * number they produce can be traced back to logged data, and they improve
 * with every purchase, count and one-tap log. Pure and identical in both repos;
 * the page shows the result and the daily jobs turn it into reminders.
 *
 *  1. Consumption — a Kalman filter per pantry item. Each "how much is left?"
 *     or "finished" corrects the daily-use rate and its uncertainty, so run-out
 *     dates come with a range, and the reminder uses the cautious end of it.
 *  2. Refill rhythm — median and spread of the days between purchases.
 *  3. Habits — a Beta–Bernoulli model per one-tap button and weekday
 *     (shrunk towards the button's overall rate), plus the usual count.
 *  4. Spending forecast — weekday averages of the last eight weeks, shrunk
 *     towards the overall daily average, with outlier days capped.
 *  5. Unusual spends — robust z-scores (median and MAD) per category.
 *  6. Prices — what each item usually costs, per store, from your purchases.
 *  7. Next order — the single order date that covers everything running out
 *     soon, so there are fewer, fuller trips (and fewer small-cart fees).
 */

import { EXPENSE_CATEGORIES, STORES, TXN_TAGS, labelOf, rupees, type HubRecords, type Person, type Quick } from "./metrics";
import type { Kitchen } from "./kitchen";

const DAY = 86_400_000;
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const dateAdd = (iso: string, days: number) => istDay(new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY));
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mad = (xs: number[], med = median(xs)) => median(xs.map((x) => Math.abs(x - med)));
const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/* ── 1. Consumption: Kalman filter on the daily-use rate ──────────────── */
export type RateState = { rate: number; variance: number };

/** Uncertainty before anything is measured: half the rate you set (or a sliver of a pack). */
export const priorVariance = (rate: number, packSize: number) => Math.max(rate * 0.5, packSize * 0.004, 1e-6) ** 2;

/**
 * One measured interval: `used` went in `days` since the last anchor. Counting is
 * good to about 3% of a pack; an anchor that was itself estimated (a purchase added
 * to Saath's guess of what was left) carries another ~12%.
 */
export function kalmanStep(prev: RateState, obs: { used: number; days: number; anchorMeasured: boolean; packSize: number }) {
  const days = Math.max(0.5, obs.days);
  const z = Math.max(0, obs.used) / days;
  // Predict: habits drift slowly — about 3% of the rate a day.
  const p = prev.variance + (0.03 * Math.max(prev.rate, z, 1e-6)) ** 2 * days;
  const sigma = obs.packSize * (0.03 + (obs.anchorMeasured ? 0 : 0.12));
  const r = (sigma / days) ** 2;
  const k = p / (p + r);
  return { rate: Math.max(0, prev.rate + k * (z - prev.rate)), variance: Math.max(1e-12, (1 - k) * p), observed: z, gain: k };
}

export type KitchenAlert = { key: string; kind: "stock" | "order" | "budget" | "unusual" | "habit"; tone: "warn" | "bad" | "good"; slot: "morning" | "evening"; title: string; body: string; items?: string[] };

export function learnKitchen(r: HubRecords, k: Kitchen, now = new Date()) {
  const person: Person = k.person;
  const today = k.today;
  const logs = (r.pantryLog ?? []).filter((l) => l.owner === person || k.pantry.some((p) => p.id === l.itemId));

  /* ── Items: learned rate, run-out range, refill rhythm, prices ─────── */
  const items = k.pantry.map((p) => {
    const sd = p.rateVar ? Math.sqrt(p.rateVar) : p.perDay * 0.5;
    const hi = p.perDay + 1.28 * sd; // cautious (80%) end
    const lo = Math.max(p.perDay * 0.3, p.perDay - 1.28 * sd);
    const soonDays = p.perDay > 0 ? p.left / hi : null;
    const lateDays = p.perDay > 0 ? p.left / lo : null;
    const learned = (p.obsCount ?? 0) > 0;
    const drift = learned && p.basePerDay ? p.perDay / p.basePerDay - 1 : null;
    const mine = logs.filter((l) => l.itemId === p.id).sort((a, b) => a.at.localeCompare(b.at));
    const buys = mine.filter((l) => l.kind === "restock");
    const gaps = buys.slice(1).map((b, i) => (Date.parse(b.at) - Date.parse(buys[i].at)) / DAY).filter((g) => g >= 0.5);
    const rhythm = gaps.length >= 2 ? { every: median(gaps), spread: mad(gaps), n: gaps.length } : null;
    const priced = buys.filter((b) => b.unitPrice && b.unitPrice > 0);
    const usual = priced.length >= 2 ? median(priced.map((b) => b.unitPrice!)) : null;
    const last = priced.at(-1)?.unitPrice ?? null;
    const byStore = STORES.map((s) => ({ key: s.key, label: s.label, price: median(priced.filter((b) => b.store === s.key).map((b) => b.unitPrice!)) })).filter((s) => s.price > 0);
    const cheapest = byStore.length > 1 ? byStore.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    const priceUp = usual && last && last > usual * 1.1 ? last / usual - 1 : null;
    return { id: p.id, name: p.name, item: p, sd, soonDays, lateDays, learned, checks: p.obsCount ?? 0, drift, rhythm, usual, last, cheapest, priceUp };
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  /* ── 7. Next order: one date that covers everything running out soon ── */
  const upcoming = items.filter((i) => i.soonDays !== null).sort((a, b) => a.soonDays! - b.soonDays!);
  let order: { date: string; days: number; items: typeof items; total: number; coversUntil: string | null } | null = null;
  if (upcoming.length) {
    const first = upcoming[0];
    const orderIn = Math.max(0, Math.floor(first.soonDays! - Math.max(1, first.item.leadDays * 0.5)));
    if (orderIn <= 14) {
      // Anything that would run out within a week of the order goes in the same order.
      const horizon = orderIn + 7;
      const basket = upcoming.filter((i) => i.soonDays! <= horizon);
      const rest = upcoming.find((i) => i.soonDays! > horizon);
      const total = sum(basket.map((i) => (i.item.best.price ?? 0) * i.item.packs));
      order = { date: dateAdd(today, orderIn), days: orderIn, items: basket, total, coversUntil: rest ? dateAdd(today, Math.floor(rest.soonDays!)) : null };
    }
  }

  /* ── 3. Habits: Beta–Bernoulli per button and weekday ──────────────── */
  const quickTxns = r.txns.filter((t) => t.owner === person && t.kind === "expense" && t.quickId);
  const windowStart = dateAdd(today, -56);
  const habits = k.quicks.map((q: Quick) => {
    const uses = quickTxns.filter((t) => t.quickId === q.id && t.txnDate >= windowStart && t.txnDate < today);
    const days = new Set(uses.map((t) => t.txnDate));
    const firstUse = uses.length ? uses.map((t) => t.txnDate).sort()[0] : null;
    // Exposure: each calendar day since the button was first used (within the 8-week window).
    const exposure: number[] = [0, 0, 0, 0, 0, 0, 0];
    const hits: number[] = [0, 0, 0, 0, 0, 0, 0];
    if (firstUse) {
      for (let d = firstUse; d < today; d = dateAdd(d, 1)) {
        exposure[weekday(d)]++;
        if (days.has(d)) hits[weekday(d)]++;
      }
    }
    const n = sum(exposure);
    const pAll = (sum(hits) + 1) / (n + 2);
    const w = weekday(today);
    // Shrink the weekday's own rate towards the overall rate (2 pseudo-days).
    const pToday = (hits[w] + 2 * pAll) / (exposure[w] + 2);
    const counts = quickTxns.filter((t) => t.quickId === q.id).slice(0, 10).map((t) => Math.max(1, Math.round(t.amount / Math.max(q.unitPrice, 0.01))));
    const usualCount = counts.length >= 3 ? Math.round(median(counts)) : q.count;
    const loggedToday = quickTxns.some((t) => t.quickId === q.id && t.txnDate === today);
    return { id: q.id, label: q.label, p: pToday, pAll, days: n, usualCount, loggedToday, expected: n >= 14 && pToday >= 0.6 };
  });
  const missing = habits.filter((h) => h.expected && !h.loggedToday).sort((a, b) => b.p - a.p);

  /* ── 4. Spending forecast: weekday averages, shrunk and outlier-capped ── */
  const mine = r.txns.filter((t) => t.owner === person && t.kind === "expense");
  const fixedCats = new Set(k.fixed.map((f) => f.category));
  const histStart = dateAdd(today, -56);
  const hist = mine.filter((t) => t.txnDate >= histStart && t.txnDate < today && !fixedCats.has(t.category));
  const firstHist = hist.length ? hist.map((t) => t.txnDate).sort()[0] : null;
  const histDays = firstHist ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${firstHist}T00:00:00Z`)) / DAY) : 0;
  const remaining = Array.from({ length: k.daysLeft - 1 }, (_, i) => dateAdd(today, i + 1));
  const forecast = histDays >= 14
    ? EXPENSE_CATEGORIES.filter((c) => !fixedCats.has(c.key)).map((c) => {
        const daily = new Map<string, number>();
        for (const t of hist.filter((t) => t.category === c.key)) daily.set(t.txnDate, (daily.get(t.txnDate) ?? 0) + t.amount);
        const all = Array.from({ length: histDays }, (_, i) => daily.get(dateAdd(firstHist!, i)) ?? 0);
        // Cap one-off days (a phone, a big grocery stock-up) at median + 5·MAD of the spending days.
        const spendDays = all.filter((x) => x > 0);
        const cap = spendDays.length >= 4 ? median(spendDays) + 5 * 1.4826 * mad(spendDays) : Infinity;
        const capped = all.map((x) => Math.min(x, cap));
        const mean = sum(capped) / Math.max(1, capped.length);
        const perWd = [0, 1, 2, 3, 4, 5, 6].map((wd) => {
          const xs = capped.filter((_, i) => weekday(dateAdd(firstHist!, i)) === wd);
          return (sum(xs) + 3 * mean) / (xs.length + 3);
        });
        const usedSoFar = sum(mine.filter((t) => t.category === c.key && t.txnDate.startsWith(today.slice(0, 7))).map((t) => t.amount));
        const todaySpent = sum(mine.filter((t) => t.category === c.key && t.txnDate === today).map((t) => t.amount));
        const rest = sum(remaining.map((d) => perWd[weekday(d)])) + Math.max(0, perWd[weekday(today)] - todaySpent);
        return { key: c.key, label: c.label, usedSoFar, rest, monthEnd: usedSoFar + rest, perDay: mean };
      }).filter((f) => f.monthEnd > 0)
    : null;
  const forecastSaving = forecast && k.plan ? k.income - sum(k.fixed.map((f) => Math.max(f.amount, f.paid))) - sum(forecast.map((f) => f.monthEnd)) : null;
  const overBudget = forecast ? forecast.map((f) => ({ ...f, limit: k.plan?.buckets[f.key] ?? 0 })).filter((f) => f.limit > 0 && f.monthEnd > f.limit * 1.1) : [];

  /* ── 5. Unusual spends: robust z-score per category ─────────────────── */
  const recentFrom = dateAdd(today, -2);
  const unusual = mine
    .filter((t) => t.txnDate >= recentFrom && !fixedCats.has(t.category))
    .flatMap((t) => {
      // Like with like: a grocery order against past grocery orders (the tag), else the category.
      const window = mine.filter((x) => x.id !== t.id && x.txnDate >= dateAdd(today, -120));
      const sameTag = t.tag ? window.filter((x) => x.tag === t.tag).map((x) => x.amount) : [];
      const byTag = sameTag.length >= 5;
      const past = byTag ? sameTag : window.filter((x) => x.category === t.category).map((x) => x.amount);
      if (past.length < 5) return [];
      const med = median(past);
      const spread = 1.4826 * mad(past, med) || med * 0.25;
      const z = (t.amount - med) / Math.max(spread, 1);
      const label = byTag ? labelOf(TXN_TAGS, t.tag!) : labelOf(EXPENSE_CATEGORIES, t.category);
      return z > 3.5 && t.amount > 2 * med ? [{ id: t.id, label, amount: t.amount, times: t.amount / Math.max(med, 1), note: t.note, date: t.txnDate }] : [];
    });

  /* ── Reminders ─────────────────────────────────────────────────────── */
  const alerts: KitchenAlert[] = [];
  const low = items.filter((i) => i.item.perDay > 0 && (i.item.left <= 0 || (i.soonDays !== null && i.soonDays <= i.item.leadDays)));
  if (low.length) {
    const out = low.filter((i) => i.item.left <= 0);
    const names = low.map((i) => i.name);
    const detail = low
      .slice(0, 4)
      .map((i) => (i.item.left <= 0 ? `${i.name} is finished` : `${i.name} lasts ${Math.max(0, Math.floor(i.soonDays!))}–${Math.max(1, Math.ceil(i.lateDays!))} days`))
      .join("; ");
    const cost = sum(low.map((i) => (i.item.best.price ?? 0) * i.item.packs));
    alerts.push({
      key: `stock:${low.map((i) => `${i.id}${i.item.left <= 0 ? "!" : ""}`).sort().join(",")}`,
      kind: "stock",
      tone: out.length ? "bad" : "warn",
      slot: "morning",
      title: `Buy soon: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`,
      body: `${detail}. About ${rupees(cost)} for a month of these.`,
      items: low.map((i) => i.id),
    });
  }
  if (order && order.days <= 1 && order.items.length >= 2 && !low.length) {
    alerts.push({
      key: `order:${order.date}`,
      kind: "order",
      tone: "good",
      slot: "morning",
      title: order.days === 0 ? "Order day" : "Order tomorrow",
      body: `${order.items.length} items, about ${rupees(order.total)}${order.coversUntil ? ` — then nothing runs out until ${short(order.coversUntil)}` : ""}.`,
      items: order.items.map((i) => i.id),
    });
  }
  for (const f of overBudget.slice(0, 2)) {
    alerts.push({ key: `budget:${f.key}:${today.slice(0, 7)}:${Math.round(f.monthEnd / f.limit * 10)}`, kind: "budget", tone: "warn", slot: "morning", title: `${f.label} is heading over`, body: `At your usual pace it ends the month near ${rupees(f.monthEnd)} against ${rupees(f.limit)}.` });
  }
  for (const u of unusual.slice(0, 2)) {
    alerts.push({ key: `unusual:${u.id}`, kind: "unusual", tone: "warn", slot: "morning", title: `Unusual: ${rupees(u.amount)} on ${u.label.toLowerCase()}`, body: `About ${u.times.toFixed(1)}× what you usually spend there${u.note ? ` (${u.note})` : ""}.` });
  }
  if (missing.length) {
    alerts.push({
      key: `habit:${today}`,
      kind: "habit",
      tone: "good",
      slot: "evening",
      title: `Not logged today: ${missing.slice(0, 3).map((h) => h.label).join(", ")}`,
      body: `You usually log ${missing.length === 1 ? "this" : "these"} on ${new Date(`${today}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" })}s — one tap in Saath's Kitchen.`,
    });
  }

  return { person, items, byId, order, habits, missing, forecast, forecastSaving, overBudget, unusual, alerts, learnedCount: items.filter((i) => i.learned).length };
}

export type KitchenLearning = ReturnType<typeof learnKitchen>;

/** "4–6 days" with the learned range, or a plain count before anything is learned. */
export function rangeText(i: KitchenLearning["items"][number]) {
  const p = i.item;
  if (p.perDay <= 0) return "not used daily";
  if (p.left <= 0) return "finished";
  const a = Math.max(0, Math.floor(i.soonDays!));
  const b = Math.max(a, Math.ceil(i.lateDays!));
  if (!i.learned || b - a <= 1) return a < 1 ? "runs out today" : `${Math.round(p.left / p.perDay)} days · till ${short(p.runOut!)}`;
  return `${a}–${b} days · learned`;
}
