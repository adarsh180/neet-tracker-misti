/**
 * Saath smart features — classical statistics and small learning models, no
 * language model. Pure and deterministic (seeded randomness), identical in both repos.
 *
 *  1. Recurring payments — groups entries by what they were, tests the gaps for a
 *     regular rhythm (monthly by day-of-month, weekly, or every N days) and predicts
 *     the next due date. Entries you marked "repeats monthly" count too.
 *  2. Auto-category — a multinomial Naive Bayes classifier over the words in your
 *     notes (and a small Indian-life lexicon so it works from day one) that guesses
 *     the category and the exact tag while you type.
 *  3. Goal odds — Monte Carlo: 2,000 futures built by resampling your own monthly
 *     contributions, giving the chance of reaching each fund by its date, the likely
 *     finish month and the extra a month that lifts the odds to 80%.
 *  4. Study vs life — Welch t-tests comparing study hours on days with and without
 *     something (a date, eating out, a no-spend day, high stress…), the day itself
 *     and the day after, plus the weekday profile and a rank correlation with spend.
 *  5. Date planner — scores the next days for meeting: exams and family dates on
 *     either calendar, the lighter study weekdays, your usual meeting days, spacing,
 *     and whether the fun budget still covers a typical date.
 *  6. Budget optimiser — water-filling: cuts what each category usually costs in
 *     proportion to how flexible it is (rent never, food a little, outings most),
 *     each within a sensible cap, until the savings target fits.
 */

import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TXN_TAGS, labelOf, rupees, type FundEntry, type HubRecords, type LifeDay, type Owner, type Person, type Txn } from "./metrics";

const DAY = 86_400_000;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mad = (xs: number[], med = median(xs)) => median(xs.map((x) => Math.abs(x - med)));
const variance = (xs: number[]) => {
  const m = mean(xs);
  return xs.length > 1 ? sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1) : 0;
};
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const dateAdd = (iso: string, days: number) => istDay(new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY));
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const monthKey = (iso: string) => iso.slice(0, 7);
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** Seeded random numbers (mulberry32), so the same data always gives the same odds. */
function rng(seedText: string) {
  let h = 1779033703;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Words ──────────────────────────────────────────────────────────── */
const STOP = new Set(["the", "a", "an", "for", "of", "and", "to", "in", "on", "at", "x", "with", "from", "my", "me", "is", "ka", "ki", "ke", "se"]);
/** Lower-case words (Hindi included) and adjacent pairs, so "test series" is one feature. */
export function words(text: string | null | undefined): string[] {
  const ws = (text ?? "").toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 1 && !STOP.has(w));
  return [...ws, ...ws.slice(1).map((w, i) => `${ws[i]}_${w}`)];
}
const noteKey = (text: string | null) => words(text).filter((w) => !w.includes("_")).slice(0, 4).join(" ");

/* ── 1. Recurring payments ──────────────────────────────────────────── */
export type Recurring = {
  key: string;
  owner: Person;
  kind: "income" | "expense";
  label: string;
  category: string;
  tag: string | null;
  method: string | null;
  note: string | null;
  amount: number;
  every: number;
  rhythm: "monthly" | "weekly" | "days";
  last: string;
  next: string;
  dueIn: number;
  count: number;
  confidence: number;
  marked: boolean;
};

function nextMonthly(last: string, dom: number) {
  const y = Number(last.slice(0, 4));
  const m = Number(last.slice(5, 7)); // 1-based; the next month is index m in Date.UTC
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(dom, dim))).toISOString().slice(0, 10);
}

export function findRecurring(r: HubRecords, person: Person, today: string): Recurring[] {
  const txns = r.txns.filter((t) => t.owner === person && t.txnDate <= today);
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    const k = `${t.kind}|${t.category}|${noteKey(t.note) || t.tag || ""}`;
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const out: Recurring[] = [];
  for (const [key, all] of groups) {
    // Keep the entries near the group's typical amount (a one-off in the same category is not the bill).
    const med = median(all.map((t) => t.amount));
    const list = all.filter((t) => Math.abs(t.amount - med) <= Math.max(med * 0.2, 1)).sort((a, b) => a.txnDate.localeCompare(b.txnDate));
    const dates = [...new Set(list.map((t) => t.txnDate))];
    const latest = list.at(-1);
    if (!latest) continue;
    const marked = all.some((t) => t.recurring);
    let rhythm: Recurring["rhythm"] | null = null;
    let every = 0;
    let confidence = 0;
    let next = "";
    if (dates.length >= 3) {
      const gaps = dates.slice(1).map((d, i) => diffDays(d, dates[i]));
      const g = median(gaps);
      const spread = g ? mad(gaps, g) / g : 1;
      const doms = dates.map((d) => Number(d.slice(8, 10)));
      // Monthly means the same date each month; a steady 28-day gap (a phone plan) is "every 28 days".
      if (g >= 26 && g <= 35 && spread <= 0.2 && mad(doms) <= 2) {
        rhythm = "monthly";
        every = 30;
        next = nextMonthly(dates.at(-1)!, Math.round(median(doms)));
      } else if (g >= 6 && g <= 8 && spread <= 0.25) {
        rhythm = "weekly";
        every = 7;
        next = dateAdd(dates.at(-1)!, 7);
      } else if (g >= 9 && g <= 120 && spread <= 0.2 && mad(gaps, g) <= 3) {
        rhythm = "days";
        every = Math.round(g);
        next = dateAdd(dates.at(-1)!, every);
      }
      if (rhythm) confidence = Math.max(0, Math.min(1, (1 - spread) * Math.min(1, dates.length / 4)));
    }
    if (!rhythm && marked) {
      rhythm = "monthly";
      every = 30;
      next = nextMonthly(latest.txnDate, Number(latest.txnDate.slice(8, 10)));
      confidence = 0.7;
    }
    if (!rhythm) continue;
    out.push({
      key,
      owner: person,
      kind: latest.kind,
      label: latest.note?.trim() || (latest.tag ? labelOf(TXN_TAGS, latest.tag) : labelOf(latest.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES, latest.category)),
      category: latest.category,
      tag: latest.tag,
      method: latest.method,
      note: latest.note,
      amount: Math.round(median(list.map((t) => t.amount))),
      every,
      rhythm,
      last: latest.txnDate,
      next,
      dueIn: diffDays(next, today),
      count: dates.length,
      confidence,
      marked,
    });
  }
  return out.sort((a, b) => a.dueIn - b.dueIn);
}

/* ── 2. Auto-category: multinomial Naive Bayes ──────────────────────── */
const LEXICON: Array<[string, string | null, string]> = [
  ["food", "groceries", "blinkit zepto instamart bigbasket grocery groceries kirana atta rice chawal daal dal oil ghee sugar masala salt poha pasta"],
  ["food", "dairy", "milk doodh curd dahi paneer butter cheese bread amul mother dairy"],
  ["food", "veggies", "sabzi sabji vegetable vegetables veggies fruit fruits banana apple onion tomato potato aloo mandi"],
  ["food", "rotis", "roti rotis chapati phulka paratha"],
  ["food", "eatout", "swiggy zomato chai tea coffee snack snacks momos maggi canteen thali restaurant dhaba"],
  ["fun", "date", "cafe café boho date movie pvr inox outing"],
  ["transport", "commute", "metro coaching dmrc smart card"],
  ["transport", "visit", "uber ola rapido auto cab bus south ex extension"],
  ["health", "care", "medicine medicines pharmacy chemist doctor clinic durex condom condoms protection"],
  ["bills", "phone", "jio airtel recharge wifi broadband electricity bill"],
  ["study", "prints", "print prints printout xerox photocopy stationery pen pens notebook register"],
  ["study", null, "book books laxmikanth spectrum ncert test series fee fees course pw vision ias forum drishti magazine"],
  ["rent", null, "rent pg room landlord deposit maintenance"],
  ["shopping", "home", "detergent soap shampoo toothpaste surf vim cleaning bucket bulb board"],
  ["shopping", null, "amazon flipkart myntra clothes shoes tshirt jeans kurta"],
  ["subscriptions", null, "netflix spotify prime hotstar subscription"],
  ["gifts", null, "gift gifts flowers cake birthday"],
  ["travel", null, "train irctc flight ticket trip hotel"],
];

export type Classifier = { predict: (note: string, amount?: number) => { category: string; pCategory: number; tag: string | null; pTag: number } | null; trained: number };

export function trainClassifier(r: HubRecords, person: Person): Classifier {
  type Doc = { ws: string[]; cat: string; tag: string; w: number };
  const docs: Doc[] = [];
  for (const [cat, tag, text] of LEXICON) for (const w of words(text)) docs.push({ ws: [w], cat, tag: tag ?? "-", w: 0.6 });
  let trained = 0;
  for (const t of r.txns) {
    if (t.kind !== "expense" || !t.note) continue;
    const ws = words(t.note);
    if (!ws.length) continue;
    docs.push({ ws, cat: t.category, tag: t.tag ?? "-", w: t.owner === person ? 2 : 1 });
    if (t.owner === person) trained++;
  }
  const fit = (label: (d: Doc) => string) => {
    const prior = new Map<string, number>();
    const counts = new Map<string, Map<string, number>>();
    const totals = new Map<string, number>();
    const vocab = new Set<string>();
    for (const d of docs) {
      const c = label(d);
      prior.set(c, (prior.get(c) ?? 0) + d.w);
      let m = counts.get(c);
      if (!m) counts.set(c, (m = new Map()));
      for (const w of d.ws) {
        m.set(w, (m.get(w) ?? 0) + d.w);
        totals.set(c, (totals.get(c) ?? 0) + d.w);
        vocab.add(w);
      }
    }
    const n = sum([...prior.values()]);
    return { prior, counts, totals, vocab, n };
  };
  const cats = fit((d) => d.cat);
  const tags = fit((d) => `${d.cat}|${d.tag}`);
  const score = (m: ReturnType<typeof fit>, ws: string[]) => {
    // Light smoothing and a dampened prior: a few hundred milk entries must not
    // out-vote the one word that names the thing.
    const alpha = 0.02;
    const V = m.vocab.size;
    const scores = [...m.prior.keys()].map((c) => {
      let s = 0.3 * Math.log((m.prior.get(c)! + 1) / (m.n + m.prior.size));
      const cm = m.counts.get(c)!;
      const tot = m.totals.get(c) ?? 0;
      for (const w of ws) s += Math.log(((cm.get(w) ?? 0) + alpha) / (tot + alpha * V));
      return { c, s };
    });
    const top = Math.max(...scores.map((x) => x.s));
    const z = sum(scores.map((x) => Math.exp(x.s - top)));
    return scores.map((x) => ({ c: x.c, p: Math.exp(x.s - top) / z })).sort((a, b) => b.p - a.p);
  };
  return {
    trained,
    predict: (note) => {
      const ws = words(note).filter((w) => cats.vocab.has(w));
      if (!ws.length) return null;
      const c = score(cats, ws)[0];
      const t = score(tags, ws).find((x) => x.c.startsWith(`${c.c}|`));
      const tag = t && !t.c.endsWith("|-") ? t.c.split("|")[1] : null;
      return { category: c.c, pCategory: c.p, tag, pTag: t?.p ?? 0 };
    },
  };
}

/* ── 3. Goal odds: Monte Carlo over your own monthly contributions ──── */
export type Odds = { status: "done" | "learning" | "undated" | "ok"; p: number | null; months: number; finish: string | null; extraFor80: number | null; history: number; needMonths?: number };

export function fundOdds(f: { id: string; target: number; targetDate: string | null; createdAt: string }, balance: number, entries: FundEntry[], today: string, sims = 2000): Odds {
  if (balance >= f.target) return { status: "done", p: 1, months: 0, finish: today, extraFor80: 0, history: 0 };
  // Monthly contributions for every complete month since the fund began (empty months count as ₹0).
  const start = [f.createdAt.slice(0, 10), ...entries.map((e) => e.entryDate)].sort()[0];
  const months: string[] = [];
  for (let d = `${start.slice(0, 7)}-01`; monthKey(d) < monthKey(today); d = nextMonthly(d, 1)) months.push(monthKey(d));
  const history = months.slice(-12).map((m) => sum(entries.filter((e) => monthKey(e.entryDate) === m).map((e) => e.amount)));
  if (!f.targetDate) return { status: "undated", p: null, months: 0, finish: null, extraFor80: null, history: history.length };
  const left = Math.max(1, Math.ceil(diffDays(f.targetDate, today) / 30.44));
  if (history.length < 2 || !history.some((x) => x > 0)) return { status: "learning", p: null, months: left, finish: null, extraFor80: null, history: history.length, needMonths: Math.max(0, 2 - history.length) };
  const simulate = (extra: number, n: number) => {
    const rand = rng(`${f.id}:${extra}`);
    let hit = 0;
    const finishes: number[] = [];
    for (let s = 0; s < n; s++) {
      let total = balance;
      let when = Infinity;
      for (let m = 1; m <= left + 36; m++) {
        total += history[Math.floor(rand() * history.length)] + extra;
        if (total >= f.target && when === Infinity) when = m;
        if (m >= left && when !== Infinity) break;
      }
      if (when <= left) hit++;
      finishes.push(when);
    }
    return { p: hit / n, finish: median(finishes.filter((x) => Number.isFinite(x))) || Infinity };
  };
  const base = simulate(0, sims);
  let extraFor80: number | null = 0;
  if (base.p < 0.8) {
    let lo = 0;
    let hi = Math.max(100, (f.target - balance) / left);
    if (simulate(hi, 500).p < 0.8) extraFor80 = roundTo(hi, 100);
    else {
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (simulate(mid, 500).p >= 0.8) hi = mid;
        else lo = mid;
      }
      extraFor80 = Math.max(100, roundTo(hi, 100));
    }
  }
  const finish = Number.isFinite(base.finish) ? nextMonthly(dateAdd(today, Math.round((base.finish - 1) * 30.44)), Number(today.slice(8, 10))) : null;
  return { status: "ok", p: base.p, months: left, finish, extraFor80, history: history.length };
}

/* ── 4. Study vs life: Welch t-tests on your own days ───────────────── */
export type Pattern = { key: string; text: string; effect: number; t: number; strength: "clear" | "likely"; n: [number, number] };

function welch(a: number[], b: number[]) {
  if (a.length < 4 || b.length < 4) return null;
  const va = variance(a) / a.length;
  const vb = variance(b) / b.length;
  const se = Math.sqrt(va + vb) || 1e-9;
  return { diff: mean(a) - mean(b), t: (mean(a) - mean(b)) / se, ma: mean(a), mb: mean(b) };
}

function spearman(x: number[], y: number[]) {
  if (x.length < 8) return null;
  const rank = (v: number[]) => {
    const idx = v.map((val, i) => ({ val, i })).sort((a, b) => a.val - b.val);
    const r = new Array<number>(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1].val === idx[i].val) j++;
      for (let k = i; k <= j; k++) r[idx[k].i] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x);
  const ry = rank(y);
  const mx = mean(rx);
  const my = mean(ry);
  const num = sum(rx.map((v, i) => (v - mx) * (ry[i] - my)));
  const den = Math.sqrt(sum(rx.map((v) => (v - mx) ** 2)) * sum(ry.map((v) => (v - my) ** 2)));
  return den ? num / den : null;
}

export function studyPatterns(r: HubRecords, life: LifeDay[], person: Person) {
  const days = life.filter((d) => Number.isFinite(d.hours)).sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const spends = r.txns.filter((t) => t.owner === person && t.kind === "expense");
  const moneyStart = spends.length ? spends.map((t) => t.txnDate).sort()[0] : null;
  const dateDays = new Set([...spends.filter((t) => t.tag === "date").map((t) => t.txnDate), ...r.events.filter((e) => e.kind === "date").map((e) => e.eventDate)]);
  const eatOut = new Set(spends.filter((t) => t.tag === "eatout").map((t) => t.txnDate));
  const spendOn = (d: string) => sum(spends.filter((t) => t.txnDate === d && t.category !== "rent").map((t) => t.amount));
  // Money features only mean something from the day money logging began.
  const tracked = moneyStart ? days.filter((d) => d.date >= moneyStart) : [];
  const patterns: Pattern[] = [];
  const h = (xs: LifeDay[]) => xs.map((d) => d.hours);
  const fmt = (v: number) => `${v.toFixed(1)} h`;
  const test = (key: string, yes: LifeDay[], no: LifeDay[], describe: (w: NonNullable<ReturnType<typeof welch>>) => string) => {
    const w = welch(h(yes), h(no));
    if (!w || Math.abs(w.t) < 1.5 || Math.abs(w.diff) < 0.3) return;
    patterns.push({ key, text: describe(w), effect: w.diff, t: w.t, strength: Math.abs(w.t) >= 2 ? "clear" : "likely", n: [yes.length, no.length] });
  };
  test("date", tracked.filter((d) => dateDays.has(d.date)), tracked.filter((d) => !dateDays.has(d.date)), (w) => `On days you meet, you study ${fmt(Math.abs(w.diff))} ${w.diff < 0 ? "less" : "more"} (${fmt(w.ma)} vs ${fmt(w.mb)}).`);
  test("after-date", tracked.filter((d) => dateDays.has(dateAdd(d.date, -1))), tracked.filter((d) => !dateDays.has(dateAdd(d.date, -1))), (w) => `The day after meeting, study is ${fmt(Math.abs(w.diff))} ${w.diff < 0 ? "lower" : "higher"} than usual (${fmt(w.ma)}).`);
  test("eatout", tracked.filter((d) => eatOut.has(d.date)), tracked.filter((d) => !eatOut.has(d.date)), (w) => `Days you eat out average ${fmt(w.ma)} of study against ${fmt(w.mb)} on the rest.`);
  test("nospend", tracked.filter((d) => spendOn(d.date) === 0), tracked.filter((d) => spendOn(d.date) > 0), (w) => `No-spend days are your ${w.diff > 0 ? "stronger" : "weaker"} study days: ${fmt(w.ma)} vs ${fmt(w.mb)}.`);
  const moody = days.filter((d) => d.mood);
  test("stress", days.filter((d) => byDate.get(dateAdd(d.date, -1))?.mood && byDate.get(dateAdd(d.date, -1))!.mood!.stress >= 4), days.filter((d) => byDate.get(dateAdd(d.date, -1))?.mood && byDate.get(dateAdd(d.date, -1))!.mood!.stress < 4), (w) => `After a high-stress day you study ${fmt(Math.abs(w.diff))} ${w.diff < 0 ? "less" : "more"}.`);
  test("energy", moody.filter((d) => d.mood!.energy >= 4), moody.filter((d) => d.mood!.energy < 4), (w) => `High-energy days bring ${fmt(Math.abs(w.diff))} ${w.diff > 0 ? "more" : "less"} study (${fmt(w.ma)}).`);

  // The weekday profile: best and lightest days (each weekday needs 3 logged days).
  const wd = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ i, xs: days.filter((d) => weekday(d.date) === i).map((d) => d.hours) })).filter((x) => x.xs.length >= 3).map((x) => ({ i: x.i, m: mean(x.xs), n: x.xs.length }));
  const weekdayHours = [0, 1, 2, 3, 4, 5, 6].map((i) => wd.find((x) => x.i === i)?.m ?? null);
  let profile: string | null = null;
  if (wd.length >= 4) {
    const best = wd.reduce((a, b) => (b.m > a.m ? b : a));
    const light = wd.reduce((a, b) => (b.m < a.m ? b : a));
    if (best.m - light.m >= 0.5) profile = `${WEEKDAY_NAMES[best.i]}s are your strongest study days (${fmt(best.m)} on average); ${WEEKDAY_NAMES[light.i]}s the lightest (${fmt(light.m)}).`;
  }
  const paired = tracked.map((d) => ({ s: spendOn(d.date), h: d.hours }));
  const rho = spearman(paired.map((p) => p.s), paired.map((p) => p.h));
  const spendLink = rho !== null && Math.abs(rho) >= 0.3 ? `Spending and study move ${rho < 0 ? "against each other" : "together"} (rank correlation ${rho.toFixed(2)}): ${rho < 0 ? "bigger-spend days tend to be lighter study days" : "busier days come with more spend"}.` : null;

  const need = Math.max(0, 21 - tracked.length);
  return {
    patterns: patterns.sort((a, b) => Math.abs(b.t) - Math.abs(a.t)),
    profile,
    spendLink,
    weekdayHours,
    avgHours: mean(h(days)),
    studyDays: days.length,
    trackedDays: tracked.length,
    need,
  };
}

/* ── 5. Date planner ────────────────────────────────────────────────── */
export type DateIdea = { date: string; score: number; reasons: string[]; warn: string | null };

export function planDates(
  r: HubRecords,
  opts: { today: string; builtIn: Array<{ date: string; title: string; owner: Owner }>; weekdayHours?: Array<number | null>; funLeft: number | null; horizon?: number },
): { ideas: DateIdea[]; cost: number; examSoon: { title: string; days: number } | null } {
  const { today } = opts;
  const horizon = opts.horizon ?? 10;
  const exams = [...opts.builtIn.map((b) => ({ date: b.date, title: b.title })), ...r.events.filter((e) => e.kind === "exam").map((e) => ({ date: e.eventDate, title: e.title }))];
  const nextExam = exams.map((e) => ({ ...e, days: diffDays(e.date, today) })).filter((e) => e.days >= 0).sort((a, b) => a.days - b.days)[0] ?? null;
  const pastDates = [...r.txns.filter((t) => t.tag === "date").map((t) => t.txnDate), ...r.events.filter((e) => e.kind === "date").map((e) => e.eventDate)];
  const dateSpends = r.txns.filter((t) => t.tag === "date").map((t) => t.amount);
  const cost = dateSpends.length >= 2 ? Math.round(median(dateSpends)) : 800;
  const usual = [0, 0, 0, 0, 0, 0, 0];
  for (const d of pastDates) if (d < today) usual[weekday(d)]++;
  const totalPast = sum(usual);
  const wh = opts.weekdayHours ?? [];
  const known = wh.filter((x): x is number => x !== null);
  const hiH = known.length ? Math.max(...known) : 0;
  const loH = known.length ? Math.min(...known) : 0;

  const scored: DateIdea[] = [];
  for (let i = 1; i <= horizon; i++) {
    const d = dateAdd(today, i);
    const reasons: string[] = [];
    let score = 50;
    const blocked = r.events.filter((e) => e.eventDate === d && (e.kind === "exam" || e.kind === "family" || e.kind === "trip"));
    if (exams.some((e) => e.date === d) || blocked.some((e) => e.kind === "exam")) continue;
    if (exams.some((e) => e.date === dateAdd(d, 1))) score -= 45;
    if (blocked.length) score -= 30;
    const h = wh[weekday(d)];
    if (h !== null && h !== undefined && hiH > loH) {
      const light = (hiH - h) / (hiH - loH);
      score += light * 20;
      if (light >= 0.6) reasons.push(`${WEEKDAY_NAMES[weekday(d)]} is one of your lighter study days`);
    }
    if (totalPast >= 3 && usual[weekday(d)] / totalPast >= 0.25) {
      score += 10;
      reasons.push("you two often meet on this day");
    }
    if ([5, 6].includes(weekday(d))) score += 5;
    const near = pastDates.concat(r.events.filter((e) => e.kind === "date").map((e) => e.eventDate)).some((p) => Math.abs(diffDays(p, d)) === 1);
    if (near) score -= 15;
    if (!blocked.length && !exams.some((e) => e.date === dateAdd(d, 1))) reasons.push("no exams or plans on either calendar");
    scored.push({ date: d, score, reasons, warn: null });
  }
  // Two a week normally; one when NEET UG or UPSC Prelims is within two months. Never on back-to-back days.
  const bigSoon = opts.builtIn.some((b) => diffDays(b.date, today) >= 0 && diffDays(b.date, today) <= 60);
  const want = bigSoon ? 1 : 2;
  const picks: DateIdea[] = [];
  for (const s of scored.sort((a, b) => b.score - a.score)) {
    if (picks.length >= want) break;
    if (picks.some((p) => Math.abs(diffDays(p.date, s.date)) < 2)) continue;
    if (diffDays(s.date, today) > 7 && picks.length) continue;
    picks.push(s);
  }
  let left = opts.funLeft;
  for (const p of picks.sort((a, b) => a.date.localeCompare(b.date))) {
    if (left !== null) {
      if (left < cost) p.warn = `outings budget has ${rupees(Math.max(0, left))} left — a typical date is ${rupees(cost)}`;
      left -= cost;
    }
  }
  return { ideas: picks, cost, examSoon: nextExam ? { title: nextExam.title, days: nextExam.days } : null };
}

/* ── 6. Budget optimiser: water-filling cuts by flexibility ─────────── */
const FLEX: Record<string, { weight: number; cap: number }> = {
  rent: { weight: 0, cap: 0 },
  emi: { weight: 0, cap: 0 },
  bills: { weight: 0.2, cap: 0.1 },
  health: { weight: 0.2, cap: 0.1 },
  study: { weight: 0.2, cap: 0.1 },
  family: { weight: 0.3, cap: 0.2 },
  food: { weight: 0.5, cap: 0.2 },
  transport: { weight: 0.4, cap: 0.15 },
  subscriptions: { weight: 0.7, cap: 0.5 },
  gifts: { weight: 0.8, cap: 0.5 },
  travel: { weight: 0.8, cap: 0.5 },
  other: { weight: 0.8, cap: 0.5 },
  shopping: { weight: 1, cap: 0.6 },
  fun: { weight: 1, cap: 0.6 },
};

export function optimiseBudgets(r: HubRecords, person: Person, today: string) {
  const plan = r.kitchen?.[person]?.plan ?? null;
  const thisMonth = monthKey(today);
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const mine = r.txns.filter((t) => t.owner === person);
  // Complete months since logging began; the first month counts only if logging began in its first days.
  const firstLog = mine.map((t) => t.txnDate).sort()[0] ?? today;
  const months = [...new Set(mine.map((t) => monthKey(t.txnDate)))]
    .filter((m) => m < thisMonth && (m !== monthKey(firstLog) || Number(firstLog.slice(8, 10)) <= 5))
    .sort()
    .slice(-6);
  const basis = months.length ? `your last ${months.length} month${months.length === 1 ? "" : "s"}` : "this month's pace";
  const typical = EXPENSE_CATEGORIES.map((c) => {
    const firstSeen = mine.filter((t) => t.kind === "expense" && t.category === c.key).map((t) => monthKey(t.txnDate)).sort()[0];
    const vals = months.filter((m) => firstSeen && m >= firstSeen).map((m) => sum(mine.filter((t) => t.kind === "expense" && t.category === c.key && monthKey(t.txnDate) === m).map((t) => t.amount)));
    const cur = sum(mine.filter((t) => t.kind === "expense" && t.category === c.key && monthKey(t.txnDate) === thisMonth).map((t) => t.amount));
    const fixedNow = plan?.fixed.find((f) => f.category === c.key)?.amount;
    // A whole month seen once (rent) is that month's amount; otherwise the median month, or this month's pace.
    const usual = fixedNow ?? (vals.length ? median(vals) : c.key === "rent" || c.key === "emi" ? cur : (cur / Math.max(1, dayOfMonth)) * daysInMonth);
    return { key: c.key, label: c.label, typical: Math.round(usual) };
  }).filter((c) => c.typical > 0);
  const incomeMonths = months.map((m) => sum(mine.filter((t) => t.kind === "income" && monthKey(t.txnDate) === m).map((t) => t.amount))).filter((x) => x > 0);
  const income = plan?.income || (incomeMonths.length ? median(incomeMonths) : sum(mine.filter((t) => t.kind === "income" && monthKey(t.txnDate) === thisMonth).map((t) => t.amount)));
  const save = plan?.save ?? Math.round(income * (r.settings.savingsRateTarget ?? 0.2));
  if (!income || !typical.length) return null;
  const total = sum(typical.map((c) => c.typical));
  const need = total - (income - save);
  const rows = typical.map((c) => ({ ...c, flex: FLEX[c.key] ?? { weight: 0.5, cap: 0.3 }, cut: 0 }));
  let shortfall = 0;
  if (need > 0) {
    let remaining = need;
    // Water-filling: share the cut by weight × size; anything that hits its cap passes the rest on.
    for (let round = 0; round < 10 && remaining > 0.5; round++) {
      const open = rows.filter((x) => x.flex.weight > 0 && x.cut < x.flex.cap * x.typical - 0.5);
      const w = sum(open.map((x) => x.flex.weight * x.typical));
      if (!w) break;
      let used = 0;
      for (const x of open) {
        const share = (remaining * x.flex.weight * x.typical) / w;
        const room = x.flex.cap * x.typical - x.cut;
        const take = Math.min(share, room);
        x.cut += take;
        used += take;
      }
      remaining -= used;
    }
    shortfall = Math.max(0, Math.round(remaining));
  }
  const suggestions = rows.map((x) => ({ key: x.key, label: x.label, typical: x.typical, suggested: x.flex.weight === 0 ? x.typical : x.cut > 0 ? Math.max(50, roundTo(x.typical - x.cut, 50)) : roundTo(x.typical * (need > 0 ? 1 : 1.05), 50), cut: Math.round(x.cut) }));
  return { income, save, total, need: Math.round(need), shortfall, room: need < 0 ? Math.round(-need) : 0, basis, suggestions };
}
