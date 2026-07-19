"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  BookMarked,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  DoorOpen,
  Eraser,
  Expand,
  FilePlus2,
  Flag,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  GripVertical,
  Loader2,
  Pause,
  Pencil,
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
import { useRouter } from "next/navigation";

import SmoothLink from "@/components/layout/smooth-link";
import { CHAPTERS, SUBJECT_SLUGS, type ClassLevel, type NeetSubjectSlug } from "@/data/syllabus/neet-chapters";
import { allCBTStyles } from "@/components/practice-cbt/cbt-styles";
import PracticeAnalytics, { type AnalyticsTest } from "@/components/practice-cbt/practice-analytics";
import DetailedAnswerReview from "@/components/practice-cbt/detailed-answer-review";
import BookmarkLibrary from "@/components/practice-cbt/bookmark-library";
import TestPreflight from "@/components/practice-cbt/test-preflight";
import {
  NEET_FULL_TEST_DURATION_MINUTES,
  NEET_FULL_TEST_QUESTIONS,
  NEET_MAX_PRACTICE_DURATION_MINUTES,
} from "@/lib/neet-exam-policy";
import { normalizeQuestionMarkdown } from "@/lib/question-markdown";

type PracticeSource = "NEET_PYQ" | "JEE_PYQ" | "INSTITUTE" | "PLATFORM" | "NCERT" | "AI";
type PracticeDifficulty = "EASY" | "MODERATE" | "TOUGH";
type AttemptStatus = "GENERATING" | "READY" | "RUNNING" | "PAUSED" | "COMPLETED";
type CBTQuestionStatus = "NOT_VISITED" | "NOT_ANSWERED" | "ANSWERED" | "MARKED_FOR_REVIEW" | "ANSWERED_MARKED_FOR_REVIEW";
type SubmitType = "MANUAL" | "AUTO" | "TIME_UP";
type AutoSubmitReason = "TAB_SWITCH" | "FULLSCREEN_EXIT" | "BACK_NAVIGATION" | "RELOAD" | "WINDOW_BLUR" | "ROUTE_LEAVE" | "PAUSE_LIMIT" | "TIME_UP";

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
  optionExplanations?: string[] | null;
  visualAssetUrl?: string | null;
  visualAssetAlt?: string | null;
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
type MistakeTag = "GUESS_WORK" | "ELIMINATION_WORK" | "NOT_STUDIED" | "SILLY_MISTAKE" | "CUSTOM";
type QuestionReview = {
  questionId: string;
  questionNumber: number;
  outcome: "CORRECT" | "WRONG" | "SKIPPED";
  mistakeTag: MistakeTag | null;
  customMistakeText: string | null;
  reviewComplete: boolean;
};
type PyqAvailability = { year: number; count: number; complete: boolean; paperCodes: string[] };
type AttemptEvent = { type: string; at: string; detail?: string };
type ProctorEvidence = AttemptEvent & { imageDataUrl: string };

type PracticeTest = {
  id: string;
  folderId?: string | null;
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
  reviews?: QuestionReview[];
};

type TestFolder = {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  position: number;
  testCount: number;
  childCount: number;
};

type Phase = "list" | "bookmarks" | "setup" | "generating" | "preflight" | "exam" | "result";
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

const PROCTOR_EMAIL_ENABLED = process.env.NEXT_PUBLIC_PROCTOR_EMAIL_ENABLED === "true";

// A violation pauses the exam with a warning; only repeated violations submit.
// (Instant submit-on-blur destroyed real attempts — one alt-tab ended the mock.)
const MAX_SECURITY_VIOLATIONS = 3;

const STATUS_META: Record<CBTQuestionStatus, { label: string; className: string }> = {
  NOT_VISITED: { label: "Not Visited", className: "not-visited" },
  NOT_ANSWERED: { label: "Not Answered", className: "not-answered" },
  ANSWERED: { label: "Answered", className: "answered" },
  MARKED_FOR_REVIEW: { label: "Marked for Review", className: "marked" },
  ANSWERED_MARKED_FOR_REVIEW: { label: "Answered & Marked for Review", className: "answered-marked" },
};

function nowEvent(type: string, detail?: string): AttemptEvent {
  return { type, detail, at: new Date().toISOString() };
}

async function captureCameraFrame(video: HTMLVideoElement | null) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const width = Math.min(640, video.videoWidth);
  const height = Math.round((width / video.videoWidth) * video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.62);
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function detectQuestionFormat(question: Question) {
  const text = `${question.question}\n${question.options.join("\n")}`.toLowerCase();
  if (question.visualAssetUrl || /\b(graph|diagram|figure|table|data|given below|following data|observe)\b/.test(text)) return "Data/Diagram";
  if (/\bassertion\b|\breason\b|\bassertion\s*\(a\)/.test(text)) return "Assertion-Reason";
  if (/\bmatch\b|\blist[-\s]i\b|\blist[-\s]ii\b|\bcolumn[-\s]i\b|\bcolumn[-\s]ii\b/.test(text)) return "Match/List";
  if (/\bstatement\s*(?:i|1)\b|\bwhich of the following statements\b/.test(text)) return "Statement";
  return "Single Correct";
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Smoothly counts the displayed number toward `value` so live generation progress
// animates instead of snapping.
function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = display;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const duration = 450;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display}</>;
}

function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="cbt-md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeQuestionMarkdown(text)}
      </ReactMarkdown>
      <style jsx>{`
        .cbt-md :global(p) { margin: 0 0 8px; }
        .cbt-md :global(p:last-child) { margin-bottom: 0; }
        .cbt-md :global(.katex) { font-size: 1.03em; white-space: nowrap; }
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

export default function PracticeCBTClient({ initialFolderId = null }: { initialFolderId?: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("list");
  const [tests, setTests] = useState<PracticeTest[]>([]);
  const [active, setActive] = useState<PracticeTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proctorStream, setProctorStream] = useState<MediaStream | null>(null);

  const stopProctorStream = useCallback(() => {
    setProctorStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  useEffect(() => {
    document.body.classList.toggle("cbt-result-active", phase === "result");
    return () => document.body.classList.remove("cbt-result-active");
  }, [phase]);

  // Patch one test in both the list and the active selection so live progress
  // is reflected everywhere without a refresh.
  const patchTest = useCallback((id: string, partial: Partial<PracticeTest>) => {
    setTests((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...partial } : entry)));
    setActive((prev) => (prev && prev.id === id ? { ...prev, ...partial } : prev));
  }, []);

  // Centralized generation driver: a single detached loop advances whichever test
  // is GENERATING (preferring the active one) and streams its count into state, so
  // generation keeps running in the background across the list/generating views and
  // the progress animates live — no Ctrl+R needed.
  const driverRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const driveGeneration = useCallback(
    async (id: string) => {
      if (driverRef.current) return;
      driverRef.current = id;
      let failures = 0;
      try {
        while (mountedRef.current) {
          const response = await fetch(`/api/practice/${id}/generate`, { method: "POST" }).catch(() => null);
          if (!response) {
            if (++failures > 5) break;
            await sleep(2500);
            continue;
          }
          if (response.status === 404) break; // test deleted
          const json = await response.json().catch(() => ({}));
          if (!response.ok) {
            if (++failures > 5) break;
            await sleep(2500);
            continue;
          }
          failures = 0;
          if (!mountedRef.current) break;
          patchTest(id, { generatedCount: json.generated, status: json.status });
          if (json.status === "READY") {
            const full = await fetch(`/api/practice/${id}`, { cache: "no-store" }).then((res) => res.json()).catch(() => null);
            if (full?.test && mountedRef.current) patchTest(id, full.test);
            break;
          }
          await sleep(450);
        }
      } finally {
        if (driverRef.current === id) driverRef.current = null;
      }
    },
    [patchTest],
  );

  useEffect(() => {
    const generating = (active?.status === "GENERATING" ? active : null) ?? tests.find((entry) => entry.status === "GENERATING");
    if (generating && !driverRef.current) void driveGeneration(generating.id);
  }, [active, tests, driveGeneration]);

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
    else setPhase("preflight");
  }, []);

  return (
    <div className="cbt-page">
      {phase === "list" && <PracticeList tests={tests} loading={loading} error={error} initialFolderId={initialFolderId} onNew={() => setPhase("setup")} onBookmarks={() => setPhase("bookmarks")} onOpen={openTest} onDeleted={loadList} onFolderOpen={(folderId) => router.push(`/practice/folders/${folderId}`)} onBackToFolders={() => router.push("/practice")} />}
      {phase === "bookmarks" && <BookmarkLibrary onBack={() => setPhase("list")} />}
      {phase === "setup" && (
        <TestSetup
          onBack={() => setPhase("list")}
          onCreated={(test) => {
            setActive(test);
            setPhase(test.status === "READY" ? "preflight" : "generating");
          }}
        />
      )}
      {phase === "generating" && active && (
        <GenerationView
          test={active}
          onReady={(test) => {
            setActive(test);
            setPhase("preflight");
          }}
          onExit={() => {
            setActive(null);
            setPhase("list");
            void loadList();
          }}
        />
      )}
      {phase === "preflight" && active && (
        <TestPreflight
          test={active}
          onCancel={() => { stopProctorStream(); setActive(null); setPhase("list"); }}
          onComplete={(stream) => { setProctorStream(stream); setPhase("exam"); }}
        />
      )}
      {phase === "exam" && active && (
        <CBTPracticeArena
          test={active}
          proctorStream={proctorStream}
          onSubmitted={(test) => {
            stopProctorStream();
            setActive(test);
            setPhase("result");
            void loadList();
          }}
          onExit={() => {
            stopProctorStream();
            setActive(null);
            setPhase("list");
            void loadList();
          }}
        />
      )}
      {phase === "result" && active && (
        <>
          <PracticeAnalytics test={active as unknown as AnalyticsTest} onBack={() => { setActive(null); setPhase("list"); void loadList(); }} />
          <div style={{ marginTop: 16 }}>
            <DetailedAnswerReview
              testId={active.id}
              questions={active.questions ?? []}
              answers={new Map((active.answers ?? []).map((a) => [a.id, a.optionIndex]))}
              initialReviews={active.reviews ?? []}
            />
          </div>
        </>
      )}
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
  onBookmarks,
  onOpen,
  onDeleted,
  initialFolderId,
  onFolderOpen,
  onBackToFolders,
}: {
  tests: PracticeTest[];
  loading: boolean;
  error: string | null;
  onNew: () => void;
  onBookmarks: () => void;
  onOpen: (id: string) => void;
  onDeleted: () => void;
  initialFolderId: string | null;
  onFolderOpen: (folderId: string) => void;
  onBackToFolders: () => void;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reattemptingId, setReattemptingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PracticeTest | null>(null);
  const [folders, setFolders] = useState<TestFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<TestFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [confirmFolderDelete, setConfirmFolderDelete] = useState<TestFolder | null>(null);
  const [folderBusyId, setFolderBusyId] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    const response = await fetch("/api/practice/folders", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setFolders(payload.folders ?? []);
  }, []);

  useEffect(() => { void loadFolders(); }, [loadFolders]);

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const parentId = initialFolderId && initialFolderId !== "all" ? initialFolderId : null;
    setCreatingFolder(true);
    setActionError(null);
    try {
      const response = await fetch("/api/practice/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not create folder");
      setNewFolderName("");
      setFolders((current) => [
        ...current.map((folder) => folder.id === parentId ? { ...folder, childCount: folder.childCount + 1 } : folder),
        payload.folder,
      ]);
    } catch (folderError) {
      setActionError(folderError instanceof Error ? folderError.message : "Could not create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  const beginRenameFolder = (folder: TestFolder) => {
    setRenamingFolder(folder);
    setRenameFolderName(folder.name);
    setActionError(null);
  };

  const renameFolder = async () => {
    if (!renamingFolder) return;
    const name = renameFolderName.replace(/\s+/g, " ").trim();
    if (!name || name === renamingFolder.name) {
      setRenamingFolder(null);
      return;
    }
    const original = renamingFolder;
    setFolderBusyId(original.id);
    setFolders((current) => current.map((folder) => folder.id === original.id ? { ...folder, name } : folder));
    setRenamingFolder(null);
    setActionError(null);
    try {
      const response = await fetch(`/api/practice/folders/${original.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not rename folder");
      setFolders((current) => current.map((folder) => folder.id === original.id ? { ...folder, ...payload.folder } : folder));
    } catch (renameError) {
      setFolders((current) => current.map((folder) => folder.id === original.id ? original : folder));
      setActionError(renameError instanceof Error ? renameError.message : "Could not rename folder");
    } finally {
      setFolderBusyId(null);
    }
  };

  const deleteFolder = async () => {
    if (!confirmFolderDelete) return;
    const target = confirmFolderDelete;
    const snapshot = folders;
    setFolderBusyId(target.id);
    setConfirmFolderDelete(null);
    setActionError(null);
    setFolders((current) => current
      .filter((folder) => folder.id !== target.id)
      .map((folder) => folder.parentId === target.id ? { ...folder, parentId: target.parentId } : folder));
    try {
      const response = await fetch(`/api/practice/folders/${target.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not delete folder");
      await Promise.all([loadFolders(), onDeleted()]);
      if (initialFolderId === target.id) {
        if (payload.parentId) onFolderOpen(payload.parentId);
        else onBackToFolders();
      }
    } catch (deleteError) {
      setFolders(snapshot);
      setActionError(deleteError instanceof Error ? deleteError.message : "Could not delete folder");
    } finally {
      setFolderBusyId(null);
    }
  };

  const moveTest = async (testId: string, folderId: string | null) => {
    setActionError(null);
    try {
      const response = await fetch(`/api/practice/${testId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "move-folder", folderId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not move test");
      await Promise.all([loadFolders(), onDeleted()]);
    } catch (moveError) {
      setActionError(moveError instanceof Error ? moveError.message : "Could not move test");
    } finally {
      setDraggingId(null);
    }
  };

  const isAllTestsFolder = initialFolderId === "all";
  const visibleTests = isAllTestsFolder
    ? tests
    : initialFolderId
      ? tests.filter((test) => test.folderId === initialFolderId)
      : tests.filter((test) => !test.folderId);
  const activeFolder = initialFolderId && !isAllTestsFolder
    ? folders.find((folder) => folder.id === initialFolderId) ?? null
    : null;
  const activeFolderName = isAllTestsFolder ? "All Tests" : activeFolder?.name ?? "Loading folder…";
  const displayedFolders = isAllTestsFolder
    ? []
    : initialFolderId && !activeFolder
      ? []
      : folders.filter((folder) => folder.parentId === (activeFolder?.id ?? null));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const breadcrumbs: TestFolder[] = [];
  if (activeFolder) {
    const visited = new Set<string>();
    let cursor: TestFolder | undefined = activeFolder;
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      breadcrumbs.unshift(cursor);
      cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
    }
  }
  const folderPath = (folder: TestFolder) => {
    const path: string[] = [folder.name];
    const visited = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = folderById.get(parentId);
      if (!parent) break;
      path.unshift(parent.name);
      parentId = parent.parentId;
    }
    return path.join(" / ");
  };

  const deleteTest = async (id: string) => {
    setDeletingId(id);
    setActionError(null);
    try {
      const response = await fetch(`/api/practice/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not delete this attempt");
      setConfirmDelete(null);
      onDeleted();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Could not delete this attempt");
    } finally {
      setDeletingId(null);
    }
  };

  const reattemptTest = async (id: string) => {
    setReattemptingId(id);
    setActionError(null);
    try {
      const response = await fetch(`/api/practice/${id}/reattempt`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.test?.id) throw new Error(payload.error || "Could not create the re-attempt");
      onOpen(payload.test.id);
    } catch (reattemptError) {
      setActionError(reattemptError instanceof Error ? reattemptError.message : "Could not create the re-attempt");
    } finally {
      setReattemptingId(null);
    }
  };

  return (
    <div className="cbt-list">
      {initialFolderId ? (
        <header className="folder-workspace-head">
          <button className="folder-workspace-back" type="button" onClick={() => {
            if (activeFolder?.parentId) onFolderOpen(activeFolder.parentId);
            else onBackToFolders();
          }}><ChevronLeft size={15} /> {activeFolder?.parentId ? folderById.get(activeFolder.parentId)?.name ?? "Parent folder" : "Practice Arena"}</button>
          {!isAllTestsFolder && breadcrumbs.length > 0 && (
            <nav className="folder-breadcrumbs" aria-label="Folder path">
              <button type="button" onClick={onBackToFolders}>Practice Arena</button>
              {breadcrumbs.map((folder, index) => (
                <span key={folder.id}><ChevronRight size={12} /><button type="button" disabled={index === breadcrumbs.length - 1} onClick={() => onFolderOpen(folder.id)}>{folder.name}</button></span>
              ))}
            </nav>
          )}
          <div className="folder-workspace-title">
            <span className="folder-workspace-icon"><FolderOpen size={30} /></span>
            <div><span>{isAllTestsFolder ? "Permanent collection" : activeFolder?.parentId ? "Nested collection" : "Custom collection"}</span><h1>{activeFolderName}</h1><p>{visibleTests.length} saved {visibleTests.length === 1 ? "test" : "tests"} · {displayedFolders.length} subfolder{displayedFolders.length === 1 ? "" : "s"}</p></div>
          </div>
          <div className="cbt-list-actions">
            {!isAllTestsFolder && activeFolder && <><button className="cbt-ghost small" disabled={folderBusyId === activeFolder.id} onClick={() => beginRenameFolder(activeFolder)}><Pencil size={14} /> Rename</button><button className="cbt-ghost small folder-delete-trigger" disabled={folderBusyId === activeFolder.id} onClick={() => setConfirmFolderDelete(activeFolder)}><Trash2 size={14} /> Delete</button></>}
            <button className="cbt-ghost cbt-bookmark-entry" onClick={onBookmarks}><BookMarked size={16} /> Bookmarks</button><button className="cbt-primary" onClick={onNew}><FilePlus2 size={16} /> New test</button>
          </div>
        </header>
      ) : (
        <header className="cbt-list-head">
          <div className="cbt-brand-mark"><ShieldCheck size={22} /></div>
          <div>
            <h1>NTA CBT Practice Arena</h1>
            <p>Strict database questions, saved attempts, detailed review and database-backed bookmarks.</p>
          </div>
          <div className="cbt-list-actions"><button className="cbt-ghost cbt-bookmark-entry" onClick={onBookmarks}><BookMarked size={16} /> Bookmarks</button><button className="cbt-primary" onClick={onNew}><FilePlus2 size={16} /> New test</button></div>
        </header>
      )}
      {error && <p className="cbt-error">{error}</p>}
      {actionError && <p className="cbt-error">{actionError}</p>}
      {!isAllTestsFolder && <section className="test-folders" aria-label={activeFolder ? `Subfolders in ${activeFolder.name}` : "Test folders"}>
        <div className="folder-section-head">
          <div><strong>{activeFolder ? `Folders inside ${activeFolder.name}` : "Test folders"}</strong><span>{activeFolder ? "Create as many nested levels as you need." : "All Tests always keeps every attempt. Custom folders organise selected tests."}</span></div>
        </div>
        <div className="folder-rail">
          {!activeFolder && <article className="test-folder permanent">
            <button className="folder-open-button" type="button" onClick={() => onFolderOpen("all")}>
              <span className="folder-art"><FolderOpen size={34} /></span><strong>All Tests</strong><small>{tests.length} total · permanent</small>
            </button>
          </article>}
          {displayedFolders.map((folder) => (
            <article className={`test-folder tone-${folder.color.toLowerCase()} ${folderBusyId === folder.id ? "folder-busy" : ""}`} title={folder.name} key={folder.id} onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add("drop-ready"); }} onDragLeave={(event) => event.currentTarget.classList.remove("drop-ready")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("drop-ready"); const testId = draggingId || event.dataTransfer.getData("text/plain"); if (testId) void moveTest(testId, folder.id); }}>
              <button className="folder-open-button" type="button" onClick={() => onFolderOpen(folder.id)}>
                <span className="folder-art"><Folder size={36} /></span><strong>{folder.name}</strong><small>{folder.testCount} test{folder.testCount === 1 ? "" : "s"} · {folder.childCount} folder{folder.childCount === 1 ? "" : "s"}</small>
              </button>
              <div className="folder-card-actions">
                <button type="button" disabled={folderBusyId === folder.id} onClick={() => beginRenameFolder(folder)} aria-label={`Rename ${folder.name}`} title="Rename folder"><Pencil size={13} /></button>
                <button type="button" disabled={folderBusyId === folder.id} onClick={() => setConfirmFolderDelete(folder)} aria-label={`Delete ${folder.name}`} title="Delete folder"><Trash2 size={13} /></button>
              </div>
            </article>
          ))}
        </div>
        <div className="folder-create">
          {activeFolder ? <FolderTree size={18} /> : <FolderPlus size={18} />}
          <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); }} placeholder={activeFolder ? "New subfolder name" : "New folder name"} maxLength={80} aria-label={activeFolder ? "New subfolder name" : "New folder name"} />
          <button type="button" disabled={creatingFolder || !newFolderName.trim()} onClick={() => void createFolder()}>{creatingFolder ? <Loader2 className="cbt-spin" size={14} /> : "Create"}</button>
        </div>
        <p className="folder-help"><GripVertical size={13} /> Drag a test onto any visible folder, or use the folder menu on touch devices. Every test remains in All Tests.</p>
      </section>}
      {!initialFolderId && !loading && tests.length > 0 && (
        <div className="arena-inbox-head"><div><strong>Practice Arena</strong><span>{visibleTests.length} unfiled {visibleTests.length === 1 ? "test" : "tests"}</span></div><small>Tests moved to a custom folder leave this list.</small></div>
      )}
      {loading ? (
        <div className="cbt-empty"><Loader2 className="cbt-spin" size={24} /> Loading attempts...</div>
      ) : tests.length === 0 ? (
        <div className="cbt-empty"><BookOpenCheck size={28} /> <span>No CBT attempts yet.</span><button className="cbt-primary" onClick={onNew}>Build first test</button></div>
      ) : (
        <div className={`cbt-test-list ${initialFolderId ? "folder-test-grid" : ""}`}>
          {visibleTests.map((test) => (
            <article className={`cbt-test-row ${draggingId === test.id ? "dragging" : ""}`} key={test.id} draggable onDragStart={(event) => { setDraggingId(test.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", test.id); }} onDragEnd={() => setDraggingId(null)}>
              <GripVertical className="test-drag-handle" size={17} aria-hidden="true" />
              <button className="cbt-test-main" onClick={() => onOpen(test.id)}>
                <strong>{test.title || MODE_LABEL[test.mode] || test.mode}</strong>
                <span>{MODE_LABEL[test.mode] ?? test.mode} · {test.questionCount} questions · {test.durationMinutes ?? 180} min · {new Date(test.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span>
              </button>
              <div className="test-row-actions">
                <span className={`cbt-test-chip cbt-test-chip-${test.status.toLowerCase()}`}>
                  {test.status === "COMPLETED" && test.result ? (
                    `${test.result.score}/${test.result.maxScore}`
                  ) : test.status === "GENERATING" ? (
                    <span className="cbt-gen-chip"><Loader2 className="cbt-spin" size={12} /> <AnimatedCount value={test.generatedCount} />/{test.questionCount}</span>
                  ) : (
                    test.status
                  )}
                </span>
                {test.status === "COMPLETED" && (
                  <button className="cbt-icon-btn cbt-reattempt-btn" disabled={reattemptingId === test.id} onClick={() => void reattemptTest(test.id)} aria-label="Re-attempt test">
                    {reattemptingId === test.id ? <Loader2 className="cbt-spin" size={15} /> : <RotateCcw size={15} />}
                  </button>
                )}
                <button className="cbt-icon-btn" disabled={deletingId === test.id} onClick={() => setConfirmDelete(test)} aria-label="Delete test">
                  {deletingId === test.id ? <Loader2 className="cbt-spin" size={15} /> : <Trash2 size={15} />}
                </button>
                <select className="test-folder-select" aria-label={`Move ${test.title} to folder`} value={test.folderId ?? ""} onChange={(event) => void moveTest(test.id, event.target.value || null)}>
                  <option value="">Practice Arena</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folderPath(folder)}</option>)}
                </select>
              </div>
            </article>
          ))}
          {!visibleTests.length && <div className="cbt-empty folder-empty"><FolderOpen size={28} /><span>{initialFolderId ? (isAllTestsFolder ? "No tests have been created yet." : "This collection is empty. Return to Practice Arena and move or drag a test into this folder.") : "The Practice Arena is organised. Open All Tests to see every attempt, or create a new test."}</span></div>}
        </div>
      )}
      {renamingFolder && (
        <div className="submit-overlay" role="dialog" aria-modal="true" aria-labelledby="rename-folder-title">
          <form className="submit-card folder-action-card" onSubmit={(event) => { event.preventDefault(); void renameFolder(); }}>
            <button className="modal-close" type="button" onClick={() => setRenamingFolder(null)} aria-label="Close"><X size={17} /></button>
            <span className="folder-modal-icon"><Pencil size={22} /></span>
            <h2 id="rename-folder-title">Rename folder</h2>
            <p>Its tests and subfolders will stay exactly where they are.</p>
            <label className="folder-name-field"><span>Folder name</span><input autoFocus value={renameFolderName} onChange={(event) => setRenameFolderName(event.target.value)} maxLength={80} /></label>
            <div className="submit-actions">
              <button className="cbt-ghost" type="button" onClick={() => setRenamingFolder(null)}>Cancel</button>
              <button className="cbt-primary" type="submit" disabled={!renameFolderName.trim() || folderBusyId === renamingFolder.id}><Pencil size={14} /> Save name</button>
            </div>
          </form>
        </div>
      )}
      {confirmFolderDelete && (
        <div className="submit-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-folder-title">
          <div className="submit-card delete-attempt-card folder-action-card">
            <button className="modal-close" onClick={() => setConfirmFolderDelete(null)} aria-label="Close"><X size={17} /></button>
            <span className="folder-modal-icon danger"><Trash2 size={22} /></span>
            <h2 id="delete-folder-title">Delete “{confirmFolderDelete.name}”?</h2>
            <p>The folder itself will be deleted. Its {confirmFolderDelete.testCount} test{confirmFolderDelete.testCount === 1 ? "" : "s"} and {confirmFolderDelete.childCount} immediate subfolder{confirmFolderDelete.childCount === 1 ? "" : "s"} will be safely moved to the parent level. Nothing is removed from All Tests.</p>
            <div className="submit-actions">
              <button className="cbt-ghost" disabled={Boolean(folderBusyId)} onClick={() => setConfirmFolderDelete(null)}>Keep folder</button>
              <button className="danger-btn" disabled={Boolean(folderBusyId)} onClick={() => void deleteFolder()}><Trash2 size={15} /> Delete folder</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="submit-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-attempt-title">
          <div className="submit-card delete-attempt-card">
            <button className="modal-close" onClick={() => setConfirmDelete(null)} aria-label="Close"><X size={17} /></button>
            <Trash2 size={28} />
            <h2 id="delete-attempt-title">Delete this attempt?</h2>
            <p><strong>{confirmDelete.title}</strong></p>
            <p>This removes the attempt, performance record, error-log entries and its influence on question statistics. Bookmarked questions remain saved.</p>
            <div className="submit-actions">
              <button className="cbt-ghost" disabled={Boolean(deletingId)} onClick={() => setConfirmDelete(null)}>Keep attempt</button>
              <button className="danger-btn" disabled={Boolean(deletingId)} onClick={() => void deleteTest(confirmDelete.id)}>
                {deletingId ? <Loader2 className="cbt-spin" size={15} /> : <Trash2 size={15} />} Delete permanently
              </button>
            </div>
          </div>
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
  const [questionCount, setQuestionCount] = useState(NEET_FULL_TEST_QUESTIONS);
  const [durationMinutes, setDurationMinutes] = useState(NEET_FULL_TEST_DURATION_MINUTES);
  const [difficulty, setDifficulty] = useState("MIXED");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pyqAvailability, setPyqAvailability] = useState<PyqAvailability[] | null>(null);

  const chapterOptions = useMemo(
    () => CHAPTERS.filter((entry) => entry.slug === subject && (mode === "FULL_LENGTH" || entry.classLevel === classLevel)),
    [classLevel, mode, subject],
  );
  const unitChapterOptions = useMemo(
    () => CHAPTERS.filter((entry) => entry.classLevel === classLevel && selectedSubjects.includes(entry.slug)),
    [classLevel, selectedSubjects],
  );

  useEffect(() => {
    fetch("/api/practice/availability")
      .then((response) => response.json())
      .then((payload) => {
        const available = Array.isArray(payload.pyqYears) ? payload.pyqYears as PyqAvailability[] : [];
        setPyqAvailability(available);
        const completeYears = available.filter((entry) => entry.complete).map((entry) => String(entry.year));
        setPyqYear((current) => completeYears.includes(current) ? current : completeYears[0] ?? "");
      })
      .catch(() => setPyqAvailability([]));
  }, []);

  useEffect(() => {
    const isOfficialPaper = mode === "FULL_LENGTH" || mode === "PYQ_YEAR";
    const defaultCount = isOfficialPaper || mode === "SECTIONAL" ? NEET_FULL_TEST_QUESTIONS : 50;
    setQuestionCount(defaultCount);
    setDurationMinutes(isOfficialPaper ? NEET_FULL_TEST_DURATION_MINUTES : Math.min(NEET_MAX_PRACTICE_DURATION_MINUTES, defaultCount));
    setSelectedChapters([]);
    setTopic("");
  }, [mode]);

  const toggleSubject = (slug: NeetSubjectSlug) => {
    if (selectedSubjects.includes(slug)) {
      const removedChapters = new Set(CHAPTERS.filter((entry) => entry.slug === slug).map((entry) => entry.chapter));
      setSelectedChapters((current) => current.filter((chapter) => !removedChapters.has(chapter)));
    }
    setSelectedSubjects((prev) => (prev.includes(slug) ? prev.filter((entry) => entry !== slug) : [...prev, slug]));
  };

  const toggleChapter = (chapter: string) => {
    setSelectedChapters((prev) => (prev.includes(chapter) ? prev.filter((entry) => entry !== chapter) : [...prev, chapter]));
  };

  const canCreate =
    mode === "FULL_LENGTH" ||
    (mode === "PYQ_YEAR" && Boolean(pyqYear) && Boolean(pyqAvailability?.some((entry) => entry.complete && String(entry.year) === pyqYear))) ||
    (mode === "SECTIONAL" && selectedSubjects.length > 0) ||
    (mode === "UNIT" && selectedSubjects.length > 0 && selectedChapters.length > 0) ||
    (mode === "CHAPTER" && subject && selectedChapters.length > 0) ||
    (mode === "TOPIC" && subject && selectedChapters.length > 0 && topic.trim().length > 1);
  const isOfficialPaper = mode === "FULL_LENGTH" || mode === "PYQ_YEAR";

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
        aiFreshPercent: 0,
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

          {mode === "UNIT" && (
            <>
              <label className="cbt-label">Chapters from selected subjects</label>
              <div className="chapter-list">
                {unitChapterOptions.map((entry) => (
                  <button key={`${entry.slug}-${entry.chapter}`} className={`chapter-btn ${selectedChapters.includes(entry.chapter) ? "on" : ""}`} onClick={() => toggleChapter(entry.chapter)}>
                    <SquareCheck size={14} /> {entry.subject} · {entry.chapter}
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
              <select className="cbt-input" value={pyqYear} disabled={!pyqAvailability?.some((entry) => entry.complete)} onChange={(event) => setPyqYear(event.target.value)}>
                {pyqAvailability?.filter((entry) => entry.complete).map((entry) => <option key={entry.year} value={entry.year}>{entry.year} - authenticated full paper ({entry.count} rows)</option>)}
              </select>
              {pyqAvailability === null ? <p className="setup-note">Checking authenticated PYQ inventory...</p> : !pyqAvailability.some((entry) => entry.complete) ? <p className="setup-note"><AlertTriangle size={14} /> No full official paper has passed provenance and answer-key checks yet. PYQ mode stays locked instead of serving guessed questions.</p> : null}
            </>
          )}
        </div>

        <div className="setup-panel">
          <label className="cbt-label">Question count: {questionCount}</label>
          <input className="cbt-range" type="range" min={10} max={NEET_FULL_TEST_QUESTIONS} step={5} value={questionCount} disabled={isOfficialPaper} onChange={(event) => { const next = Number(event.target.value); setQuestionCount(next); setDurationMinutes(Math.min(NEET_MAX_PRACTICE_DURATION_MINUTES, next)); }} />
          <div className="range-row"><span>10</span><span>50</span><span>100</span><span>180</span></div>

          <label className="cbt-label">Duration: {durationMinutes} min</label>
          <input className="cbt-range" type="range" min={15} max={NEET_MAX_PRACTICE_DURATION_MINUTES} step={5} value={durationMinutes} disabled={isOfficialPaper} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
          <p className="setup-note"><TimerReset size={14} /> Full-length and PYQ papers follow the 180-question, 180-minute NEET policy. Timer pauses only in deliberate pause mode.</p>

          <label className="cbt-label">Difficulty</label>
          <div className="seg-grid four">
            {["MIXED", "EASY", "MODERATE", "TOUGH"].map((entry) => <button key={entry} className={`seg-btn ${difficulty === entry ? "on" : ""}`} onClick={() => setDifficulty(entry)}>{entry === "MIXED" ? "NEET mix" : entry}</button>)}
          </div>

          <div className="setup-summary">
            <strong>Paper policy</strong>
            <span>Strict verified bank questions first; official mocks must pass 45/45/45/45 subject balance before release.</span>
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
  // Generation is driven centrally by PracticeCBTClient; this view just reflects the
  // live count it streams into `test` and advances to the exam once READY.
  useEffect(() => {
    if (test.status === "READY" || test.status === "RUNNING" || test.status === "PAUSED") onReady(test);
  }, [test, onReady]);

  const generated = Math.min(test.generatedCount, test.questionCount);
  const target = test.questionCount;
  const pct = Math.min(100, Math.round((generated / Math.max(1, target)) * 100));
  return (
    <div className="gen-card">
      <ShieldCheck size={28} />
      <h1>Assembling CBT paper</h1>
      <p>Questions are served from the bank snapshot first. If the small live AI portion fails, the bank fills those slots too.</p>
      <div className="gen-bar"><span style={{ width: `${pct}%` }} /></div>
      <strong><AnimatedCount value={generated} />/{target} questions ready</strong>
      <button className="cbt-ghost" onClick={onExit}><ArrowLeft size={15} /> Generate in background</button>
      <p className="gen-hint">You can leave this screen — generation keeps running and the count updates live on your attempts list.</p>
    </div>
  );
}

export function CBTPracticeArena({ test, proctorStream, onSubmitted, onExit }: { test: PracticeTest; proctorStream: MediaStream | null; onSubmitted: (test: PracticeTest) => void; onExit: () => void }) {
  const questions = useMemo(() => test.questions ?? [], [test.questions]);
  const arenaRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const pauseIntentRef = useRef(false);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const evidenceRef = useRef<ProctorEvidence[]>([]);
  const manualPauseCountRef = useRef((test.pauseLogs ?? []).filter((event) => event.type === "PAUSE_MANUAL").length);
  const [attemptStatus, setAttemptStatus] = useState<AttemptStatus>(test.status);
  const [currentIndex, setCurrentIndex] = useState(Math.min(test.currentQuestionIndex ?? 0, Math.max(0, questions.length - 1)));
  const [answers, setAnswers] = useState<Record<string, number | null>>(() => answersFromList(test.answers));
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, CBTQuestionStatus>>(() => initialStatuses(questions, test.questionStatuses));
  const [remainingSeconds, setRemainingSeconds] = useState(test.remainingSeconds ?? Math.min(NEET_MAX_PRACTICE_DURATION_MINUTES, test.durationMinutes ?? test.questionCount) * 60);
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

  useEffect(() => {
    if (cameraVideoRef.current && proctorStream) cameraVideoRef.current.srcObject = proctorStream;
  }, [proctorStream]);

  const captureEvidence = useCallback(async (type: string, detail?: string) => {
    if (!PROCTOR_EMAIL_ENABLED) return;
    if (evidenceRef.current.length >= 3) return;
    const imageDataUrl = await captureCameraFrame(cameraVideoRef.current);
    if (imageDataUrl) evidenceRef.current.push({ ...nowEvent(type, detail), imageDataUrl });
  }, []);

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
      try {
        await fetch(`/api/practice/${test.id}/proctor-report`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            events: finalSecurityEvents.map((event) => ({ reason: event.type, at: event.at, detail: event.detail })),
            evidence: PROCTOR_EMAIL_ENABLED
              ? evidenceRef.current.map((event) => ({ reason: event.type, at: event.at, detail: event.detail, imageDataUrl: event.imageDataUrl }))
              : [],
          }),
        });
      } finally {
        evidenceRef.current = [];
      }
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
      void (async () => {
        setSecurityEvents((prev) => [...prev, nowEvent(reason)]);
        await captureEvidence(reason, "Integrity interruption");
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
        void pauseTest("SECURITY");
      })();
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

  const pauseTest = async (origin: "MANUAL" | "SECURITY" = "MANUAL") => {
    pauseIntentRef.current = true;
    if (origin === "MANUAL") {
      const count = ++manualPauseCountRef.current;
      const event = nowEvent("PAUSE_MANUAL", `Manual pause ${count}/${MAX_SECURITY_VIOLATIONS}`);
      setSecurityEvents((previous) => [...previous, event]);
      await captureEvidence(event.type, event.detail);
      if (count >= MAX_SECURITY_VIOLATIONS) {
        void submitAttempt("AUTO", "PAUSE_LIMIT");
        return;
      }
    }
    const nextLogs = [...pauseLogs, nowEvent(origin === "MANUAL" ? "PAUSE_MANUAL" : "PAUSE_SECURITY")];
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
      <video ref={cameraVideoRef} className="proctor-camera-feed" autoPlay playsInline muted aria-hidden="true" />
      <CBTTopBar
        remainingSeconds={remainingSeconds}
        isFullscreen={isFullscreen}
        saving={saving}
        savedAt={savedAt}
        onPause={() => void pauseTest("MANUAL")}
        onSubmit={() => setConfirmOpen(true)}
        onFullscreen={enterFullscreen}
        status={attemptStatus}
      />
      <main className="arena-main">
        <section className="arena-workspace">
          <CBTSubjectStrip questions={questions} currentIndex={currentIndex} onJump={markVisited} />
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

export function CBTSubjectStrip({
  questions,
  currentIndex,
  onJump,
}: {
  questions: Question[];
  currentIndex: number;
  onJump: (index: number) => void;
}) {
  const subjects = Array.from(new Set(questions.map((question) => question.subject)));
  const currentSubject = questions[currentIndex]?.subject;

  return (
    <nav className="nta-subject-strip" aria-label="Question sections">
      {subjects.map((subject) => {
        const firstIndex = questions.findIndex((question) => question.subject === subject);
        const total = questions.filter((question) => question.subject === subject).length;
        return (
          <button key={subject} className={subject === currentSubject ? "active" : ""} onClick={() => onJump(firstIndex)}>
            <span>{subject}</span>
            <b>{total}</b>
          </button>
        );
      })}
    </nav>
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
          <strong>National Testing Agency</strong>
          <span>
            <i className={`save-dot ${saving ? "saving" : savedAt ? "saved" : ""}`} />
            {saving ? "Saving response" : savedAt ? `Saved ${savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "NEET UG mock console"}
          </span>
        </div>
      </div>
      <div className="nta-clock">
        <span>Time Left</span>
        <strong className={`arena-timer ${remainingSeconds < 300 ? "low" : ""}`}>{formatClock(remainingSeconds)}</strong>
      </div>
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
  const format = detectQuestionFormat(question);
  return (
    <article className="question-panel">
      <div className="question-meta">
        <span className="q-no">Question No. {index + 1}</span>
        <span className="q-total">Question {index + 1} of {total}</span>
        <span className="q-type">Question Type : {format}</span>
      </div>
      <div className="q-instruction">Choose the correct answer. Click <b>Save &amp; Next</b> to record and move ahead, or <b>Mark for Review &amp; Next</b> to revisit.</div>
      <div className="question-text"><MarkdownBlock text={question.question} /></div>
      {question.visualAssetUrl ? (
        <div className="question-visual">
          <img src={question.visualAssetUrl} alt={question.visualAssetAlt ?? "Question figure"} loading="lazy" />
        </div>
      ) : null}
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
        Question Palette - {counts.ANSWERED + counts.ANSWERED_MARKED_FOR_REVIEW}/{questions.length} answered
      </button>
      <div className="palette-body">
        <div className="palette-head">
          <h2>Question Palette</h2>
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
        <p className="palette-note">Answered &amp; Marked for Review will be evaluated.</p>
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
        <button className="ctl" onClick={onClear}><Eraser size={14} /> Clear Response</button>
        <button className="ctl mark" onClick={onMarkNext}><Flag size={14} /> Mark for Review &amp; Next</button>
      </div>
      <div className="controls-group">
        <button className="ctl" disabled={index === 0} onClick={onPrevious}><ArrowLeft size={14} /> Previous</button>
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
      <DetailedAnswerReview testId={test.id} questions={test.questions ?? []} answers={answers} initialReviews={test.reviews ?? []} />
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
            <article className="review-card" key={`${question.id}-${index}`}>
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
