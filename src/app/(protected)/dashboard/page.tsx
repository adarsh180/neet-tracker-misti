"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight, Brain, RefreshCw, Target } from "lucide-react";

import SmoothLink from "@/components/layout/smooth-link";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { HologramWidget } from "@/components/hologram/hologram-widget";
import { CountdownGlass } from "@/components/pulse/dashboard/countdown-glass";
import { ReadinessFlask } from "@/components/pulse/dashboard/readiness-flask";
import { ScoreHistory } from "@/components/pulse/dashboard/score-history";
import { SeatOdds } from "@/components/pulse/dashboard/seat-odds";
import { StudyRhythm } from "@/components/pulse/dashboard/study-rhythm";
import type { PulseInsights } from "@/lib/pulse-insights";
import { runSeatModel } from "@/lib/seat-model";

const SUBJECT_COLOR: Record<string, string> = {
  Physics: "var(--physics)",
  Chemistry: "var(--chemistry)",
  Botany: "var(--botany)",
  Zoology: "var(--zoology)",
};

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/* Liquid level inside each vital tile — how full today is against its target. */
function Fill({ level }: { level: number }) {
  return <span className="vt-fill" style={{ "--lv": Math.max(0.04, Math.min(1, level)) } as CSSProperties} aria-hidden="true"><i /></span>;
}

export default function DashboardPage() {
  const [data, setData] = useState<PulseInsights | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/insights/pulse", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as PulseInsights);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const base = useMemo(() => (data ? runSeatModel(data.model.inputs, data.model.observed) : null), [data]);

  if (!data || !base) {
    if (failed) {
      return (
        <main className="pl-page pd">
          <div className="pl-empty">
            <strong>Your vitals didn&apos;t load.</strong>
            The database is slow to wake. Try again in a moment — nothing you logged is lost.
            <button type="button" className="pl-btn" onClick={() => void load()} style={{ justifySelf: "start" }}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        </main>
      );
    }
    return <HeartLoader label="Reading your vitals" />;
  }

  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now));
  const greeting = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLine = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(now);
  const highRisks = data.risks.filter((r) => r.severity === "high").length;
  const accuracy = data.model.inputs.observedAccuracy;
  const thresholds = base.tiers.map((t) => ({ key: t.key, label: t.label, score: t.threshold }));

  const vitals = [
    { level: data.today.hours / 8, kind: "ecg" as const, tone: "v-green", label: "Hours today", value: data.today.hours ? String(Math.round(data.today.hours * 10) / 10) : "0", unit: "h", note: `${data.totals.avgHours28.toFixed(1)}h a day this month` },
    { level: data.today.questions / 150, kind: "pleth" as const, tone: "v-cyan", label: "MCQs today", value: String(data.today.questions), unit: "", note: `${Math.round(data.totals.avgQuestions28)} a day this month` },
    { level: accuracy ?? 0, kind: "resp" as const, tone: "v-amber", label: "Accuracy", value: accuracy === null ? "—" : String(Math.round(accuracy * 100)), unit: accuracy === null ? "" : "%", note: `${data.model.inputs.mockCount} full mocks logged` },
    { level: data.today.streak / 30, kind: "beat" as const, tone: "v-pink", label: "Streak", value: String(data.today.streak), unit: "d", note: `${data.totals.loggedDays} days logged in all` },
  ];

  return (
    <main className="pl-page pd">
      <header className="pd-hero">
        <div className="pd-hello">
          <span className="pl-kicker">
            <span className="pl-live">Live from your logs</span>
            <span className="pl-deva">सरस्वत्यै नमः</span>
          </span>
          <h1 className="pl-title">
            <span className="pl-line"><span style={{ "--l": 0 } as CSSProperties}>{greeting},</span></span>
            <span className="pl-line"><span style={{ "--l": 1 } as CSSProperties}><em>Misti.</em></span></span>
          </h1>
          <p className="pl-lede">
            {dateLine}. {data.today.hours > 0 ? `${data.today.hours}h logged today` : "Nothing logged yet today"}
            {highRisks ? ` — ${highRisks} thing${highRisks > 1 ? "s" : ""} need attention below.` : " — no red flags right now."}
          </p>
          <div className="pd-actions">
            <SmoothLink href="/daily-goals" className="pl-btn pl-btn-rx">
              <Target size={16} /> Log today
            </SmoothLink>
            <SmoothLink href="/ai-insights/neet-guru" className="pl-btn">
              <Brain size={16} /> Ask NEET-GURU
            </SmoothLink>
            <button type="button" className="pl-btn pl-btn-sm pd-refresh" onClick={() => void load()} aria-label="Refresh vitals">
              <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <div className="pd-holo">
        <HologramWidget aside={<CountdownGlass target={data.exam} />} />
      </div>

      <section className="vt" aria-label="Today's vitals">
        {vitals.map((v, i) => (
          <div key={v.label} className={`vt-tile ${v.tone}`} style={{ "--i": i } as CSSProperties}>
            <span className="vt-label">{v.label}</span>
            <span className="vt-value">
              {v.value}
              <small>{v.unit}</small>
            </span>
            <span className="vt-note">{v.note}</span>
            <Fill level={v.level} />
          </div>
        ))}
      </section>

      <section className="pl-sect" id="standing">
        <div className="pl-sect-head">
          <span />
          <h2>Where you <em>stand</em></h2>
          <p>How much of the syllabus is done, and how ready you are for the paper today — from topics, revision, mocks, accuracy, MCQs, chapter mastery, consistency and mood. Hover a part to see what it adds.</p>
        </div>
        <ReadinessFlask readiness={data.readiness} syllabus={data.syllabus} />
      </section>

      <section className="pl-sect" id="seat">
        <div className="pl-sect-head">
          <span />
          <h2>Your <em>seat odds</em></h2>
          <p>From your mocks, chapters and daily effort — then move the sliders to see which habit changes your rank.</p>
        </div>
        <SeatOdds inputs={data.model.inputs} observed={data.model.observed} attempts={data.attempts} />
      </section>

      <section className="pl-sect" id="marks">
        <div className="pl-sect-head">
          <span />
          <h2>Where your <em>marks leak</em></h2>
          <p>Each beaker is a 180-mark paper: solid is what you&apos;d score today, striped is what weak chapters are costing you, the line is where your current pace takes it by May.</p>
        </div>
        <div className="mk">
          <div className="mk-beakers">
            {data.subjects.map((s, i) => {
              const risk = Math.min(s.damage, 180 - s.expected);
              const proj = base.subjects[s.key];
              return (
                <SmoothLink
                  key={s.key}
                  href={`/subjects/${s.slug}`}
                  className="mk-beaker"
                  style={{ "--c": SUBJECT_COLOR[s.key], "--now": s.expected / 180, "--risk": risk / 180, "--proj": proj / 180, "--i": i } as CSSProperties}
                >
                  <span className="mk-glass">
                    <i className="mk-risk" />
                    <i className="mk-now" />
                    <i className="mk-proj"><b>{proj}</b></i>
                  </span>
                  <span className="mk-name">{s.key}</span>
                  <span className="mk-num">
                    <b>{s.expected}</b>/180 today
                  </span>
                  <span className="mk-sub">~{Math.round(risk)} at risk · {Math.round(s.completion * 100)}% topics</span>
                </SmoothLink>
              );
            })}
          </div>
          <div className="mk-fix">
            <h3>Fix these first</h3>
            <p>Chapters where the most marks are slipping, weighted by how often NEET asks them.</p>
            <ol>
              {data.chapters.map((c, i) => (
                <li key={`${c.subject}-${c.chapter}`} style={{ "--c": SUBJECT_COLOR[c.subject], "--m": c.mastery / 100, "--i": i } as CSSProperties}>
                  <span className="mk-dot" />
                  <span className="mk-ch">
                    <b>{c.chapter.replace(/^\d+\s*/, "")}</b>
                    <small>{c.subject} · {c.mastery}% mastery</small>
                  </span>
                  <span className="mk-bar"><i /></span>
                  <span className="mk-gain">+{Math.round(c.damage)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="pl-sect" id="rhythm">
        <div className="pl-sect-head">
          <span />
          <h2>Study <em>rhythm</em></h2>
          <p>One bar per day since you started logging, with your seven-day average running through it. Hover any day to read it.</p>
        </div>
        <StudyRhythm days={data.days} today={istToday()} />
      </section>

      <section className="pl-sect" id="history">
        <div className="pl-sect-head">
          <span />
          <h2>Score <em>journey</em></h2>
          <p>Your real NEET attempts and every mock (scaled to 720) on one line, against the scores each seat has needed.</p>
        </div>
        <ScoreHistory attempts={data.attempts} tests={data.tests} exam={data.exam} thresholds={thresholds} />
      </section>

      <section className="pl-sect" id="risks">
        <div className="pl-sect-head">
          <span />
          <h2>What could cost you the <em>seat</em></h2>
        </div>
        <div className="rk">
          <ol className="rk-list">
            {data.risks.map((r, i) => (
              <li key={r.id} className={`rk-item is-${r.severity}`} style={{ "--i": i } as CSSProperties}>
                <span className="rk-sev">{r.severity === "high" ? "Urgent" : r.severity === "medium" ? "Watch" : "Note"}</span>
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.detail}</p>
                </div>
                <SmoothLink href={r.href} className="rk-go" aria-label={`Fix: ${r.title}`}>
                  Fix <ArrowUpRight size={14} />
                </SmoothLink>
              </li>
            ))}
            {!data.risks.length ? (
              <li className="rk-item is-low">
                <div>
                  <strong>Nothing urgent right now.</strong>
                  <p>Keep logging — this list rewrites itself every time you do.</p>
                </div>
              </li>
            ) : null}
          </ol>
          {data.wins.length ? (
            <aside className="rk-wins">
              <h3>Working for you</h3>
              <ul>
                {data.wins.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </section>
    </main>
  );
}
