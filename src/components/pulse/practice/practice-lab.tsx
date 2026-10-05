"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { FlaskConical, Sparkles } from "lucide-react";

import { LabTube, toneFor, type Tone } from "@/components/pulse/lab-tube";
import { Roll } from "@/components/pulse/roll";
import { runSeatModel, type SeatInputs, type SeatLevers, type SubjectKey } from "@/lib/seat-model";

/* The Practice Arena "lab bench": every scored attempt poured into tubes. */

type SubjectScore = { subject: string; score: number; maxScore: number; correct: number; wrong: number; skipped: number };
export type LabCbtTest = {
  id: string;
  title: string;
  mode: string;
  status: string;
  questionCount: number;
  durationMinutes?: number;
  createdAt: string;
  completedAt?: string | null;
  totalActiveSeconds?: number | null;
  result: {
    score: number;
    maxScore: number;
    correct: number;
    wrong: number;
    skipped: number;
    timeTakenSeconds: number | null;
    subjectScores: SubjectScore[];
  } | null;
};

type PulseTest = {
  id: string;
  name: string;
  date: string;
  score720: number;
  correct: number | null;
  wrong: number | null;
  skipped: number | null;
  negLost: number;
  subjects: Partial<Record<SubjectKey, number>>;
};
type PulseSlice = {
  model: { inputs: SeatInputs; observed: SeatLevers };
  tests: PulseTest[];
  subjects: Array<{ key: SubjectKey; slug: string; damage: number; expected: number }>;
};

type Attempt = {
  id: string;
  label: string;
  date: string;
  pct: number;
  score: number;
  max: number;
  correct: number | null;
  wrong: number | null;
  skipped: number | null;
  total: number;
  seconds: number | null;
  subjects: Partial<Record<SubjectKey, { now: number; leak: number | null; skip: number | null }>>;
  openable: boolean;
};

const SUBJECTS: SubjectKey[] = ["Physics", "Chemistry", "Botany", "Zoology"];
const SUBJECT_COLOR: Record<SubjectKey, string> = {
  Physics: "var(--physics)",
  Chemistry: "var(--chemistry)",
  Botany: "var(--botany)",
  Zoology: "var(--zoology)",
};
const NEET_SECONDS_PER_Q = 60;

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const short = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const subjectKey = (name: string): SubjectKey | null => SUBJECTS.find((s) => s.toLowerCase() === name.trim().toLowerCase()) ?? null;

function fromCbt(tests: LabCbtTest[]): Attempt[] {
  return tests
    .filter((t) => t.status === "COMPLETED" && t.result && t.result.maxScore > 0)
    .map((t) => {
      const r = t.result!;
      const subjects: Attempt["subjects"] = {};
      for (const s of r.subjectScores ?? []) {
        const key = subjectKey(s.subject);
        if (!key || s.maxScore <= 0) continue;
        const k = 180 / s.maxScore;
        subjects[key] = { now: Math.max(0, s.score) * k, leak: s.wrong * 5 * k, skip: s.skipped * 4 * k };
      }
      return {
        id: t.id,
        label: t.title,
        date: t.completedAt ?? t.createdAt,
        pct: Math.max(0, r.score) / r.maxScore,
        score: r.score,
        max: r.maxScore,
        correct: r.correct,
        wrong: r.wrong,
        skipped: r.skipped,
        total: r.correct + r.wrong + r.skipped || t.questionCount,
        seconds: r.timeTakenSeconds ?? t.totalActiveSeconds ?? null,
        subjects,
        openable: true,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function fromMocks(tests: PulseTest[]): Attempt[] {
  return tests.map((t) => {
    const subjects: Attempt["subjects"] = {};
    for (const key of SUBJECTS) {
      const v = t.subjects[key];
      if (typeof v === "number") subjects[key] = { now: Math.max(0, v), leak: null, skip: null };
    }
    const answered = (t.correct ?? 0) + (t.wrong ?? 0) + (t.skipped ?? 0);
    return {
      id: t.id,
      label: t.name,
      date: t.date,
      pct: t.score720 / 720,
      score: t.score720,
      max: 720,
      correct: t.correct,
      wrong: t.wrong,
      skipped: t.skipped,
      total: answered || 180,
      seconds: null,
      subjects,
      openable: false,
    };
  });
}

type Source = "cbt" | "mocks";

export function PracticeLab({ tests, onOpen, onNew }: { tests: LabCbtTest[]; onOpen: (id: string) => void; onNew: () => void }) {
  const [pulse, setPulse] = useState<PulseSlice | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/insights/pulse", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setPulse(d))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const cbt = useMemo(() => fromCbt(tests), [tests]);
  const mocks = useMemo(() => fromMocks(pulse?.tests ?? []), [pulse]);
  const active: Source = source ?? (cbt.length ? "cbt" : "mocks");
  const attempts = active === "cbt" ? cbt : mocks;
  const seat = useMemo(() => (pulse ? runSeatModel(pulse.model.inputs, pulse.model.observed) : null), [pulse]);

  const lab = useMemo(() => {
    const recent = attempts.slice(-8);
    const scored = recent.filter((a) => a.correct !== null && a.wrong !== null);
    const c = sum(scored.map((a) => a.correct ?? 0));
    const w = sum(scored.map((a) => a.wrong ?? 0));
    const s = sum(scored.map((a) => a.skipped ?? 0));
    const accuracy = c + w > 0 ? c / (c + w) : null;
    const attempted = c + w + s > 0 ? (c + w) / (c + w + s) : null;
    const leak = c > 0 ? w / (c * 4) : null;
    const timed = recent.filter((a) => a.seconds && a.total);
    const pace = timed.length ? sum(timed.map((a) => a.seconds!)) / sum(timed.map((a) => a.total)) : null;
    // Newer attempts count more: a fading average of the score share.
    let ws = 0;
    let wv = 0;
    recent.forEach((a, i) => {
      const k = Math.pow(0.75, recent.length - 1 - i);
      ws += k;
      wv += k * a.pct;
    });
    const level = ws ? wv / ws : null;
    const subjects = SUBJECTS.map((key) => {
      const rows = recent.map((a) => a.subjects[key]).filter(Boolean) as Array<{ now: number; leak: number | null; skip: number | null }>;
      const pulseSub = pulse?.subjects.find((x) => x.key === key);
      const now = rows.length ? avg(rows.map((r) => r.now)) : null;
      const leaks = rows.map((r) => r.leak).filter((x): x is number => x !== null);
      const skips = rows.map((r) => r.skip).filter((x): x is number => x !== null);
      const leakMarks = leaks.length ? avg(leaks) : pulseSub ? pulseSub.damage : 0;
      return {
        key,
        now,
        leak: now === null ? 0 : Math.min(leakMarks, 180 - now),
        leakIsWrong: leaks.length > 0,
        skip: skips.length && now !== null ? Math.min(avg(skips), Math.max(0, 180 - now - leakMarks)) : 0,
        // The seat model's growth for this subject, applied to what these attempts measure.
        proj: (() => {
          if (now === null || !seat || !pulseSub) return null;
          const exp = Math.min(179, Math.max(0, pulseSub.expected));
          const g = Math.max(0, Math.min(1, (seat.subjects[key] - exp) / (180 - exp)));
          return Math.round(Math.min(180, now + (180 - now) * g));
        })(),
        n: rows.length,
        slug: pulseSub?.slug ?? key.toLowerCase(),
      };
    });
    return { accuracy, attempted, leak, pace, level, subjects, wrongPerTest: scored.length ? w / scored.length : null, n: recent.length };
  }, [attempts, pulse, seat]);

  const govt = seat?.tiers.find((t) => t.key === "govt")?.threshold ?? 600;
  const aiims = seat?.tiers.find((t) => t.key === "aiims")?.threshold ?? 700;

  type VialSpec = { key: string; label: string; value: number | null; level: number; tone: Tone; big: string; unit: string; note: string; target?: number };
  const vials: VialSpec[] = [
    {
      key: "score",
      label: "Score level",
      value: lab.level,
      level: lab.level ?? 0,
      tone: lab.level === null ? "muted" : toneFor(lab.level * 720, govt, govt - 90),
      big: lab.level === null ? "—" : String(Math.round(lab.level * 720)),
      unit: "/720",
      note: `Govt MBBS ~${govt} · AIIMS ~${aiims}`,
      target: govt / 720,
    },
    {
      key: "acc",
      label: "Accuracy",
      value: lab.accuracy,
      level: lab.accuracy ?? 0,
      tone: lab.accuracy === null ? "muted" : toneFor(lab.accuracy, 0.9, 0.8),
      big: lab.accuracy === null ? "—" : String(Math.round(lab.accuracy * 100)),
      unit: "%",
      note: "right ÷ attempted · aim 90%+",
      target: 0.9,
    },
    {
      key: "att",
      label: "Attempted",
      value: lab.attempted,
      level: lab.attempted ?? 0,
      tone: lab.attempted === null ? "muted" : toneFor(lab.attempted, 0.92, 0.8),
      big: lab.attempted === null ? "—" : String(Math.round(lab.attempted * 100)),
      unit: "%",
      note: "of questions touched · aim 92%+",
      target: 0.92,
    },
    {
      key: "leak",
      label: "Negative leak",
      value: lab.leak,
      level: lab.leak === null ? 0 : Math.min(1, lab.leak / 0.25),
      tone: lab.leak === null ? "muted" : toneFor(lab.leak, 0.04, 0.1, true),
      big: lab.leak === null ? "—" : (lab.leak * 100).toFixed(lab.leak < 0.1 ? 1 : 0),
      unit: "%",
      note: lab.wrongPerTest === null ? "of earned marks given back" : `≈ −${Math.round(lab.wrongPerTest)} marks a test to negatives`,
      target: 0.04 / 0.25,
    },
    {
      key: "pace",
      label: "Pace",
      value: lab.pace,
      level: lab.pace === null ? 0 : Math.min(1, NEET_SECONDS_PER_Q / lab.pace),
      tone: lab.pace === null ? "muted" : toneFor(lab.pace, 60, 75, true),
      big: lab.pace === null ? "—" : String(Math.round(lab.pace)),
      unit: "s/q",
      note: lab.pace === null ? "timed in CBT attempts only" : "NEET budget is 60s a question",
      target: 1,
    },
  ];

  const worst = [...lab.subjects].filter((s) => s.now !== null).sort((a, b) => (a.now! - a.leak) - (b.now! - b.leak))[0];
  const weakVial = vials.filter((v) => v.value !== null && v.tone === "bad")[0];
  const rack = attempts.slice(-14);
  const empty = attempts.length === 0 && (loaded || cbt.length > 0);
  const reading = attempts.length === 0 && !empty;

  return (
    <section className="lab" aria-label="Practice lab bench">
      <div className="lab-top">
        <div className="lab-read">
          <span className="lab-kicker"><FlaskConical size={15} /> {reading ? "Lab bench · reading your attempts…" : `Lab bench · last ${lab.n || 0} ${active === "cbt" ? "CBT attempts" : "logged mocks"}`}</span>
          <h2>
            Every attempt, <em>poured into glass.</em>
          </h2>
          <p>
            Five tubes read how you take a paper — not just what you scored. Green is on target, amber needs a nudge, red is costing rank.
            The dashed line in each tube is the mark to reach.
          </p>
          {(cbt.length > 0 && mocks.length > 0) || source ? (
            <div className="pl-seg lab-src" style={{ "--n": 2, "--i": active === "cbt" ? 0 : 1 } as CSSProperties}>
              <button type="button" aria-pressed={active === "cbt"} onClick={() => setSource("cbt")}>CBT attempts · {cbt.length}</button>
              <button type="button" aria-pressed={active === "mocks"} onClick={() => setSource("mocks")}>Logged mocks · {mocks.length}</button>
            </div>
          ) : null}
          {!empty && (weakVial || worst) ? (
            <div className="lab-rx pl-glass">
              <Sparkles size={16} />
              <span>
                {weakVial ? <><b>{weakVial.label}</b> is your loudest leak right now. </> : null}
                {worst ? <>In subjects, <b>{worst.key}</b> holds the most marks to win back.</> : null}
              </span>
              <button type="button" className="pl-btn pl-btn-sm pl-btn-rx" onClick={onNew}>Build that test</button>
            </div>
          ) : null}
          {empty ? (
            <div className="lab-rx pl-glass">
              <Sparkles size={16} />
              <span>The tubes are clean — finish one CBT attempt (or log a mock in Tests) and they fill with your real numbers.</span>
              <button type="button" className="pl-btn pl-btn-sm pl-btn-rx" onClick={onNew}>Build first test</button>
            </div>
          ) : null}
        </div>
        <div className="lab-vials" role="list">
          {vials.map((v, i) => (
            <figure key={v.key} className={`lab-vial tone-${v.tone}`} role="listitem" style={{ "--vi": i } as CSSProperties}>
              <LabTube level={v.level} target={v.target} tone={v.tone} index={i} empty={v.value === null} />
              <figcaption>
                <strong>
                  {v.value === null ? "—" : <Roll value={Number(v.big)} decimals={v.big.includes(".") ? 1 : 0} />}
                  <small>{v.unit}</small>
                </strong>
                <span>{v.label}</span>
                <em>{v.note}</em>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="lab-split">
        <div className="lab-beakers-wrap">
          <h3>Where your marks leak</h3>
          <p>
            Each beaker is a 180-mark section. Solid is what you score, red stripes are marks lost to wrong answers
            {lab.subjects.some((s) => s.skip > 0) ? ", dots are the marks you left by skipping" : ""}, the dashed line is your May projection.
          </p>
          <div className="mk-beakers lab-beakers">
            {lab.subjects.map((s, i) => {
              const now = s.now ?? 0;
              const tone: Tone = s.now === null ? "muted" : toneFor(now, 160, 130);
              return (
                <a
                  key={s.key}
                  href={`/subjects/${s.slug}`}
                  className={`mk-beaker lab-beaker tone-${tone}`}
                  style={{ "--c": SUBJECT_COLOR[s.key], "--now": now / 180, "--risk": s.leak / 180, "--skip": s.skip / 180, "--proj": (s.proj ?? 0) / 180, "--i": i } as CSSProperties}
                >
                  <span className="mk-glass">
                    <i className="mk-skip" />
                    <i className="mk-risk" />
                    <i className="mk-now" />
                    {s.proj !== null ? <i className="mk-proj"><b>{s.proj}</b></i> : null}
                  </span>
                  <span className="mk-name">{s.key}</span>
                  <span className="mk-num">
                    <b>{s.now === null ? "—" : Math.round(now)}</b>/180
                  </span>
                  <span className={`lab-pill tone-${tone}`}>{s.now === null ? "no data" : tone === "good" ? "Strong" : tone === "warn" ? "Steady" : "Leaking"}</span>
                  <span className="mk-sub">
                    {s.now === null ? "not in these attempts" : `−${Math.round(s.leak)} ${s.leakIsWrong ? "to negatives" : "at risk"}${s.skip ? ` · ${Math.round(s.skip)} skipped` : ""}`}
                  </span>
                </a>
              );
            })}
          </div>
          <div className="lab-legend">
            <span><i className="k-good" /> 160+ strong</span>
            <span><i className="k-warn" /> 130–159 steady</span>
            <span><i className="k-bad" /> under 130 leaking</span>
          </div>
        </div>

        <div className="lab-rack-wrap">
          <h3>The rack</h3>
          <p>Your last {rack.length || "few"} attempts, oldest on the left. Height is the score share; colour is the band it landed in.</p>
          <div className="lab-rack" onMouseLeave={() => setHover(null)}>
            {rack.map((a, i) => {
                  const score720 = a.pct * 720;
                  const tone = toneFor(score720, govt, govt - 90);
                  const body = (
                    <>
                      <LabTube level={a.pct} tone={tone} index={i} target={govt / 720} />
                      <b>{Math.round(a.pct * 100)}</b>
                    </>
                  );
                  return a.openable ? (
                    <button key={a.id} type="button" className="lab-slot" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => onOpen(a.id)} aria-label={`${a.label}: ${a.score} of ${a.max}`}>
                      {body}
                    </button>
                  ) : (
                    <span key={a.id} className="lab-slot" onMouseEnter={() => setHover(i)} aria-label={`${a.label}: ${a.score} of ${a.max}`}>
                      {body}
                    </span>
                  );
                })}
            {Array.from({ length: Math.max(0, 10 - rack.length) }, (_, i) => (
              <span key={`empty-${i}`} className="lab-slot lab-slot-empty" aria-hidden="true">
                <LabTube level={0} empty tone="muted" index={rack.length + i} />
                <b>·</b>
              </span>
            ))}
            {hover !== null && rack[hover] ? (
              <div className="pl-tip lab-tip" style={{ left: `${((hover + 0.5) / Math.max(10, rack.length)) * 100}%`, top: 0 }}>
                <span className="k">{short(rack[hover].date)}</span>
                <strong>
                  {rack[hover].score}/{rack[hover].max}
                </strong>
                <div>{rack[hover].label}</div>
                {rack[hover].correct !== null ? (
                  <div className="row">
                    <span>right · wrong · skip</span>
                    <b>
                      {rack[hover].correct} · {rack[hover].wrong} · {rack[hover].skipped}
                    </b>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="lab-rack-foot">
            <span>dashed line = Govt MBBS bar (~{govt}/720)</span>
            {active === "cbt" ? <span>tap a tube to reopen its review</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
