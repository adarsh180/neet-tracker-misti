"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock3,
  DoorOpen,
  Eraser,
  Expand,
  FilePlus2,
  Flag,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  SquareCheck,
  TimerReset,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

import SmoothLink from "@/components/layout/smooth-link";
import { CHAPTERS, SUBJECT_SLUGS, type ClassLevel, type NeetSubjectSlug } from "@/data/syllabus/neet-chapters";
import { allCBTStyles } from "@/components/practice-cbt/cbt-styles";

type PracticeSource = "NEET_PYQ" | "JEE_PYQ" | "INSTITUTE" | "PLATFORM" | "NCERT" | "AI";
type PracticeDifficulty = "EASY" | "MODERATE" | "TOUGH";
type AttemptStatus = "GENERATING" | "READY" | "RUNNING" | "PAUSED" | "COMPLETED";
type CBTQuestionStatus = "NOT_VISITED" | "NOT_ANSWERED" | "ANSWERED" | "MARKED_FOR_REVIEW" | "ANSWERED_MARKED_FOR_REVIEW";
type SubmitType = "MANUAL" | "AUTO" | "TIME_UP";
type AutoSubmitReason = "TAB_SWITCH" | "FULLSCREEN_EXIT" | "BACK_NAVIGATION" | "RELOAD" | "WINDOW_BLUR" | "ROUTE_LEAVE" | "TIME_UP";

type Question = {
  id: string;
  subject: string;
  chapter: string;
  topic: string | null;
  source: PracticeSource;
  sourceRef: string;
  difficulty: PracticeDifficulty;
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

type PracticeAnswer = { id: string; optionIndex: number | null };
type AttemptEvent = { type: string; at: string; detail?: string };

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
  aiFreshPercent?: number;
  durationMinutes?: number;
  difficulty: string;
  status: AttemptStatus;
  model?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  result: PracticeResult | null;
  answers: PracticeAnswer[] | null;
  questionStatuses?: Record<string, CBTQuestionStatus> | null;
  currentQuestionIndex?: number;
  remainingSeconds?: number | null;
  pauseLogs?: AttemptEvent[] | null;
  securityEvents?: AttemptEvent[] | null;
  submitType?: SubmitType | null;
  autoSubmitReason?: AutoSubmitReason | null;
  totalActiveSeconds?: number | null;
  totalPausedSeconds?: number | null;
  questions?: Question[];
};

type Phase = "list" | "setup" | "generating" | "exam" | "result";
type SetupMode = "CHAPTER" | "TOPIC" | "UNIT" | "SECTIONAL" | "FULL_LENGTH" | "PYQ_YEAR";

const SUBJECTS: { slug: NeetSubjectSlug; label: string; short: string; accent: string }[] = [
  { slug: "physics", label: "Physics", short: "Phy", accent: "var(--physics)" },
  { slug: "chemistry", label: "Chemistry", short: "Chem", accent: "var(--chemistry)" },
  { slug: "botany", label: "Botany", short: "Bot", accent: "var(--botany)" },
  { slug: "zoology", label: "Zoology", short: "Zoo", accent: "var(--zoology)" },
];

const SOURCE_LABEL: Record<PracticeSource, string> = {
  NEET_PYQ: "NEET PYQ",
  JEE_PYQ: "JEE Main PYQ",
  INSTITUTE: "Institute series",
  PLATFORM: "Platform",
  NCERT: "NCERT",
  AI: "AI fresh",
};

const MODE_LABEL: Record<string, string> = {
  CHAPTER: "Chapterwise Test",
  TOPIC: "Custom / Topic Test",
  UNIT: "Unit Test",
  SECTIONAL: "Sectional Test",
  FULL_LENGTH: "Full-Length Test",
  PYQ_YEAR: "NEET PYQ Year",
};

// A violation pauses the exam with a warning; only repeated violations submit.
// (Instant submit-on-blur destroyed real attempts — one alt-tab ended the mock.)
const MAX_SECURITY_VIOLATIONS = 3;

const STATUS_META: Record<CBTQuestionStatus, { label: string; className: string }> = {
  NOT_VISITED: { label: "Not Visited", className: "not-visited" },
  NOT_ANSWERED: { label: "Not Answered", className: "not-answered" },
  ANSWERED: { label: "Answered", className: "answered" },
  MARKED_FOR_REVIEW: { label: "Marked for Review", className: "marked" },
  ANSWERED_MARKED_FOR_REVIEW: { label: "Answered & Marked", className: "answered-marked" },
};

function nowEvent(type: string, detail?: string): AttemptEvent {
  return { type, detail, at: new Date().toISOString() };
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function answerArray(questions: Question[], answers: Record<string, number | null>): PracticeAnswer[] {
  return questions.map((question) => ({ id: question.id, optionIndex: answers[question.id] ?? null }));
}

function initialStatuses(questions: Question[], saved?: Record<string, CBTQuestionStatus> | null): Record<string, CBTQuestionStatus> {
  const output: Record<string, CBTQuestionStatus> = {};
  questions.forEach((question, index) => {
    output[question.id] = saved?.[question.id] ?? (index === 0 ? "NOT_ANSWERED" : "NOT_VISITED");
  });
  return output;
}

function answersFromList(list?: PracticeAnswer[] | null) {
  const map: Record<string, number | null> = {};
  for (const answer of list ?? []) map[answer.id] = answer.optionIndex;
  return map;
}

function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="cbt-md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
      <style jsx>{`
        .cbt-md :global(p) { margin: 0 0 8px; }
        .cbt-md :global(p:last-child) { margin-bottom: 0; }
        .cbt-md :global(.katex) { font-size: 1.03em; }
        .cbt-md :global(table) { border-collapse: collapse; margin: 10px 0; width: max-content; max-width: 100%; }
        .cbt-md :global(td), .cbt-md :global(th) { border: 1px solid var(--glass-border-mid); padding: 6px 10px; font-size: 13px; }
        .cbt-md :global(img) { display: block; max-width: min(100%, 760px); max-height: 440px; object-fit: contain; margin: 14px auto; border-radius: 8px; border: 1px solid var(--glass-border); background: #fff; }
      `}</style>
    </div>
  );
}

export function useFullscreenExamMode(containerRef: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const enterFullscreen = useCallback(async () => {
    const node = containerRef.current ?? document.documentElement;
    if (!document.fullscreenElement && node.requestFullscreen) await node.requestFullscreen().catch(() => undefined);
  }, [containerRef]);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(() => undefined);
  }, []);

  return { isFullscreen, enterFullscreen, exitFullscreen };
}

export function useAttemptAutosave({
  testId,
  enabled,
  payload,
}: {
  testId: string;
  enabled: boolean;
  payload: () => Record<string, unknown>;
}) {
  const payloadRef = useRef(payload);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const saveNow = useCallback(async (action = "autosave") => {
    if (!enabled) return;
    setSaving(true);
    try {
      await fetch(`/api/practice/${testId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payloadRef.current() }),
      });
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }, [enabled, testId]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => void saveNow("autosave"), 2500);
    return () => window.clearInterval(timer);
  }, [enabled, saveNow]);

  return { saving, savedAt, saveNow };
}

export function useCBTSecurityGuard({
  enabled,
  onViolation,
}: {
  enabled: boolean;
  onViolation: (reason: AutoSubmitReason) => void;
}) {
  const violationRef = useRef(onViolation);
  const lastReasonRef = useRef<AutoSubmitReason | null>(null);

  useEffect(() => {
    violationRef.current = onViolation;
  }, [onViolation]);

  const trigger = useCallback((reason: AutoSubmitReason) => {
    if (!enabled || lastReasonRef.current) return;
    lastReasonRef.current = reason;
    violationRef.current(reason);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      lastReasonRef.current = null;
      return;
    }

    window.history.pushState({ cbtGuard: true }, "", window.location.href);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") trigger("TAB_SWITCH");
    };
    const onBlur = () => trigger("WINDOW_BLUR");
    const onFullscreen = () => {
      if (!document.fullscreenElement) trigger("FULLSCREEN_EXIT");
    };
    const onPopState = () => trigger("BACK_NAVIGATION");
    const onBeforeUnload = () => trigger("RELOAD");

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("blur", onBlur);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled, trigger]);
}

export default function PracticeCBTClient() {
  const [phase, setPhase] = useState<Phase>("list");
  const [tests, setTests] = useState<PracticeTest[]>([]);
  const [active, setActive] = useState<PracticeTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/practice", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load practice tests");
      setTests(json.tests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load practice tests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
    const params = new URLSearchParams(window.location.search);
    if (params.get("year")) setPhase("setup");
  }, [loadList]);

  const openTest = useCallback(async (id: string) => {
    setError(null);
    const response = await fetch(`/api/practice/${id}`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Could not open test");
      return;
    }
    const test: PracticeTest = json.test;
    setActive(test);
    if (test.status === "GENERATING") setPhase("generating");
    else if (test.status === "COMPLETED") setPhase("result");
    else setPhase("exam");
  }, []);

  return (
    <div className="cbt-page">
      {phase === "list" && <PracticeList tests={tests} loading={loading} error={error} onNew={() => setPhase("setup")} onOpen={openTest} onDeleted={loadList} />}
      {phase === "setup" && (
        <TestSetup
          onBack={() => setPhase("list")}
          onCreated={(test) => {
            setActive(test);
            setPhase("generating");
          }}
        />
      )}
      {phase === "generating" && active && (
        <GenerationView
          test={active}
          onReady={(test) => {
            setActive(test);
            setPhase("exam");
          }}
          onExit={() => {
            setActive(null);
            setPhase("list");
            void loadList();
          }}
        />
      )}
      {phase === "exam" && active && (
        <CBTPracticeArena
          test={active}
          onSubmitted={(test) => {
            setActive(test);
            setPhase("result");
            void loadList();
          }}
          onExit={() => {
            setActive(null);
            setPhase("list");
            void loadList();
          }}
        />
      )}
      {phase === "result" && active && <ResultSummary test={active} onBack={() => { setActive(null); setPhase("list"); void loadList(); }} />}
      {/* Plain global stylesheet: styled-jsx cannot scope imported strings. */}
      <style dangerouslySetInnerHTML={{ __html: allCBTStyles }} />
      <style jsx>{`
        .cbt-page { width: min(1180px, 100%); margin: 0 auto; padding: 18px 14px 94px; }
        @media (min-width: 760px) { .cbt-page { padding: 26px 24px 98px; } }
      `}</style>
    </div>
  );
}

function PracticeList({
  tests,
  loading,
  error,
  onNew,
  onOpen,
  onDeleted,
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
    <div className="cbt-list">
      <header className="cbt-list-head">
        <div className="cbt-brand-mark"><ShieldCheck size={22} /></div>
        <div>
          <h1>NTA CBT Practice Arena</h1>
          <p>Real bank questions, 3% fresh AI items, saved snapshots, strict running-mode security.</p>
        </div>
        <button className="cbt-primary" onClick={onNew}><FilePlus2 size={16} /> New test</button>
      </header>
      {error && <p className="cbt-error">{error}</p>}
      {loading ? (
        <div className="cbt-empty"><Loader2 className="cbt-spin" size={24} /> Loading attempts...</div>
      ) : tests.length === 0 ? (
        <div className="cbt-empty"><BookOpenCheck size={28} /> <span>No CBT attempts yet.</span><button className="cbt-primary" onClick={onNew}>Build first test</button></div>
      ) : (
        <div className="cbt-test-list">
          {tests.map((test) => (
            <article className="cbt-test-row" key={test.id}>
              <button className="cbt-test-main" onClick={() => onOpen(test.id)}>
                <strong>{test.title || MODE_LABEL[test.mode] || test.mode}</strong>
                <span>{MODE_LABEL[test.mode] ?? test.mode} · {test.questionCount} questions · {test.durationMinutes ?? 180} min · {new Date(test.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span>
              </button>
              <span className={`cbt-test-chip cbt-test-chip-${test.status.toLowerCase()}`}>
                {test.status === "COMPLETED" && test.result ? `${test.result.score}/${test.result.maxScore}` : test.status === "GENERATING" ? `${test.generatedCount}/${test.questionCount}` : test.status}
              </span>
              {test.status !== "COMPLETED" && <button className="cbt-icon-btn" onClick={() => deleteTest(test.id)} aria-label="Delete test"><Trash2 size={15} /></button>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function TestSetup({ onBack, onCreated }: { onBack: () => void; onCreated: (test: PracticeTest) => void }) {
  const initialYear = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("year") : null;
  const [mode, setMode] = useState<SetupMode>(initialYear ? "PYQ_YEAR" : "FULL_LENGTH");
  const [classLevel, setClassLevel] = useState<ClassLevel>("11");
  const [subject, setSubject] = useState<NeetSubjectSlug>("physics");
  const [selectedSubjects, setSelectedSubjects] = useState<NeetSubjectSlug[]>(["physics", "chemistry", "botany", "zoology"]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [pyqYear, setPyqYear] = useState(initialYear ?? "2025");
  const [questionCount, setQuestionCount] = useState(180);
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [difficulty, setDifficulty] = useState("MIXED");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chapterOptions = useMemo(
    () => CHAPTERS.filter((entry) => entry.slug === subject && (mode === "FULL_LENGTH" || entry.classLevel === classLevel)),
    [classLevel, mode, subject],
  );

  useEffect(() => {
    const defaultCount = mode === "FULL_LENGTH" || mode === "SECTIONAL" || mode === "PYQ_YEAR" ? 180 : 50;
    setQuestionCount(defaultCount);
    setDurationMinutes(Math.min(180, defaultCount));
    setSelectedChapters([]);
    setTopic("");
  }, [mode]);

  const toggleSubject = (slug: NeetSubjectSlug) => {
    setSelectedSubjects((prev) => (prev.includes(slug) ? prev.filter((entry) => entry !== slug) : [...prev, slug]));
  };

  const toggleChapter = (chapter: string) => {
    setSelectedChapters((prev) => (prev.includes(chapter) ? prev.filter((entry) => entry !== chapter) : [...prev, chapter]));
  };

  const canCreate =
    mode === "FULL_LENGTH" ||
    mode === "PYQ_YEAR" ||
    ((mode === "UNIT" || mode === "SECTIONAL") && selectedSubjects.length > 0) ||
    (mode === "CHAPTER" && subject && selectedChapters.length > 0) ||
    (mode === "TOPIC" && subject && selectedChapters.length > 0 && topic.trim().length > 1);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const scopedSubjects = mode === "FULL_LENGTH" || mode === "PYQ_YEAR" ? SUBJECT_SLUGS : mode === "CHAPTER" || mode === "TOPIC" ? [subject] : selectedSubjects;
      const body = {
        mode,
        subject: mode === "CHAPTER" || mode === "TOPIC" ? subject : null,
        subjects: scopedSubjects,
        classLevel: mode === "FULL_LENGTH" || mode === "PYQ_YEAR" ? null : classLevel,
        chapter: selectedChapters[0] ?? null,
        chapters: selectedChapters,
        topic: mode === "TOPIC" ? topic.trim() : null,
        pyqYear: mode === "PYQ_YEAR" ? pyqYear : null,
        questionCount,
        durationMinutes,
        aiFreshPercent: 3,
        difficulty,
      };
      const response = await fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not create test");
      onCreated(json.test);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create test");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="setup-shell">
      <button className="cbt-back" onClick={onBack}><ChevronLeft size={15} /> Attempts</button>
      <header className="setup-head">
        <h1>Build CBT Test</h1>
        <p>Choose filters here. The active exam screen will hide chapter and topic names.</p>
      </header>
      <section className="setup-grid">
        <div className="setup-panel">
          <label className="cbt-label">Test type</label>
          <div className="seg-grid">
            {(["FULL_LENGTH", "SECTIONAL", "UNIT", "CHAPTER", "TOPIC", "PYQ_YEAR"] as SetupMode[]).map((entry) => (
              <button key={entry} className={`seg-btn ${mode === entry ? "on" : ""}`} onClick={() => setMode(entry)}>{MODE_LABEL[entry]}</button>
            ))}
          </div>

          {mode !== "FULL_LENGTH" && mode !== "PYQ_YEAR" && (
            <>
              <label className="cbt-label">Class</label>
              <div className="seg-row">
                {(["11", "12"] as ClassLevel[]).map((entry) => <button key={entry} className={`seg-btn ${classLevel === entry ? "on" : ""}`} onClick={() => setClassLevel(entry)}>Class {entry}</button>)}
              </div>
            </>
          )}

          {(mode === "UNIT" || mode === "SECTIONAL") && (
            <>
              <label className="cbt-label">Subjects</label>
              <div className="subject-grid">
                {SUBJECTS.map((entry) => (
                  <button key={entry.slug} className={`subject-btn ${selectedSubjects.includes(entry.slug) ? "on" : ""}`} onClick={() => toggleSubject(entry.slug)} style={{ "--accent": entry.accent } as React.CSSProperties}>
                    <span>{entry.short}</span>{entry.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {(mode === "CHAPTER" || mode === "TOPIC") && (
            <>
              <label className="cbt-label">Subject</label>
              <div className="subject-grid">
                {SUBJECTS.map((entry) => (
                  <button key={entry.slug} className={`subject-btn ${subject === entry.slug ? "on" : ""}`} onClick={() => { setSubject(entry.slug); setSelectedChapters([]); }} style={{ "--accent": entry.accent } as React.CSSProperties}>
                    <span>{entry.short}</span>{entry.label}
                  </button>
                ))}
              </div>
              <label className="cbt-label">Chapter selection</label>
              <div className="chapter-list">
                {chapterOptions.map((entry) => (
                  <button key={entry.chapter} className={`chapter-btn ${selectedChapters.includes(entry.chapter) ? "on" : ""}`} onClick={() => toggleChapter(entry.chapter)}>
                    <SquareCheck size={14} /> {entry.chapter}
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === "TOPIC" && (
            <>
              <label className="cbt-label">Topic filter</label>
              <input className="cbt-input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Exact topic name from notes or DB" />
            </>
          )}

          {mode === "PYQ_YEAR" && (
            <>
              <label className="cbt-label">NEET UG year</label>
              <select className="cbt-input" value={pyqYear} onChange={(event) => setPyqYear(event.target.value)}>
                {Array.from({ length: 2025 - 2006 + 1 }, (_, index) => String(2025 - index)).map((year) => <option key={year}>{year}</option>)}
              </select>
            </>
          )}
        </div>

        <div className="setup-panel">
          <label className="cbt-label">Question count: {questionCount}</label>
          <input className="cbt-range" type="range" min={50} max={180} step={5} value={questionCount} onChange={(event) => { const next = Number(event.target.value); setQuestionCount(next); setDurationMinutes(Math.min(180, next)); }} />
          <div className="range-row"><span>50</span><span>90</span><span>135</span><span>180</span></div>

          <label className="cbt-label">Duration: {durationMinutes} min</label>
          <input className="cbt-range" type="range" min={15} max={180} step={5} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
          <p className="setup-note"><TimerReset size={14} /> Max timer is capped at 180 minutes. Timer pauses only in deliberate pause mode.</p>

          <label className="cbt-label">Difficulty</label>
          <div className="seg-grid four">
            {["MIXED", "EASY", "MODERATE", "TOUGH"].map((entry) => <button key={entry} className={`seg-btn ${difficulty === entry ? "on" : ""}`} onClick={() => setDifficulty(entry)}>{entry === "MIXED" ? "NEET mix" : entry}</button>)}
          </div>

          <div className="setup-summary">
            <strong>Paper policy</strong>
            <span>Eligible bank questions first, with a maximum of 5 live AI questions at creation time.</span>
            <span>Text-only diagram and graph rows are excluded until image assets are attached.</span>
          </div>

          {error && <p className="cbt-error">{error}</p>}
          <button className="cbt-primary setup-create" disabled={!canCreate || creating} onClick={create}>
            {creating ? <><Loader2 className="cbt-spin" size={16} /> Creating...</> : <>Generate CBT paper <ArrowRight size={16} /></>}
          </button>
        </div>
      </section>
    </div>
  );
}

function GenerationView({ test, onReady, onExit }: { test: PracticeTest; onReady: (test: PracticeTest) => void; onExit: () => void }) {
  const [progress, setProgress] = useState({ generated: test.generatedCount, target: test.questionCount, status: test.status });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const response = await fetch(`/api/practice/${test.id}/generate`, { method: "POST" });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Generation failed");
        if (cancelled) return;
        setProgress(json);
        if (json.status === "READY") {
          const next = await fetch(`/api/practice/${test.id}`, { cache: "no-store" }).then((res) => res.json());
          if (!cancelled) onReady(next.test);
        } else {
          window.setTimeout(tick, 600);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Generation failed");
      }
    }
    void tick();
    return () => {
      cancelled = true;
    };
  }, [onReady, test.id]);

  const pct = Math.min(100, Math.round((progress.generated / Math.max(1, progress.target)) * 100));
  return (
    <div className="gen-card">
      <ShieldCheck size={28} />
      <h1>Assembling CBT paper</h1>
      <p>Questions are served from the bank snapshot first. If the small live AI portion fails, the bank fills those slots too.</p>
      <div className="gen-bar"><span style={{ width: `${pct}%` }} /></div>
      <strong>{progress.generated}/{progress.target} questions ready</strong>
      {error && <p className="cbt-error">{error}</p>}
      <button className="cbt-ghost" onClick={onExit}><ArrowLeft size={15} /> Back to attempts</button>
    </div>
  );
}

export function CBTPracticeArena({ test, onSubmitted, onExit }: { test: PracticeTest; onSubmitted: (test: PracticeTest) => void; onExit: () => void }) {
  const questions = test.questions ?? [];
  const arenaRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const pauseIntentRef = useRef(false);
  const [attemptStatus, setAttemptStatus] = useState<AttemptStatus>(test.status);
  const [currentIndex, setCurrentIndex] = useState(Math.min(test.currentQuestionIndex ?? 0, Math.max(0, questions.length - 1)));
  const [answers, setAnswers] = useState<Record<string, number | null>>(() => answersFromList(test.answers));
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, CBTQuestionStatus>>(() => initialStatuses(questions, test.questionStatuses));
  const [remainingSeconds, setRemainingSeconds] = useState(test.remainingSeconds ?? Math.min(180, test.durationMinutes ?? test.questionCount) * 60);
  const [pauseLogs, setPauseLogs] = useState<AttemptEvent[]>(test.pauseLogs ?? []);
  const [securityEvents, setSecurityEvents] = useState<AttemptEvent[]>(test.securityEvents ?? []);
  const [totalActiveSeconds, setTotalActiveSeconds] = useState(test.totalActiveSeconds ?? 0);
  const [totalPausedSeconds, setTotalPausedSeconds] = useState(test.totalPausedSeconds ?? 0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [violationNotice, setViolationNotice] = useState<{ reason: AutoSubmitReason; count: number } | null>(null);
  const violationCountRef = useRef(
    (test.securityEvents ?? []).filter((event) => event.type !== "RELOAD" && event.type !== "BACK_NAVIGATION").length,
  );
  const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreenExamMode(arenaRef);

  // Distraction-free exam: hide the app's floating chrome (notification bell,
  // quick-nav fab, theme toggle) while the arena is mounted.
  useEffect(() => {
    document.body.classList.add("cbt-exam-active");
    return () => document.body.classList.remove("cbt-exam-active");
  }, []);

  const currentQuestion = questions[currentIndex];
  const payload = useCallback(() => ({
    answers: answerArray(questions, answers),
    questionStatuses,
    currentQuestionIndex: currentIndex,
    remainingSeconds,
    pauseLogs,
    securityEvents,
    totalActiveSeconds,
    totalPausedSeconds,
  }), [answers, currentIndex, pauseLogs, questionStatuses, questions, remainingSeconds, securityEvents, totalActiveSeconds, totalPausedSeconds]);
  const { saving, savedAt, saveNow } = useAttemptAutosave({ testId: test.id, enabled: attemptStatus === "RUNNING" || attemptStatus === "PAUSED", payload });

  const markVisited = useCallback((index: number) => {
    const question = questions[index];
    if (!question) return;
    setQuestionStatuses((prev) => prev[question.id] === "NOT_VISITED" ? { ...prev, [question.id]: "NOT_ANSWERED" } : prev);
    setCurrentIndex(index);
  }, [questions]);

  const submitAttempt = useCallback(async (submitType: SubmitType, reason: AutoSubmitReason | null = null) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const finalSecurityEvents = reason ? [...securityEvents, nowEvent(reason, "Auto-submit security trigger")] : securityEvents;
    try {
      const response = await fetch(`/api/practice/${test.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          answers: answerArray(questions, answers),
          timeTakenSeconds: totalActiveSeconds,
          submitType,
          autoSubmitReason: reason,
          questionStatuses,
          currentQuestionIndex: currentIndex,
          remainingSeconds,
          pauseLogs,
          securityEvents: finalSecurityEvents,
          totalActiveSeconds,
          totalPausedSeconds,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Submission failed");
      await exitFullscreen();
      onSubmitted(json.test);
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    }
  }, [answers, currentIndex, exitFullscreen, onSubmitted, pauseLogs, questionStatuses, questions, remainingSeconds, securityEvents, test.id, totalActiveSeconds, totalPausedSeconds]);

  useCBTSecurityGuard({
    enabled: attemptStatus === "RUNNING" && !submitting,
    onViolation: (reason) => {
      if (pauseIntentRef.current) return;
      setSecurityEvents((prev) => [...prev, nowEvent(reason)]);
      // Reload / back-navigation: snapshot and let the attempt resume later.
      if (reason === "RELOAD" || reason === "BACK_NAVIGATION") {
        void saveNow("autosave");
        return;
      }
      const count = ++violationCountRef.current;
      if (count >= MAX_SECURITY_VIOLATIONS) {
        void submitAttempt("AUTO", reason);
        return;
      }
      setViolationNotice({ reason, count });
      void pauseTest();
    },
  });

  useEffect(() => {
    if (attemptStatus !== "READY") return;
    void enterFullscreen();
    fetch(`/api/practice/${test.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", ...payload() }),
    }).then((res) => res.json()).then((json) => {
      if (json.test) {
        setAttemptStatus("RUNNING");
        setRemainingSeconds(json.test.remainingSeconds ?? remainingSeconds);
      }
    }).catch(() => setAttemptStatus("RUNNING"));
  }, [attemptStatus, enterFullscreen, payload, remainingSeconds, test.id]);

  useEffect(() => {
    if (attemptStatus !== "RUNNING") return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((value) => {
        const next = Math.max(0, value - 1);
        if (next === 0) void submitAttempt("TIME_UP", "TIME_UP");
        return next;
      });
      setTotalActiveSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attemptStatus, submitAttempt]);

  useEffect(() => {
    if (attemptStatus !== "PAUSED") return;
    const timer = window.setInterval(() => setTotalPausedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [attemptStatus]);

  const chooseOption = (optionIndex: number) => {
    if (!currentQuestion || attemptStatus !== "RUNNING") return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: prev[currentQuestion.id] === optionIndex ? null : optionIndex }));
    setQuestionStatuses((prev) => {
      const marked = prev[currentQuestion.id] === "MARKED_FOR_REVIEW" || prev[currentQuestion.id] === "ANSWERED_MARKED_FOR_REVIEW";
      return { ...prev, [currentQuestion.id]: marked ? "ANSWERED_MARKED_FOR_REVIEW" : "ANSWERED" };
    });
  };

  const clearResponse = () => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: null }));
    setQuestionStatuses((prev) => {
      const marked = prev[currentQuestion.id] === "MARKED_FOR_REVIEW" || prev[currentQuestion.id] === "ANSWERED_MARKED_FOR_REVIEW";
      return { ...prev, [currentQuestion.id]: marked ? "MARKED_FOR_REVIEW" : "NOT_ANSWERED" };
    });
  };

  const saveAndNext = () => {
    if (currentQuestion && answers[currentQuestion.id] === undefined) {
      setQuestionStatuses((prev) => ({ ...prev, [currentQuestion.id]: "NOT_ANSWERED" }));
    }
    markVisited(Math.min(questions.length - 1, currentIndex + 1));
    void saveNow("autosave");
  };

  const markForReviewAndNext = () => {
    if (!currentQuestion) return;
    const hasAnswer = answers[currentQuestion.id] !== null && answers[currentQuestion.id] !== undefined;
    setQuestionStatuses((prev) => ({ ...prev, [currentQuestion.id]: hasAnswer ? "ANSWERED_MARKED_FOR_REVIEW" : "MARKED_FOR_REVIEW" }));
    markVisited(Math.min(questions.length - 1, currentIndex + 1));
    void saveNow("autosave");
  };

  const pauseTest = async () => {
    pauseIntentRef.current = true;
    const nextLogs = [...pauseLogs, nowEvent("PAUSE")];
    setPauseLogs(nextLogs);
    setAttemptStatus("PAUSED");
    await fetch(`/api/practice/${test.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pause", ...payload(), pauseLogs: nextLogs }),
    }).catch(() => undefined);
    await exitFullscreen();
  };

  const resumeTest = async () => {
    await enterFullscreen();
    pauseIntentRef.current = false;
    setViolationNotice(null);
    const nextLogs = [...pauseLogs, nowEvent("RESUME")];
    setPauseLogs(nextLogs);
    setAttemptStatus("RUNNING");
    await fetch(`/api/practice/${test.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "resume", ...payload(), pauseLogs: nextLogs }),
    }).catch(() => undefined);
  };

  if (!questions.length) {
    return <div className="cbt-empty"><AlertTriangle size={24} /> This attempt has no questions yet.</div>;
  }

  const counts = Object.values(questionStatuses).reduce<Record<CBTQuestionStatus, number>>((acc, status) => ({ ...acc, [status]: (acc[status] ?? 0) + 1 }), {
    NOT_VISITED: 0,
    NOT_ANSWERED: 0,
    ANSWERED: 0,
    MARKED_FOR_REVIEW: 0,
    ANSWERED_MARKED_FOR_REVIEW: 0,
  });
  const answeredCount = counts.ANSWERED + counts.ANSWERED_MARKED_FOR_REVIEW;

  return (
    <div ref={arenaRef} className="arena-shell">
      <CBTTopBar
        remainingSeconds={remainingSeconds}
        isFullscreen={isFullscreen}
        saving={saving}
        savedAt={savedAt}
        onPause={pauseTest}
        onSubmit={() => setConfirmOpen(true)}
        onFullscreen={enterFullscreen}
        status={attemptStatus}
      />
      <main className="arena-main">
        <section className="arena-workspace">
          <QuestionPanel
            question={currentQuestion}
            index={currentIndex}
            total={questions.length}
            selected={currentQuestion ? answers[currentQuestion.id] : null}
            status={attemptStatus}
            onChoose={chooseOption}
          />
          <CBTControls
            index={currentIndex}
            total={questions.length}
            onPrevious={() => markVisited(Math.max(0, currentIndex - 1))}
            onNext={() => markVisited(Math.min(questions.length - 1, currentIndex + 1))}
            onSaveNext={saveAndNext}
            onMarkNext={markForReviewAndNext}
            onClear={clearResponse}
          />
        </section>
        <QuestionPalette
          questions={questions}
          currentIndex={currentIndex}
          statuses={questionStatuses}
          counts={counts}
          compactOpen={paletteOpen}
          onToggleCompact={() => setPaletteOpen((value) => !value)}
          onJump={markVisited}
        />
      </main>
      {attemptStatus === "PAUSED" && (
        <PauseOverlay
          elapsed={totalPausedSeconds}
          onResume={resumeTest}
          onExit={onExit}
          violation={violationNotice ? { ...violationNotice, max: MAX_SECURITY_VIOLATIONS } : null}
        />
      )}
      {confirmOpen && (
        <SubmitModal
          answered={answeredCount}
          total={questions.length}
          remainingSeconds={remainingSeconds}
          submitting={submitting}
          error={submitError}
          onClose={() => setConfirmOpen(false)}
          onSubmit={() => submitAttempt("MANUAL", null)}
        />
      )}
    </div>
  );
}

export function CBTTopBar({
  remainingSeconds,
  isFullscreen,
  saving,
  savedAt,
  status,
  onPause,
  onSubmit,
  onFullscreen,
}: {
  remainingSeconds: number;
  isFullscreen: boolean;
  saving: boolean;
  savedAt: Date | null;
  status: AttemptStatus;
  onPause: () => void;
  onSubmit: () => void;
  onFullscreen: () => void;
}) {
  return (
    <header className="arena-top">
      <div className="arena-ident">
        <ShieldCheck size={16} />
        <div>
          <strong>NEET CBT Mock</strong>
          <span>
            <i className={`save-dot ${saving ? "saving" : savedAt ? "saved" : ""}`} />
            {saving ? "Saving" : savedAt ? `Saved ${savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Secure mode"}
          </span>
        </div>
      </div>
      <div className={`arena-timer ${remainingSeconds < 300 ? "low" : ""}`}>{formatClock(remainingSeconds)}</div>
      <div className="arena-actions">
        {!isFullscreen && status === "RUNNING" && (
          <button className="top-icon" onClick={onFullscreen} aria-label="Enter fullscreen"><Expand size={15} /></button>
        )}
        <button className="top-ghost" onClick={onPause}><Pause size={13} /> Pause</button>
        <button className="top-submit" onClick={onSubmit}><DoorOpen size={13} /> Submit</button>
      </div>
    </header>
  );
}

export function QuestionPanel({
  question,
  index,
  total,
  selected,
  status,
  onChoose,
}: {
  question?: Question;
  index: number;
  total: number;
  selected: number | null | undefined;
  status: AttemptStatus;
  onChoose: (optionIndex: number) => void;
}) {
  if (!question) return null;
  const disabled = status !== "RUNNING";
  return (
    <article className="question-panel">
      <div className="question-meta">
        <span className="q-no">Question {index + 1}<i> / {total}</i></span>
        <span className="q-tag">{question.subject}</span>
        <span className={`q-diff q-diff-${question.difficulty.toLowerCase()}`}>{question.difficulty.toLowerCase()}</span>
      </div>
      <div className="question-text"><MarkdownBlock text={question.question} /></div>
      <div className="option-list">
        {question.options.map((option, optionIndex) => (
          <button key={optionIndex} disabled={disabled} className={`option-btn ${selected === optionIndex ? "selected" : ""}`} onClick={() => onChoose(optionIndex)}>
            <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
            <span className="option-copy"><MarkdownBlock text={option} /></span>
          </button>
        ))}
      </div>
    </article>
  );
}

export function QuestionPalette({
  questions,
  currentIndex,
  statuses,
  counts,
  compactOpen,
  onToggleCompact,
  onJump,
}: {
  questions: Question[];
  currentIndex: number;
  statuses: Record<string, CBTQuestionStatus>;
  counts: Record<CBTQuestionStatus, number>;
  compactOpen: boolean;
  onToggleCompact: () => void;
  onJump: (index: number) => void;
}) {
  return (
    <aside className={`palette-panel ${compactOpen ? "open" : ""}`}>
      <button className="palette-mobile-toggle" onClick={onToggleCompact}>
        Palette · {counts.ANSWERED + counts.ANSWERED_MARKED_FOR_REVIEW}/{questions.length} answered
      </button>
      <div className="palette-body">
        <div className="palette-head">
          <h2>Palette</h2>
          <span>{counts.ANSWERED + counts.ANSWERED_MARKED_FOR_REVIEW}/{questions.length} answered</span>
        </div>
        <div className="palette-grid">
          {questions.map((question, index) => {
            const status = statuses[question.id] ?? "NOT_VISITED";
            return (
              <button key={question.id} className={`palette-cell ${STATUS_META[status].className} ${index === currentIndex ? "current" : ""}`} onClick={() => onJump(index)}>
                {index + 1}
              </button>
            );
          })}
        </div>
        <div className="palette-legend">
          {(Object.keys(STATUS_META) as CBTQuestionStatus[]).map((status) => (
            <span key={status}><i className={STATUS_META[status].className} /> {STATUS_META[status].label} <b>{counts[status] ?? 0}</b></span>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function CBTControls({
  index,
  total,
  onPrevious,
  onNext,
  onSaveNext,
  onMarkNext,
  onClear,
}: {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onSaveNext: () => void;
  onMarkNext: () => void;
  onClear: () => void;
}) {
  return (
    <div className="controls-bar">
      <div className="controls-group">
        <button className="ctl" onClick={onClear}><Eraser size={14} /> Clear</button>
        <button className="ctl mark" onClick={onMarkNext}><Flag size={14} /> Mark &amp; Next</button>
      </div>
      <div className="controls-group">
        <button className="ctl" disabled={index === 0} onClick={onPrevious}><ArrowLeft size={14} /> Prev</button>
        <button className="ctl" disabled={index === total - 1} onClick={onNext}>Next</button>
        <button className="ctl primary" onClick={onSaveNext}><Save size={14} /> Save &amp; Next</button>
      </div>
    </div>
  );
}

const VIOLATION_LABEL: Record<string, string> = {
  TAB_SWITCH: "You switched tabs",
  WINDOW_BLUR: "You left the exam window",
  FULLSCREEN_EXIT: "You exited fullscreen",
};

export function PauseOverlay({
  elapsed,
  onResume,
  onExit,
  violation,
}: {
  elapsed: number;
  onResume: () => void;
  onExit: () => void;
  violation?: { reason: string; count: number; max: number } | null;
}) {
  return (
    <div className="pause-overlay">
      <div className={`pause-card ${violation ? "pause-card-violation" : ""}`}>
        {violation ? <ShieldAlert size={30} /> : <Pause size={30} />}
        <h2>{violation ? "Security pause" : "Test Paused"}</h2>
        {violation ? (
          <p>
            <strong>{VIOLATION_LABEL[violation.reason] ?? violation.reason}.</strong> Warning {violation.count} of {violation.max} —
            the attempt auto-submits on the {violation.max}rd violation. Your answers and timer are safe.
          </p>
        ) : (
          <p>Questions are hidden, timer is stopped, and security triggers are disabled until resume.</p>
        )}
        <span>Paused time: {formatClock(elapsed)}</span>
        <div className="pause-actions">
          <button className="cbt-primary" onClick={onResume}><Play size={16} /> Resume in fullscreen</button>
          <button className="cbt-ghost" onClick={onExit}>Attempts</button>
        </div>
      </div>
    </div>
  );
}

export function SubmitModal({
  answered,
  total,
  remainingSeconds,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  answered: number;
  total: number;
  remainingSeconds: number;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="submit-overlay">
      <div className="submit-card">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <AlertTriangle size={28} />
        <h2>Submit CBT Practice Test?</h2>
        <p>{answered} answered · {total - answered} not answered · {formatClock(remainingSeconds)} left. After submission, answer keys and explanations unlock.</p>
        {error && <p className="cbt-error">{error}</p>}
        <div className="submit-actions">
          <button className="cbt-ghost" onClick={onClose} disabled={submitting}>Keep attempting</button>
          <button className="danger-btn" onClick={onSubmit} disabled={submitting}>{submitting ? <><Loader2 className="cbt-spin" size={15} /> Submitting...</> : "Submit now"}</button>
        </div>
      </div>
    </div>
  );
}

export function ResultSummary({ test, onBack }: { test: PracticeTest; onBack: () => void }) {
  const result = test.result;
  if (!result) return null;
  const answers = new Map((test.answers ?? []).map((answer) => [answer.id, answer.optionIndex]));
  const markedCount = Object.values(test.questionStatuses ?? {}).filter((status) => status === "MARKED_FOR_REVIEW" || status === "ANSWERED_MARKED_FOR_REVIEW").length;
  return (
    <div className="result-shell">
      <button className="cbt-back" onClick={onBack}><ChevronLeft size={15} /> Attempts</button>
      <section className="result-hero">
        <p className="result-kicker">{MODE_LABEL[test.mode] ?? test.mode}</p>
        <div className="result-score"><strong>{result.score}</strong><span>/ {result.maxScore}</span></div>
        <p className="result-sub">
          {result.percentage}% · {test.submitType === "AUTO" ? `auto-submitted (${test.autoSubmitReason?.toLowerCase().replace(/_/g, " ")})` : test.submitType === "TIME_UP" ? "time up" : "submitted manually"}
        </p>
        <div className="result-metrics">
          <span className="rm-good"><CheckCircle2 size={13} /> {result.correct} correct</span>
          <span className="rm-bad"><XCircle size={13} /> {result.wrong} wrong</span>
          <span><Circle size={13} /> {result.skipped} skipped</span>
          <span><Flag size={13} /> {markedCount} marked</span>
          <span><Clock3 size={13} /> {formatClock(test.totalActiveSeconds ?? result.timeTakenSeconds ?? 0)} active</span>
          {Boolean(test.totalPausedSeconds) && <span><Pause size={13} /> {formatClock(test.totalPausedSeconds ?? 0)} paused</span>}
        </div>
      </section>
      <section className="subject-score-grid">
        {result.subjectScores.map((row) => (
          <div key={row.subject} className="subject-score">
            <strong>{row.subject}</strong>
            <span>{row.score}/{row.maxScore}</span>
            <em>{row.correct}C · {row.wrong}W · {row.skipped}S</em>
          </div>
        ))}
      </section>
      <p className="result-fed"><BadgeCheck size={14} /> Saved to <SmoothLink href="/tests">Test log</SmoothLink> and <SmoothLink href="/tests/error-log">Error log</SmoothLink>.</p>
      <AnswerReview questions={test.questions ?? []} answers={answers} />
    </div>
  );
}

export function AnswerReview({ questions, answers }: { questions: Question[]; answers: Map<string, number | null> }) {
  const [filter, setFilter] = useState<"all" | "wrong" | "skipped">("all");
  const visible = questions.filter((question) => {
    const chosen = answers.get(question.id);
    if (filter === "wrong") return chosen !== null && chosen !== undefined && chosen !== question.correctIndex;
    if (filter === "skipped") return chosen === null || chosen === undefined;
    return true;
  });
  return (
    <section className="review-shell">
      <div className="review-tabs">
        {(["all", "wrong", "skipped"] as const).map((entry) => <button key={entry} className={filter === entry ? "on" : ""} onClick={() => setFilter(entry)}>{entry}</button>)}
      </div>
      <div className="review-list">
        {visible.map((question, index) => {
          const chosen = answers.get(question.id);
          return (
            <article className="review-card" key={question.id}>
              <div className="review-meta">
                <span>Q{index + 1}</span><span>{question.subject}</span><span>{question.chapter}</span><span>{SOURCE_LABEL[question.source]} · {question.sourceRef}</span>{question.verified && <span>Verified</span>}
              </div>
              <MarkdownBlock text={question.question} />
              <div className="review-options">
                {question.options.map((option, optionIndex) => {
                  const isKey = optionIndex === question.correctIndex;
                  const isChosen = optionIndex === chosen;
                  return (
                    <div key={optionIndex} className={`review-option ${isKey ? "key" : ""} ${isChosen && !isKey ? "wrong" : ""}`}>
                      <b>{String.fromCharCode(65 + optionIndex)}</b><MarkdownBlock text={option} />{isKey && <CheckCircle2 size={15} />}{isChosen && !isKey && <XCircle size={15} />}
                    </div>
                  );
                })}
              </div>
              {question.explanation && <div className="review-explanation"><strong>Explanation</strong><MarkdownBlock text={question.explanation} /></div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
