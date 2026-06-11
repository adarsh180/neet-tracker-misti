"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, BookOpenCheck, CheckCircle2,
  ChevronLeft, Clock3, FilePlus2, Loader2, ShieldCheck, Swords, Trash2, XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import SmoothLink from "@/components/layout/smooth-link";

type Subject = { id: string; slug: string; name: string; emoji: string; topics: { name: string; chapter: string | null }[] };

type Question = {
  id: string;
  subject: string;
  chapter: string;
  topic: string | null;
  source: "NEET_PYQ" | "JEE_PYQ" | "INSTITUTE" | "PLATFORM" | "AI";
  sourceRef: string;
  difficulty: "EASY" | "MODERATE" | "TOUGH";
  question: string;
  options: string[];
  verified: boolean;
  correctIndex: number | null;
  explanation: string | null;
};

type PracticeResult = {
  score: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  timeTakenSeconds: number | null;
  subjectScores: { subject: string; score: number; maxScore: number; correct: number; wrong: number; skipped: number }[];
};

type PracticeTest = {
  id: string;
  title: string;
  mode: string;
  subject: string | null;
  chapter: string | null;
  topic: string | null;
  pyqYear: string | null;
  questionCount: number;
  generatedCount: number;
  difficulty: string;
  status: "GENERATING" | "READY" | "COMPLETED";
  createdAt: string;
  result: PracticeResult | null;
  answers: { id: string; optionIndex: number | null }[] | null;
  questions?: Question[];
};

const SOURCE_LABEL: Record<Question["source"], string> = {
  NEET_PYQ: "NEET PYQ",
  JEE_PYQ: "JEE Main PYQ",
  INSTITUTE: "Institute series",
  PLATFORM: "Platform",
  AI: "AI original",
};

const MODE_LABEL: Record<string, string> = {
  FULL_LENGTH: "Full length",
  SUBJECT: "Subject",
  CHAPTER: "Chapter",
  TOPIC: "Topic",
  PYQ_YEAR: "NEET PYQ year",
};

function Md({ text }: { text: string }) {
  return (
    <div className="md-block">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
      <style jsx>{`
        .md-block :global(p) { margin: 0 0 6px; }
        .md-block :global(p:last-child) { margin-bottom: 0; }
        .md-block :global(.katex) { font-size: 1.02em; }
        .md-block :global(table) { border-collapse: collapse; margin: 6px 0; }
        .md-block :global(td), .md-block :global(th) { border: 1px solid rgba(255,255,255,0.14); padding: 4px 9px; font-size: 12.5px; }
      `}</style>
    </div>
  );
}

function fmtClock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Phase = "list" | "setup" | "generating" | "exam" | "result";

export default function PracticePage() {
  const [phase, setPhase] = useState<Phase>("list");
  const [tests, setTests] = useState<PracticeTest[]>([]);
  const [active, setActive] = useState<PracticeTest | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/practice", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setTests(json.tests);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
    // ?year=YYYY deep link from the PYQ library opens setup pre-configured.
    const params = new URLSearchParams(window.location.search);
    if (params.get("year")) setPhase("setup");
  }, [loadList]);

  const openTest = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch(`/api/practice/${id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not open the test");
      return;
    }
    const test: PracticeTest = json.test;
    setActive(test);
    if (test.status === "GENERATING") setPhase("generating");
    else if (test.status === "READY") setPhase("exam");
    else setPhase("result");
  }, []);

  return (
    <div className="pa-wrap">
      {phase === "list" && (
        <ListView
          tests={tests}
          loading={listLoading}
          error={error}
          onNew={() => setPhase("setup")}
          onOpen={openTest}
          onDeleted={loadList}
        />
      )}
      {phase === "setup" && (
        <SetupView
          onBack={() => setPhase("list")}
          onCreated={(test) => {
            setActive(test);
            setPhase("generating");
          }}
        />
      )}
      {phase === "generating" && active && (
        <GeneratingView
          test={active}
          onReady={(test) => {
            setActive(test);
            setPhase("exam");
          }}
          onCancel={() => {
            setActive(null);
            setPhase("list");
            loadList();
          }}
        />
      )}
      {phase === "exam" && active && (
        <ExamView
          test={active}
          onSubmitted={(test) => {
            setActive(test);
            setPhase("result");
            loadList();
          }}
          onExit={() => {
            setActive(null);
            setPhase("list");
            loadList();
          }}
        />
      )}
      {phase === "result" && active && (
        <ResultView
          test={active}
          onBack={() => {
            setActive(null);
            setPhase("list");
            loadList();
          }}
        />
      )}
      <style jsx>{`
        .pa-wrap { max-width: 920px; margin: 0 auto; padding: 18px 14px 90px; }
        @media (min-width: 640px) { .pa-wrap { padding: 24px 20px 90px; } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── List ──

function ListView({
  tests, loading, error, onNew, onOpen, onDeleted,
}: {
  tests: PracticeTest[];
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDeleted: () => void;
}) {
  const deleteTest = async (id: string) => {
    await fetch(`/api/practice/${id}`, { method: "DELETE" });
    onDeleted();
  };

  return (
    <div>
      <header className="pa-head">
        <div className="pa-head-icon"><Swords size={22} strokeWidth={1.8} /></div>
        <div className="pa-head-text">
          <h1>Practice Arena</h1>
          <p>PYQ-first papers, blind-verified answer keys, auto-logged to Tests &amp; Error Log</p>
        </div>
        <button className="pa-new" onClick={onNew}><FilePlus2 size={16} /> New test</button>
      </header>

      {error && <p className="pa-error">{error}</p>}

      {loading ? (
        <div className="pa-state"><Loader2 size={22} className="pa-spin" /><p>Loading your papers…</p></div>
      ) : tests.length === 0 ? (
        <div className="pa-state">
          <BookOpenCheck size={26} />
          <p>No papers yet. Build your first one — minimum 50 questions, up to a full 180-question mock.</p>
          <button className="pa-new" onClick={onNew}><FilePlus2 size={16} /> Build first paper</button>
        </div>
      ) : (
        <div className="pa-list">
          {tests.map((test) => (
            <div key={test.id} className="pa-row">
              <button className="pa-row-main" onClick={() => onOpen(test.id)}>
                <span className="pa-row-title">{test.title}</span>
                <span className="pa-row-sub">
                  {MODE_LABEL[test.mode] ?? test.mode} · {new Date(test.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                </span>
              </button>
              {test.status === "COMPLETED" && test.result ? (
                <span className="pa-chip pa-chip--done">{test.result.score}/{test.result.maxScore}</span>
              ) : test.status === "READY" ? (
                <span className="pa-chip pa-chip--ready">Ready to attempt</span>
              ) : (
                <span className="pa-chip">{test.generatedCount}/{test.questionCount} building…</span>
              )}
              {test.status !== "COMPLETED" && (
                <button className="pa-del" onClick={() => deleteTest(test.id)} aria-label="Delete draft"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .pa-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
        .pa-head-icon {
          width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--gold-dim); color: var(--gold); border: 1px solid var(--gold-glow);
        }
        .pa-head-text { flex: 1; min-width: 200px; }
        .pa-head-text h1 { font-family: 'Playfair Display', serif; font-size: 22px; color: var(--text-primary); margin: 0; }
        .pa-head-text p { font-size: 12px; color: var(--text-secondary); margin: 2px 0 0; }
        .pa-new {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 16px; border-radius: 12px; cursor: pointer;
          background: var(--gold-dim); border: 1px solid var(--gold-glow); color: var(--gold);
          font-weight: 700; font-size: 13px;
        }
        .pa-error { color: var(--danger); font-size: 13px; }
        .pa-state {
          text-align: center; padding: 48px 20px; border-radius: 18px;
          background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06);
          color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 12px;
          font-size: 13.5px;
        }
        :global(.pa-spin) { animation: pa-rot 1s linear infinite; }
        @keyframes pa-rot { to { transform: rotate(360deg); } }
        .pa-list { display: flex; flex-direction: column; gap: 8px; }
        .pa-row {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px; border-radius: 14px;
          background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06);
        }
        .pa-row-main { flex: 1; min-width: 0; background: none; border: none; text-align: left; cursor: pointer; padding: 0; }
        .pa-row-title { display: block; font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
        .pa-row-sub { display: block; font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
        .pa-chip {
          flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary);
        }
        .pa-chip--done { color: var(--gold); border-color: var(--gold-glow); }
        .pa-chip--ready { color: var(--success); border-color: hsla(142, 60%, 56%, 0.4); }
        .pa-del { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px; }
        .pa-del:hover { color: var(--danger); }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Setup ──

function SetupView({ onBack, onCreated }: { onBack: () => void; onCreated: (test: PracticeTest) => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const initialYear = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("year") : null;
  const [mode, setMode] = useState<string>(initialYear ? "PYQ_YEAR" : "FULL_LENGTH");
  const [subject, setSubject] = useState<string>("physics");
  const [chapter, setChapter] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [pyqYear, setPyqYear] = useState<string>(initialYear ?? "2025");
  const [count, setCount] = useState(mode === "FULL_LENGTH" ? 180 : 50);
  const [difficulty, setDifficulty] = useState("MIXED");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/subjects", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => Array.isArray(json) && setSubjects(json))
      .catch(() => {});
  }, []);

  const activeSubject = subjects.find((entry) => entry.slug === subject);
  const chapters = useMemo(
    () => [...new Set((activeSubject?.topics ?? []).map((topicRow) => topicRow.chapter).filter(Boolean))] as string[],
    [activeSubject],
  );
  const topics = useMemo(
    () => (activeSubject?.topics ?? []).filter((topicRow) => !chapter || topicRow.chapter === chapter).map((topicRow) => topicRow.name),
    [activeSubject, chapter],
  );

  const years = useMemo(() => Array.from({ length: 2025 - 2006 + 1 }, (_, index) => String(2025 - index)), []);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          subject: mode === "FULL_LENGTH" || mode === "PYQ_YEAR" ? null : subject,
          chapter: mode === "CHAPTER" || mode === "TOPIC" ? chapter || null : null,
          topic: mode === "TOPIC" ? topic || null : null,
          pyqYear: mode === "PYQ_YEAR" ? pyqYear : null,
          questionCount: count,
          difficulty,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create the test");
      onCreated(json.test);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the test");
    } finally {
      setCreating(false);
    }
  };

  const canCreate =
    (mode === "FULL_LENGTH" || mode === "PYQ_YEAR") ||
    (mode === "SUBJECT" && subject) ||
    (mode === "CHAPTER" && subject && chapter) ||
    (mode === "TOPIC" && subject && topic);

  return (
    <div className="su">
      <button className="su-back" onClick={onBack}><ChevronLeft size={15} /> All papers</button>
      <h1 className="su-title">Build a paper</h1>
      <p className="su-sub">PYQ-first sourcing · every answer key is blind-verified before the paper unlocks</p>

      <div className="su-card">
        <label className="su-label">Test type</label>
        <div className="su-pills">
          {Object.entries(MODE_LABEL).map(([value, label]) => (
            <button
              key={value}
              className={`su-pill ${mode === value ? "su-pill--on" : ""}`}
              onClick={() => {
                setMode(value);
                setCount(value === "FULL_LENGTH" || value === "PYQ_YEAR" ? 180 : 50);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "PYQ_YEAR" && (
          <>
            <label className="su-label">NEET UG year</label>
            <div className="su-pills su-pills--scroll">
              {years.map((year) => (
                <button key={year} className={`su-pill ${pyqYear === year ? "su-pill--on" : ""}`} onClick={() => setPyqYear(year)}>
                  {year}
                </button>
              ))}
            </div>
          </>
        )}

        {(mode === "SUBJECT" || mode === "CHAPTER" || mode === "TOPIC") && (
          <>
            <label className="su-label">Subject</label>
            <div className="su-pills">
              {["physics", "chemistry", "botany", "zoology"].map((slug) => (
                <button
                  key={slug}
                  className={`su-pill ${subject === slug ? "su-pill--on" : ""}`}
                  onClick={() => { setSubject(slug); setChapter(""); setTopic(""); }}
                >
                  {slug[0].toUpperCase() + slug.slice(1)}
                </button>
              ))}
            </div>
          </>
        )}

        {(mode === "CHAPTER" || mode === "TOPIC") && (
          <>
            <label className="su-label">Chapter</label>
            <select className="su-select" value={chapter} onChange={(event) => { setChapter(event.target.value); setTopic(""); }}>
              <option value="">Select chapter…</option>
              {chapters.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </>
        )}

        {mode === "TOPIC" && (
          <>
            <label className="su-label">Topic</label>
            <select className="su-select" value={topic} onChange={(event) => setTopic(event.target.value)}>
              <option value="">Select topic…</option>
              {topics.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </>
        )}

        <label className="su-label">Questions — {count} ({count * 4} marks · ~{count} min)</label>
        <input type="range" min={50} max={180} step={5} value={count} onChange={(event) => setCount(Number(event.target.value))} className="su-range" />
        <div className="su-range-marks"><span>50</span><span>90</span><span>135</span><span>180</span></div>

        <label className="su-label">Difficulty</label>
        <div className="su-pills">
          {["MIXED", "EASY", "MODERATE", "TOUGH"].map((value) => (
            <button key={value} className={`su-pill ${difficulty === value ? "su-pill--on" : ""}`} onClick={() => setDifficulty(value)}>
              {value === "MIXED" ? "NEET mix" : value[0] + value.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {error && <p className="su-error">{error}</p>}
        <button className="su-create" disabled={!canCreate || creating} onClick={create}>
          {creating ? <><Loader2 size={15} className="pa-spin" /> Setting up…</> : <>Generate paper <ArrowRight size={15} /></>}
        </button>
        <p className="su-note">Generation runs in verified batches of ~10 — a 50-question paper takes a few minutes, a full mock longer. You can leave and return; progress is saved.</p>
      </div>

      <style jsx>{`
        .su-back { display: inline-flex; align-items: center; gap: 5px; background: none; border: none; color: var(--text-secondary); font-size: 13px; cursor: pointer; padding: 0 0 12px; }
        .su-title { font-family: 'Playfair Display', serif; font-size: 22px; color: var(--text-primary); margin: 0; }
        .su-sub { font-size: 12.5px; color: var(--text-secondary); margin: 4px 0 16px; }
        .su-card { padding: 18px 16px; border-radius: 18px; background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06); }
        .su-label { display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin: 16px 0 8px; }
        .su-label:first-child { margin-top: 0; }
        .su-pills { display: flex; flex-wrap: wrap; gap: 7px; }
        .su-pills--scroll { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
        .su-pill {
          padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary);
        }
        .su-pill--on { background: var(--gold-dim); border-color: var(--gold); color: var(--gold); }
        .su-select {
          width: 100%; padding: 11px 12px; border-radius: 10px; font-size: 13px;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary);
        }
        .su-range { width: 100%; accent-color: var(--gold); }
        .su-range-marks { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--text-muted); }
        .su-error { color: var(--danger); font-size: 12.5px; }
        .su-create {
          width: 100%; margin-top: 18px; padding: 13px; border-radius: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: var(--gold-dim); border: 1px solid var(--gold-glow); color: var(--gold);
          font-weight: 800; font-size: 14px;
        }
        .su-create:disabled { opacity: 0.45; cursor: not-allowed; }
        .su-note { font-size: 11.5px; color: var(--text-muted); margin: 10px 0 0; line-height: 1.5; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────── Generating ──

function GeneratingView({
  test, onReady, onCancel,
}: {
  test: PracticeTest;
  onReady: (test: PracticeTest) => void;
  onCancel: () => void;
}) {
  const [generated, setGenerated] = useState(test.generatedCount);
  const [failures, setFailures] = useState(0);
  const [paused, setPaused] = useState(false);
  const runningRef = useRef(false);

  useEffect(() => {
    if (paused || runningRef.current) return;
    runningRef.current = true;
    let cancelled = false;

    const loop = async () => {
      let consecutiveEmpty = 0;
      while (!cancelled) {
        try {
          const res = await fetch(`/api/practice/${test.id}/generate`, { method: "POST" });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Batch failed");
          setGenerated(json.generated);
          if (json.status === "READY") {
            const full = await fetch(`/api/practice/${test.id}`, { cache: "no-store" }).then((response) => response.json());
            if (!cancelled) onReady(full.test);
            return;
          }
          consecutiveEmpty = json.added === 0 ? consecutiveEmpty + 1 : 0;
          if (consecutiveEmpty >= 3) throw new Error("The generator is struggling — pause and retry.");
        } catch {
          if (!cancelled) {
            setFailures((count) => count + 1);
            setPaused(true);
            runningRef.current = false;
          }
          return;
        }
      }
    };
    loop();
    return () => {
      cancelled = true;
      runningRef.current = false;
    };
  }, [paused, test.id, onReady]);

  const pct = Math.round((generated / test.questionCount) * 100);

  return (
    <div className="ge">
      <h1 className="ge-title">{test.title}</h1>
      <div className="ge-card">
        <div className="ge-ring"><Loader2 size={28} className={paused ? "" : "pa-spin"} /></div>
        <p className="ge-status">{paused ? "Paused" : "Composing & blind-verifying questions…"}</p>
        <div className="ge-bar"><div className="ge-bar-fill" style={{ width: `${pct}%` }} /></div>
        <p className="ge-count">{generated} / {test.questionCount} questions locked in ({pct}%)</p>
        <p className="ge-note">Each batch is generated, then re-solved blind by a second pass — questions whose keys don&apos;t survive verification are thrown away. PYQs first, then institute-standard, then originals.</p>
        {failures > 0 && paused && (
          <button className="ge-retry" onClick={() => setPaused(false)}>Resume generation</button>
        )}
        <button className="ge-cancel" onClick={onCancel}><ArrowLeft size={14} /> Back to papers (keeps progress)</button>
      </div>
      <style jsx>{`
        .ge-title { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--text-primary); margin: 0 0 16px; }
        .ge-card {
          padding: 32px 20px; border-radius: 18px; text-align: center;
          background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06);
          display: flex; flex-direction: column; align-items: center; gap: 12px;
        }
        .ge-ring { color: var(--gold); }
        .ge-status { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0; }
        .ge-bar { width: 100%; max-width: 420px; height: 10px; border-radius: 999px; background: var(--bg-elevated); overflow: hidden; }
        .ge-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--gold), var(--gold-bright)); transition: width 0.6s ease; }
        .ge-count { font-size: 12.5px; color: var(--gold); font-weight: 700; margin: 0; }
        .ge-note { font-size: 12px; color: var(--text-secondary); max-width: 480px; line-height: 1.6; margin: 0; }
        .ge-retry { padding: 10px 22px; border-radius: 10px; background: var(--gold-dim); border: 1px solid var(--gold-glow); color: var(--gold); font-weight: 700; cursor: pointer; }
        .ge-cancel { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: var(--text-muted); font-size: 12.5px; cursor: pointer; }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── Exam ──

function ExamView({
  test, onSubmitted, onExit,
}: {
  test: PracticeTest;
  onSubmitted: (test: PracticeTest) => void;
  onExit: () => void;
}) {
  const questions = useMemo(() => test.questions ?? [], [test.questions]);
  const storageKey = `practice-answers-${test.id}`;
  const startKey = `practice-start-${test.id}`;

  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  });
  const [index, setIndex] = useState(0);
  const [showPalette, setShowPalette] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Number(localStorage.getItem(startKey)) || Date.now();
    localStorage.setItem(startKey, String(started));
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(answers));
  }, [answers, storageKey]);

  const question = questions[index];
  const answeredCount = Object.keys(answers).length;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/practice/${test.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((entry) => ({ id: entry.id, optionIndex: answers[entry.id] ?? null })),
          timeTakenSeconds: elapsed,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submission failed");
      localStorage.removeItem(storageKey);
      localStorage.removeItem(startKey);
      onSubmitted(json.test);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setSubmitting(false);
    }
  };

  if (!question) return null;

  return (
    <div className="ex">
      <div className="ex-top">
        <button className="ex-exit" onClick={onExit}><ArrowLeft size={15} /></button>
        <div className="ex-meta">
          <strong>Q{index + 1}</strong><span>/{questions.length}</span>
        </div>
        <div className="ex-timer"><Clock3 size={14} /> {fmtClock(elapsed)}</div>
        <button className="ex-palette-toggle" onClick={() => setShowPalette((value) => !value)}>
          {answeredCount}/{questions.length}
        </button>
      </div>

      {showPalette && (
        <div className="ex-palette">
          {questions.map((entry, qIndex) => (
            <button
              key={entry.id}
              className={`ex-cell ${answers[entry.id] !== undefined ? "ex-cell--done" : ""} ${qIndex === index ? "ex-cell--now" : ""}`}
              onClick={() => { setIndex(qIndex); setShowPalette(false); }}
            >
              {qIndex + 1}
            </button>
          ))}
        </div>
      )}

      <div className="ex-q">
        <div className="ex-q-meta">
          <span className="ex-tag">{question.subject}</span>
          <span className="ex-tag ex-tag--soft">{question.chapter}</span>
          <span className="ex-tag ex-tag--soft">{question.difficulty}</span>
        </div>
        <div className="ex-q-text"><Md text={question.question} /></div>
        <div className="ex-options">
          {question.options.map((option, optionIndex) => (
            <button
              key={optionIndex}
              className={`ex-opt ${answers[question.id] === optionIndex ? "ex-opt--on" : ""}`}
              onClick={() =>
                setAnswers((prev) => {
                  const next = { ...prev };
                  if (next[question.id] === optionIndex) delete next[question.id];
                  else next[question.id] = optionIndex;
                  return next;
                })
              }
            >
              <span className="ex-opt-letter">{String.fromCharCode(65 + optionIndex)}</span>
              <span className="ex-opt-text"><Md text={option} /></span>
            </button>
          ))}
        </div>
      </div>

      <div className="ex-nav">
        <button className="ex-nav-btn" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>
          <ArrowLeft size={15} /> Prev
        </button>
        {index < questions.length - 1 ? (
          <button className="ex-nav-btn ex-nav-btn--next" onClick={() => setIndex((value) => value + 1)}>
            Next <ArrowRight size={15} />
          </button>
        ) : (
          <button className="ex-nav-btn ex-nav-btn--submit" onClick={() => setConfirming(true)}>
            Submit paper
          </button>
        )}
      </div>
      <button className="ex-submit-anytime" onClick={() => setConfirming(true)}>Finish &amp; submit ({answeredCount} answered, {questions.length - answeredCount} blank)</button>

      {confirming && (
        <div className="ex-confirm">
          <div className="ex-confirm-box">
            <AlertTriangle size={22} />
            <h3>Submit this paper?</h3>
            <p>{answeredCount} answered · {questions.length - answeredCount} unanswered · {fmtClock(elapsed)} elapsed. Marks: +4 correct, −1 wrong, 0 skipped. This auto-saves to your Test log and Error log.</p>
            {error && <p className="ex-err">{error}</p>}
            <div className="ex-confirm-actions">
              <button className="ex-back" onClick={() => setConfirming(false)} disabled={submitting}>Keep attempting</button>
              <button className="ex-go" onClick={submit} disabled={submitting}>
                {submitting ? <><Loader2 size={14} className="pa-spin" /> Grading…</> : "Submit for grading"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .ex-top {
          position: sticky; top: 0; z-index: 20;
          display: flex; align-items: center; gap: 10px;
          padding: 10px 0; margin-bottom: 8px;
          background: var(--bg-base);
        }
        .ex-exit { background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); cursor: pointer; }
        .ex-meta { font-size: 15px; color: var(--text-primary); }
        .ex-meta span { color: var(--text-muted); font-size: 12.5px; }
        .ex-timer { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--gold); font-variant-numeric: tabular-nums; }
        .ex-palette-toggle { background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 7px 12px; font-size: 12px; font-weight: 700; color: var(--text-secondary); cursor: pointer; }
        .ex-palette {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 6px;
          padding: 12px; border-radius: 14px; margin-bottom: 12px;
          background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.08);
          max-height: 260px; overflow-y: auto;
        }
        .ex-cell { aspect-ratio: 1; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary); }
        .ex-cell--done { background: var(--gold-dim); border-color: var(--gold-glow); color: var(--gold); }
        .ex-cell--now { border-color: var(--gold); color: var(--gold-bright); }
        .ex-q { padding: 16px; border-radius: 16px; background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06); }
        .ex-q-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .ex-tag { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; padding: 4px 9px; border-radius: 999px; background: var(--gold-dim); color: var(--gold); }
        .ex-tag--soft { background: var(--bg-elevated); color: var(--text-muted); }
        .ex-q-text { font-size: 14.5px; line-height: 1.65; color: var(--text-primary); margin-bottom: 16px; }
        .ex-options { display: flex; flex-direction: column; gap: 8px; }
        .ex-opt {
          display: flex; align-items: flex-start; gap: 11px; text-align: left;
          padding: 12px; border-radius: 12px; cursor: pointer;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.07); color: var(--text-secondary);
        }
        .ex-opt--on { border-color: var(--gold); background: var(--gold-dim); color: var(--text-primary); }
        .ex-opt-letter { flex-shrink: 0; width: 24px; height: 24px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; background: var(--bg-surface); color: var(--gold); }
        .ex-opt-text { font-size: 13.5px; line-height: 1.55; min-width: 0; }
        .ex-nav { display: flex; gap: 10px; margin-top: 14px; }
        .ex-nav-btn {
          flex: 1; padding: 13px; border-radius: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary);
          font-weight: 700; font-size: 13.5px;
        }
        .ex-nav-btn:disabled { opacity: 0.4; }
        .ex-nav-btn--next, .ex-nav-btn--submit { background: var(--gold-dim); border-color: var(--gold-glow); color: var(--gold); }
        .ex-submit-anytime { width: 100%; margin-top: 10px; background: none; border: none; color: var(--text-muted); font-size: 12px; cursor: pointer; text-decoration: underline; }
        .ex-confirm { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(0,0,0,0.7); }
        .ex-confirm-box {
          max-width: 420px; width: 100%; padding: 24px 20px; border-radius: 18px; text-align: center;
          background: var(--bg-raised); border: 1px solid var(--gold-glow); color: var(--gold);
          display: flex; flex-direction: column; align-items: center; gap: 10px;
        }
        .ex-confirm-box h3 { color: var(--text-primary); margin: 0; font-size: 17px; }
        .ex-confirm-box p { color: var(--text-secondary); font-size: 13px; line-height: 1.6; margin: 0; }
        .ex-err { color: var(--danger) !important; }
        .ex-confirm-actions { display: flex; gap: 10px; width: 100%; margin-top: 8px; }
        .ex-back { flex: 1; padding: 11px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); cursor: pointer; font-weight: 600; }
        .ex-go { flex: 1; padding: 11px; border-radius: 10px; background: var(--gold-dim); border: 1px solid var(--gold-glow); color: var(--gold); cursor: pointer; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 6px; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Result ──

function ResultView({ test, onBack }: { test: PracticeTest; onBack: () => void }) {
  const result = test.result;
  const questions = test.questions ?? [];
  const answerMap = useMemo(() => new Map((test.answers ?? []).map((answer) => [answer.id, answer.optionIndex])), [test.answers]);
  const [filter, setFilter] = useState<"all" | "wrong" | "skipped">("all");

  if (!result) return null;

  const visible = questions.filter((question) => {
    const chosen = answerMap.get(question.id);
    if (filter === "wrong") return chosen !== null && chosen !== undefined && chosen !== question.correctIndex;
    if (filter === "skipped") return chosen === null || chosen === undefined;
    return true;
  });

  return (
    <div className="re">
      <button className="re-back" onClick={onBack}><ChevronLeft size={15} /> All papers</button>

      <section className="re-hero">
        <div className="re-score">
          <strong>{result.score}</strong>
          <span>/ {result.maxScore}</span>
        </div>
        <p className="re-pct">{result.percentage}% · {test.title}</p>
        <div className="re-chips">
          <span className="re-chip" style={{ color: "var(--success)" }}><CheckCircle2 size={13} /> {result.correct} correct (+{result.correct * 4})</span>
          <span className="re-chip" style={{ color: "var(--danger)" }}><XCircle size={13} /> {result.wrong} wrong (−{result.wrong})</span>
          <span className="re-chip">{result.skipped} skipped</span>
          {result.timeTakenSeconds ? <span className="re-chip"><Clock3 size={13} /> {fmtClock(result.timeTakenSeconds)}</span> : null}
        </div>
        <div className="re-subjects">
          {result.subjectScores.map((row) => (
            <div key={row.subject} className="re-subject">
              <strong>{row.subject}</strong>
              <span>{row.score}/{row.maxScore}</span>
              <em>{row.correct}C · {row.wrong}W · {row.skipped}S</em>
            </div>
          ))}
        </div>
        <p className="re-fed"><BadgeCheck size={14} /> Auto-saved to your <SmoothLink href="/tests" className="re-link">Test log</SmoothLink> and <SmoothLink href="/tests/error-log" className="re-link">Error log</SmoothLink> — the planner and review agent will read it.</p>
      </section>

      <div className="re-filter">
        {(["all", "wrong", "skipped"] as const).map((value) => (
          <button key={value} className={`re-pill ${filter === value ? "re-pill--on" : ""}`} onClick={() => setFilter(value)}>
            {value === "all" ? `All (${questions.length})` : value === "wrong" ? `Wrong (${result.wrong})` : `Skipped (${result.skipped})`}
          </button>
        ))}
      </div>

      <div className="re-list">
        {visible.map((question) => {
          const chosen = answerMap.get(question.id);
          const attempted = chosen !== null && chosen !== undefined;
          const isCorrect = attempted && chosen === question.correctIndex;
          return (
            <article key={question.id} className={`re-q ${isCorrect ? "re-q--ok" : attempted ? "re-q--bad" : ""}`}>
              <div className="re-q-meta">
                <span className="re-tag">{question.subject} · {question.chapter}</span>
                <span className="re-tag re-tag--src">{SOURCE_LABEL[question.source]} · {question.sourceRef}</span>
                {question.verified && <span className="re-tag re-tag--ver"><ShieldCheck size={11} /> Key verified</span>}
              </div>
              <div className="re-q-text"><Md text={question.question} /></div>
              <div className="re-opts">
                {question.options.map((option, optionIndex) => {
                  const isKey = optionIndex === question.correctIndex;
                  const isChosen = chosen === optionIndex;
                  return (
                    <div key={optionIndex} className={`re-opt ${isKey ? "re-opt--key" : ""} ${isChosen && !isKey ? "re-opt--chosen-wrong" : ""}`}>
                      <span className="re-opt-letter">{String.fromCharCode(65 + optionIndex)}</span>
                      <span className="re-opt-text"><Md text={option} /></span>
                      {isKey && <CheckCircle2 size={15} className="re-opt-icon" />}
                      {isChosen && !isKey && <XCircle size={15} className="re-opt-icon re-opt-icon--bad" />}
                    </div>
                  );
                })}
              </div>
              {question.explanation && (
                <div className="re-expl">
                  <strong>Why:</strong> <Md text={question.explanation} />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <style jsx>{`
        .re-back { display: inline-flex; align-items: center; gap: 5px; background: none; border: none; color: var(--text-secondary); font-size: 13px; cursor: pointer; padding: 0 0 12px; }
        .re-hero { padding: 22px 18px; border-radius: 18px; text-align: center; background: linear-gradient(135deg, var(--gold-dim), transparent 70%), var(--bg-surface); border: 1px solid var(--gold-glow); }
        .re-score strong { font-size: 44px; font-weight: 800; color: var(--gold-bright); font-variant-numeric: tabular-nums; }
        .re-score span { font-size: 18px; color: var(--text-muted); }
        .re-pct { font-size: 13px; color: var(--text-secondary); margin: 4px 0 14px; }
        .re-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 16px; }
        .re-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; padding: 5px 11px; border-radius: 999px; background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary); }
        .re-subjects { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 14px; }
        .re-subject { flex: 1 1 130px; max-width: 180px; padding: 10px; border-radius: 12px; background: var(--bg-elevated); }
        .re-subject strong { display: block; font-size: 12px; color: var(--text-primary); }
        .re-subject span { font-size: 14px; font-weight: 800; color: var(--gold); }
        .re-subject em { display: block; font-size: 10.5px; color: var(--text-muted); font-style: normal; }
        .re-fed { display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); margin: 0; }
        :global(.re-link) { color: var(--gold); font-weight: 700; }
        .re-filter { display: flex; gap: 7px; margin: 14px 0; }
        .re-pill { padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; background: var(--bg-elevated); border: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary); }
        .re-pill--on { background: var(--gold-dim); border-color: var(--gold); color: var(--gold); }
        .re-list { display: flex; flex-direction: column; gap: 12px; }
        .re-q { padding: 16px; border-radius: 16px; background: var(--bg-surface); border: 1px solid rgba(255,255,255,0.06); }
        .re-q--ok { border-left: 3px solid var(--success); }
        .re-q--bad { border-left: 3px solid var(--danger); }
        .re-q-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .re-tag { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 8px; border-radius: 999px; background: var(--bg-elevated); color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; }
        .re-tag--src { color: var(--gold); }
        .re-tag--ver { color: var(--success); }
        .re-q-text { font-size: 13.5px; line-height: 1.6; color: var(--text-primary); margin-bottom: 12px; }
        .re-opts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .re-opt { display: flex; align-items: flex-start; gap: 9px; padding: 9px 11px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid transparent; color: var(--text-secondary); }
        .re-opt--key { border-color: hsla(142, 60%, 56%, 0.45); background: hsla(142, 60%, 48%, 0.08); color: var(--text-primary); }
        .re-opt--chosen-wrong { border-color: hsla(0, 72%, 62%, 0.45); background: hsla(0, 72%, 62%, 0.07); }
        .re-opt-letter { flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; background: var(--bg-surface); color: var(--gold); }
        .re-opt-text { flex: 1; font-size: 12.5px; line-height: 1.5; min-width: 0; }
        :global(.re-opt-icon) { flex-shrink: 0; color: var(--success); margin-top: 3px; }
        :global(.re-opt-icon--bad) { color: var(--danger); }
        .re-expl { font-size: 12.5px; line-height: 1.6; color: var(--text-secondary); padding: 10px 12px; border-radius: 10px; background: var(--bg-elevated); }
        .re-expl strong { color: var(--gold); }
      `}</style>
    </div>
  );
}
