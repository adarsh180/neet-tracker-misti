"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  FileSpreadsheet,
  History,
  LineChart,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { SYLLABUS } from "@/lib/syllabus";

const TEST_TYPES = ["AITS", "SECTIONAL", "UNIT", "FLT", "PYQ", "REAL_ATTEMPT"];
const SUBJECTS = SYLLABUS.map(s => s.name);

const getChapters = (subjectName: string) => {
  const subj = SYLLABUS.find(s => s.name === subjectName);
  return subj ? subj.chapters.map(c => c.name) : [];
};
const getTopics = (subjectName: string, chapterName: string) => {
  const subj = SYLLABUS.find(s => s.name === subjectName);
  if (!subj) return [];
  const chap = subj.chapters.find(c => c.name === chapterName);
  return chap ? chap.topics : [];
};

type SubjectTopicRecord = {
  id: string;
  name: string;
  topics: Array<{
    id: string;
    name: string;
    chapter: string | null;
    classLevel: string | null;
  }>;
};

const ATTEMPT_STATUS = ["ATTEMPTED", "SKIPPED"];
const OUTCOMES = ["CORRECT", "WRONG", "UNMARKED"];
const CONTENT_STATUS = ["HAD_CONTENT", "WEAK_CONTENT", "NOT_STUDIED", "OUT_OF_SYLLABUS"];
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];
const REASONS = [
  "Panic",
  "Anxiety",
  "Forgotten",
  "Confused",
  "Silly mistake",
  "Calculation",
  "Formula gap",
  "Concept gap",
  "Time pressure",
  "Misread question",
  "Option trap",
  "Guessing",
  "Not studied",
  "Weak revision",
  "Low confidence",
];
const CHART_COLORS = ["#d4a853", "#c2606e", "#a855f7", "#4f9cf9", "#22c55e", "#f97316"];

type SeverityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface ErrorQuestion {
  id: string;
  questionNumber: number;
  questionSummary: string | null;
  subject: string;
  chapter: string | null;
  topic: string | null;
  attemptStatus: string;
  outcome: string;
  correctAnswer: string | null;
  whyCorrect: string | null;
  whereLacked: string | null;
  contentStatus: string;
  outOfSyllabus: boolean;
  notStudied: boolean;
  difficulty: string;
  confidence: number | null;
  timeSpentSeconds: number | null;
  reasonTags: string[] | null;
  actionFix: string | null;
  notes: string | null;
}

interface ErrorAnalysis {
  id: string;
  response: string;
  model: string | null;
  createdAt: string;
}

interface ErrorLog {
  id: string;
  testName: string;
  testType: string;
  questionCount: number;
  takenAt: string;
  notes: string | null;
  questions: ErrorQuestion[];
  analyses: ErrorAnalysis[];
  createdAt: string;
}

interface Analytics {
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  attempted: number;
  accuracy: number;
  skipRate: number;
  weakContentRate: number;
  weakContent: number;
  notStudied: number;
  outOfSyllabus: number;
  avgSeconds: number;
  subjects: Array<{
    subject: string;
    total: number;
    correct: number;
    wrong: number;
    skipped: number;
    weak: number;
    accuracy: number;
    errorRate: number;
    avgSeverity: number;
  }>;
  reasonTags: Array<{ label: string; count: number }>;
  chapters: Array<{ chapter: string; count: number }>;
  severity: {
    avgScore: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    byQuestion: Array<{
      questionNumber: number;
      subject: string;
      chapter: string;
      topic: string;
      outcome: string;
      score: number;
      severity: SeverityLevel;
      reasons: string[];
    }>;
    top: Array<{
      questionNumber: number;
      subject: string;
      chapter: string;
      topic: string;
      outcome: string;
      score: number;
      severity: SeverityLevel;
      reasons: string[];
    }>;
  };
  timeline: Array<{
    question: number;
    accuracy: number;
    attempted: number;
    correct: number;
    outcome: string;
    severity: number;
  }>;
}

interface PatternItem {
  subject: string;
  chapter: string;
  topic: string;
  reason: string;
  attempts: number;
  mistakes: number;
  status: "RECOVERED" | "ACTIVE_LOOP" | "WATCH";
  avgSeverity: number;
  severity: SeverityLevel;
  firstSeen: string | null;
  lastSeen: string | null;
  latestTest: string | null;
  quickNote: string;
  recommendation: string;
}

interface Memory {
  patterns: PatternItem[];
  activeLoops: PatternItem[];
  recovered: PatternItem[];
  watch: PatternItem[];
  comparison: {
    latestTitle: string;
    previousTitle: string;
    accuracyDelta: number;
    skipDelta: number;
    weakContentDelta: number;
    severityDelta: number;
    latestLogged: number;
    previousLogged: number;
  } | null;
}

interface Snapshot extends ErrorLog {
  analytics: Analytics;
  memory: Memory;
}

interface GlobalAnalysis {
  id: string;
  response: string;
  model: string | null;
  createdAt: string;
}

type DraftQuestion = {
  id: string;
  questionNumber: number;
  questionSummary: string;
  subject: string;
  chapter: string;
  topic: string;
  attemptStatus: string;
  outcome: string;
  correctAnswer: string;
  whyCorrect: string;
  whereLacked: string;
  contentStatus: string;
  outOfSyllabus: boolean;
  notStudied: boolean;
  difficulty: string;
  confidence: string;
  timeSpentSeconds: string;
  reasonTags: string[];
  actionFix: string;
  notes: string;
};

const blankForm = {
  testName: "",
  testType: "AITS",
  questionCount: "180",
  takenAt: format(new Date(), "yyyy-MM-dd"),
  notes: "",
};

function cleanLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toDraftQuestion(question?: ErrorQuestion | null): DraftQuestion {
  return {
    id: question?.id ?? "",
    questionNumber: question?.questionNumber ?? 1,
    questionSummary: question?.questionSummary ?? "",
    subject: question?.subject ?? "Physics",
    chapter: question?.chapter ?? "",
    topic: question?.topic ?? "",
    attemptStatus: question?.attemptStatus ?? "SKIPPED",
    outcome: question?.outcome ?? "UNMARKED",
    correctAnswer: question?.correctAnswer ?? "",
    whyCorrect: question?.whyCorrect ?? "",
    whereLacked: question?.whereLacked ?? "",
    contentStatus: question?.contentStatus ?? "HAD_CONTENT",
    outOfSyllabus: Boolean(question?.outOfSyllabus),
    notStudied: Boolean(question?.notStudied),
    difficulty: question?.difficulty ?? "MEDIUM",
    confidence: question?.confidence ? String(question.confidence) : "",
    timeSpentSeconds: question?.timeSpentSeconds ? String(question.timeSpentSeconds) : "",
    reasonTags: question?.reasonTags ?? [],
    actionFix: question?.actionFix ?? "",
    notes: question?.notes ?? "",
  };
}

function latestAnalysis(log: Snapshot | null) {
  return log?.analyses?.[0] || null;
}

function MarkdownPanel({ content }: { content: string }) {
  return (
    <div className="el-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export default function ErrorLogTrackerPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [globalAnalysis, setGlobalAnalysis] = useState<GlobalAnalysis | null>(null);
  const [form, setForm] = useState(blankForm);
  const [questionDraft, setQuestionDraft] = useState<DraftQuestion>(toDraftQuestion());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [viewMode, setViewMode] = useState<"form" | "grid">("form");
  const [gridQuestions, setGridQuestions] = useState<DraftQuestion[]>([]);
  const [subjectTopicRecords, setSubjectTopicRecords] = useState<SubjectTopicRecord[]>([]);
  const [testAiLoading, setTestAiLoading] = useState(false);
  const [globalAiLoading, setGlobalAiLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    const res = await fetch("/api/error-logs", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as ErrorLog[];
      setLogs(data);
      setSelectedId((current) => current || data[0]?.id || null);
    }
  }, []);

  const fetchGlobalAnalysis = useCallback(async () => {
    const res = await fetch("/api/error-logs/analysis", { cache: "no-store" });
    if (res.ok) setGlobalAnalysis(await res.json());
  }, []);

  const fetchSubjectTopics = useCallback(async () => {
    const res = await fetch("/api/subjects", { cache: "no-store" });
    if (res.ok) setSubjectTopicRecords((await res.json()) as SubjectTopicRecord[]);
  }, []);

  const fetchSelected = useCallback(async (id: string) => {
    const res = await fetch(`/api/error-logs/${id}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as Snapshot;
      setSnapshot(data);
      const currentQuestion =
        data.questions.find((q) => q.id === questionDraft.id) ||
        data.questions.find((q) => !q.questionSummary && q.outcome === "UNMARKED") ||
        data.questions[0] ||
        null;
      setQuestionDraft(toDraftQuestion(currentQuestion));
      setGridQuestions(data.questions.map(toDraftQuestion));
    }
  }, [questionDraft.id]);

  useEffect(() => {
    Promise.all([fetchLogs(), fetchGlobalAnalysis(), fetchSubjectTopics()]).finally(() => setLoading(false));
  }, [fetchLogs, fetchGlobalAnalysis, fetchSubjectTopics]);

  useEffect(() => {
    if (selectedId) fetchSelected(selectedId);
    else setSnapshot(null);
  }, [selectedId, fetchSelected]);

  const trendData = useMemo(
    () =>
      [...logs]
        .sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime())
        .map((log) => {
          const wrong = log.questions.filter((q) => q.outcome === "WRONG").length;
          const skipped = log.questions.filter((q) => q.attemptStatus === "SKIPPED").length;
          const correct = log.questions.filter((q) => q.outcome === "CORRECT").length;
          return {
            name: log.testName,
            date: format(new Date(log.takenAt), "d MMM"),
            wrong,
            skipped,
            correct,
            risk: wrong + skipped,
          };
        }),
    [logs]
  );

  const reasonChartData = useMemo(() => {
    const data = snapshot?.analytics.reasonTags.length
      ? snapshot.analytics.reasonTags.map((item) => ({ name: item.label, value: item.count }))
      : [
          { name: "Correct", value: snapshot?.analytics.correct ?? 0 },
          { name: "Wrong", value: snapshot?.analytics.wrong ?? 0 },
          { name: "Skipped", value: snapshot?.analytics.skipped ?? 0 },
        ].filter((item) => item.value > 0);
    return data.length ? data : [{ name: "No data", value: 1 }];
  }, [snapshot]);

  const selectedSeverity = useMemo(() => {
    return new Map((snapshot?.analytics.severity.byQuestion ?? []).map((item) => [item.questionNumber, item]));
  }, [snapshot]);

  const timeChartData = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.questions
      .filter((q) => q.timeSpentSeconds != null && q.timeSpentSeconds > 0)
      .map((q) => ({
        x: q.timeSpentSeconds,
        y: q.difficulty === "HARD" ? 3 : q.difficulty === "MEDIUM" ? 2 : 1,
        difficulty: q.difficulty,
        outcome: q.outcome,
        questionNumber: q.questionNumber,
        fill: q.outcome === "CORRECT" ? "var(--success)" : q.outcome === "WRONG" ? "var(--danger)" : "var(--gold-bright)",
      }));
  }, [snapshot]);

  const updateDraft = <K extends keyof DraftQuestion>(key: K, value: DraftQuestion[K]) => {
    setQuestionDraft((current) => ({ ...current, [key]: value }));
  };

  const normalizeTopicText = (value: string) => value.replace(/\s+/g, " ").trim();
  const normalizeLookup = (value: string | null | undefined) => normalizeTopicText(value ?? "").toLowerCase();

  const getSubjectTopicRecord = (subjectName: string) =>
    subjectTopicRecords.find((subject) => normalizeLookup(subject.name) === normalizeLookup(subjectName)) ?? null;

  const getMergedChapters = (subjectName: string) => {
    const staticChapters = getChapters(subjectName);
    const dbChapters =
      getSubjectTopicRecord(subjectName)?.topics
        .map((topic) => topic.chapter)
        .filter((chapter): chapter is string => Boolean(chapter && chapter.trim())) ?? [];

    return [...new Set([...staticChapters, ...dbChapters])];
  };

  const getMergedTopics = (subjectName: string, chapterName: string) => {
    const staticTopics = getTopics(subjectName, chapterName);
    const dbTopics =
      getSubjectTopicRecord(subjectName)?.topics
        .filter((topic) => normalizeLookup(topic.chapter) === normalizeLookup(chapterName))
        .map((topic) => topic.name) ?? [];

    return [...new Set([...staticTopics, ...dbTopics])];
  };

  const inferClassLevel = (subjectName: string, chapterName: string) => {
    const subject = SYLLABUS.find((item) => item.name === subjectName);
    return subject?.chapters.find((chapter) => chapter.name === chapterName)?.classLevel ?? null;
  };

  const ensureTopicForFuture = async (subjectName: string, chapterName: string, topicName: string) => {
    const cleanTopic = normalizeTopicText(topicName);
    if (!cleanTopic) return cleanTopic;

    const staticExisting = getTopics(subjectName, chapterName).find(
      (topic) => normalizeLookup(topic) === normalizeLookup(cleanTopic),
    );
    if (staticExisting) return staticExisting;

    const subject = getSubjectTopicRecord(subjectName);
    if (!subject) return cleanTopic;

    const existing = subject.topics.find(
      (topic) =>
        normalizeLookup(topic.chapter) === normalizeLookup(chapterName) &&
        normalizeLookup(topic.name) === normalizeLookup(cleanTopic),
    );
    if (existing) return existing.name;

    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_topic",
        subjectId: subject.id,
        name: cleanTopic,
        chapter: normalizeTopicText(chapterName) || null,
        classLevel: inferClassLevel(subjectName, chapterName),
      }),
    });

    if (!res.ok) throw new Error("Could not save this custom topic for future use.");
    const created = (await res.json()) as SubjectTopicRecord["topics"][number];

    setSubjectTopicRecords((current) =>
      current.map((item) => {
        if (item.id !== subject.id) return item;
        const exists = item.topics.some((topic) => topic.id === created.id);
        return exists ? item : { ...item, topics: [...item.topics, created] };
      }),
    );

    return created.name;
  };

  const commitQuestionTopic = async (value: string) => {
    const cleanTopic = normalizeTopicText(value);
    updateDraft("topic", cleanTopic);
    if (!cleanTopic || !questionDraft.subject) return;

    try {
      const savedTopic = await ensureTopicForFuture(questionDraft.subject, questionDraft.chapter, cleanTopic);
      updateDraft("topic", savedTopic);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const commitGridTopic = async (index: number, question: DraftQuestion) => {
    const cleanTopic = normalizeTopicText(question.topic);
    const nextQuestion = { ...question, topic: cleanTopic };
    const copy = [...gridQuestions];
    copy[index] = nextQuestion;
    setGridQuestions(copy);

    try {
      const savedTopic =
        cleanTopic && question.subject
          ? await ensureTopicForFuture(question.subject, question.chapter, cleanTopic)
          : cleanTopic;
      const savedQuestion = { ...nextQuestion, topic: savedTopic };
      const nextCopy = [...copy];
      nextCopy[index] = savedQuestion;
      setGridQuestions(nextCopy);
      await saveGridRow(savedQuestion);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const createLog = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError("");
    const res = await fetch("/api/error-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, questionCount: Number(form.questionCount) }),
    });
    if (res.ok) {
      const created = (await res.json()) as ErrorLog;
      setForm(blankForm);
      await fetchLogs();
      setSelectedId(created.id);
    } else {
      setError("Could not create the test log.");
    }
    setCreating(false);
  };

  const saveQuestion = async () => {
    if (!snapshot || !questionDraft.id) return;
    setSavingQuestion(true);
    setError("");
    const payload = {
      questionSummary: questionDraft.questionSummary,
      subject: questionDraft.subject,
      chapter: questionDraft.chapter,
      topic: questionDraft.topic,
      attemptStatus: questionDraft.attemptStatus,
      outcome: questionDraft.outcome,
      correctAnswer: questionDraft.correctAnswer,
      whyCorrect: questionDraft.whyCorrect,
      whereLacked: questionDraft.whereLacked,
      contentStatus: questionDraft.contentStatus,
      outOfSyllabus: questionDraft.outOfSyllabus,
      notStudied: questionDraft.notStudied,
      difficulty: questionDraft.difficulty,
      confidence: questionDraft.confidence ? Number(questionDraft.confidence) : null,
      timeSpentSeconds: questionDraft.timeSpentSeconds ? Number(questionDraft.timeSpentSeconds) : null,
      reasonTags: questionDraft.reasonTags,
      actionFix: questionDraft.actionFix,
      notes: questionDraft.notes,
    };
    const res = await fetch(`/api/error-logs/${snapshot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: questionDraft.id, question: payload }),
    });
    if (res.ok) {
      await Promise.all([fetchSelected(snapshot.id), fetchLogs()]);
    } else {
      setError("Could not save the question row.");
    }
    setSavingQuestion(false);
  };

  const saveGridRow = async (question: DraftQuestion) => {
    if (!snapshot) return;
    const payload = {
      ...question,
      confidence: question.confidence ? Number(question.confidence) : null,
      timeSpentSeconds: question.timeSpentSeconds ? Number(question.timeSpentSeconds) : null,
    };
    await fetch(`/api/error-logs/${snapshot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, question: payload }),
    });
  };

  const saveBatch = async () => {
    if (!snapshot) return;
    setSavingBatch(true);
    setError("");
    const res = await fetch(`/api/error-logs/${snapshot.id}/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questions: gridQuestions.map(q => ({
          ...q,
          confidence: q.confidence ? Number(q.confidence) : null,
          timeSpentSeconds: q.timeSpentSeconds ? Number(q.timeSpentSeconds) : null
        }))
      })
    });
    if (res.ok) {
      await Promise.all([fetchSelected(snapshot.id), fetchLogs()]);
      setViewMode("form");
    } else {
      setError("Could not save batch questions.");
    }
    setSavingBatch(false);
  };

  const toggleReason = (reason: string) => {
    updateDraft(
      "reasonTags",
      questionDraft.reasonTags.includes(reason)
        ? questionDraft.reasonTags.filter((item) => item !== reason)
        : [...questionDraft.reasonTags, reason]
    );
  };

  const generateTestAnalysis = async () => {
    if (!snapshot) return;
    setTestAiLoading(true);
    setError("");
    const res = await fetch(`/api/error-logs/${snapshot.id}/analysis`, { method: "POST" });
    if (res.ok) await fetchSelected(snapshot.id);
    else setError("AI test analysis failed.");
    setTestAiLoading(false);
  };

  const generateGlobalAnalysis = async () => {
    setGlobalAiLoading(true);
    setError("");
    const res = await fetch("/api/error-logs/analysis", { method: "POST" });
    if (res.ok) setGlobalAnalysis(await res.json());
    else setError("AI all-test analysis failed.");
    setGlobalAiLoading(false);
  };

  const deleteSelected = async () => {
    if (!snapshot || !confirm("Delete this error log and all question rows?")) return;
    await fetch(`/api/error-logs/${snapshot.id}`, { method: "DELETE" });
    setSnapshot(null);
    setSelectedId(null);
    await fetchLogs();
  };

  return (
    <div className="error-log-page animate-fade-in">
      <div className="el-bg" />
      <main className="el-shell">
        <header className="el-hero glass-card">
          <div>
            <Link href="/tests" className="el-back"><ArrowLeft size={14} /> Tests overview</Link>
            <div className="el-eyebrow"><FileSpreadsheet size={14} /> Method and Error Analysis</div>
            <h1 className="el-title gradient-text">Log the test. Fix the pattern.</h1>
            <p className="el-copy">
              Create a test, record each question cleanly, then let deterministic analytics and on-demand AI expose the repeated damage.
            </p>
          </div>
          <div className="el-hero-meter">
            <span>Logged coverage</span>
            <strong>{snapshot?.analytics.total ?? 0}/{snapshot?.questionCount ?? 0}</strong>
            <em>{snapshot ? `${snapshot.analytics.accuracy}% accuracy from attempted rows` : "Select a test"}</em>
          </div>
        </header>

        {error ? <div className="el-alert">{error}</div> : null}

        <section className="el-workbench">
          <aside className="glass-card el-history">
            <div className="el-panel-head">
              <div>
                <span className="el-mini-label">All test history</span>
                <h2>Error ledgers</h2>
              </div>
              <History size={18} />
            </div>

            <form className="el-create" onSubmit={createLog}>
              <input
                className="el-field"
                placeholder="Test name"
                value={form.testName}
                onChange={(event) => setForm((current) => ({ ...current, testName: event.target.value }))}
                required
              />
              <div className="el-create-grid">
                <select
                  className="el-field el-select"
                  value={form.testType}
                  onChange={(event) => setForm((current) => ({ ...current, testType: event.target.value }))}
                >
                  {TEST_TYPES.map((type) => (
                    <option key={type} value={type}>{cleanLabel(type)}</option>
                  ))}
                </select>
                <input
                  className="el-field"
                  type="number"
                  min="1"
                  max="300"
                  value={form.questionCount}
                  onChange={(event) => setForm((current) => ({ ...current, questionCount: event.target.value }))}
                  required
                />
              </div>
              <input
                className="el-field"
                type="date"
                value={form.takenAt}
                onChange={(event) => setForm((current) => ({ ...current, takenAt: event.target.value }))}
              />
              <button className="btn btn-primary btn-sm w-full" disabled={creating}>
                {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Create Log
              </button>
            </form>

            <div className="el-history-list">
              {loading ? <div className="skeleton el-skeleton" /> : null}
              {!loading && logs.map((log) => {
                const wrong = log.questions.filter((q) => q.outcome === "WRONG").length;
                const skipped = log.questions.filter((q) => q.attemptStatus === "SKIPPED").length;
                return (
                  <button
                    key={log.id}
                    className={`el-history-card ${selectedId === log.id ? "active" : ""}`}
                    onClick={() => setSelectedId(log.id)}
                    type="button"
                  >
                    <strong>{log.testName}</strong>
                    <span>{cleanLabel(log.testType)} - {format(new Date(log.takenAt), "d MMM yyyy")}</span>
                    <em>{log.questions.length}/{log.questionCount} rows - {wrong} wrong - {skipped} skipped</em>
                  </button>
                );
              })}
              {!loading && logs.length === 0 ? <div className="el-empty-small">Create your first error ledger.</div> : null}
            </div>
          </aside>

          <section className="el-main">
            <section className="el-metrics">
              {[
                { label: "Attempted", value: snapshot?.analytics.attempted ?? 0, hint: "answered rows", icon: Target, tone: "gold" },
                { label: "Wrong", value: snapshot?.analytics.wrong ?? 0, hint: "needs correction", icon: XCircle, tone: "red" },
                { label: "Skipped", value: `${snapshot?.analytics.skipRate ?? 0}%`, hint: "avoidance rate", icon: CircleDot, tone: "blue" },
                { label: "Weak content", value: `${snapshot?.analytics.weakContentRate ?? 0}%`, hint: "content gap", icon: AlertTriangle, tone: "violet" },
                { label: "Severity", value: snapshot?.analytics.severity.avgScore ?? 0, hint: "avg risk score", icon: BarChart3, tone: "saffron" },
              ].map((metric) => (
                <article key={metric.label} className={`glass-card el-metric ${metric.tone}`}>
                  <metric.icon size={17} />
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <em>{metric.hint}</em>
                </article>
              ))}
            </section>

            <section className="glass-card el-memory">
              <div className="el-panel-head">
                <div>
                  <span className="el-mini-label">Mistake memory</span>
                  <h2>Recovery, repetition and severity</h2>
                </div>
                <span className="el-pill">{snapshot?.memory.patterns.length ?? 0} patterns</span>
              </div>

              {snapshot?.memory.comparison ? (
                <div className="el-delta-grid">
                  {[
                    { label: "Accuracy", value: snapshot.memory.comparison.accuracyDelta, suffix: "%", goodPositive: true },
                    { label: "Skip rate", value: snapshot.memory.comparison.skipDelta, suffix: "%", goodPositive: false },
                    { label: "Weak content", value: snapshot.memory.comparison.weakContentDelta, suffix: "%", goodPositive: false },
                    { label: "Severity", value: snapshot.memory.comparison.severityDelta, suffix: "", goodPositive: false },
                  ].map((item) => {
                    const good = item.value === 0 ? "" : item.value > 0 === item.goodPositive ? "good" : "bad";
                    return (
                      <article key={item.label} className="el-delta">
                        <span>{item.label}</span>
                        <strong className={good}>{item.value > 0 ? "+" : ""}{item.value}{item.suffix}</strong>
                        <em>{snapshot.memory.comparison?.latestTitle} vs {snapshot.memory.comparison?.previousTitle}</em>
                      </article>
                    );
                  })}
                </div>
              ) : null}

              <div className="el-pattern-grid">
                <div>
                  <h3>Repeated loops</h3>
                  <div className="el-pattern-list">
                    {(snapshot?.memory.activeLoops ?? []).slice(0, 4).map((pattern) => (
                      <article key={`${pattern.subject}-${pattern.chapter}-${pattern.topic}-${pattern.reason}`} className="el-pattern active-loop">
                        <div>
                          <strong>{pattern.topic}</strong>
                          <span>{pattern.subject} - {pattern.reason}</span>
                        </div>
                        <i className={`severity ${pattern.severity.toLowerCase()}`}>{pattern.severity} {pattern.avgSeverity}</i>
                        <p>{pattern.quickNote}</p>
                        <em>{pattern.recommendation}</em>
                      </article>
                    ))}
                    {snapshot?.memory.activeLoops.length === 0 ? <p className="el-muted">No repeated loop is visible yet.</p> : null}
                  </div>
                </div>
                <div>
                  <h3>Recovered patterns</h3>
                  <div className="el-pattern-list">
                    {(snapshot?.memory.recovered ?? []).slice(0, 4).map((pattern) => (
                      <article key={`${pattern.subject}-${pattern.chapter}-${pattern.topic}-recovered`} className="el-pattern recovered">
                        <div>
                          <strong>{pattern.topic}</strong>
                          <span>{pattern.subject} - {pattern.mistakes} earlier miss{pattern.mistakes === 1 ? "" : "es"}</span>
                        </div>
                        <p>{pattern.quickNote}</p>
                        <em>Latest seen in {pattern.latestTest ?? "recent test"}</em>
                      </article>
                    ))}
                    {snapshot?.memory.recovered.length === 0 ? <p className="el-muted">Recovery signals appear after the same area improves later.</p> : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="el-charts">
              <article className="glass-card el-chart-card">
                <div className="el-panel-head">
                  <div>
                    <span className="el-mini-label">X-Y Line Graph</span>
                    <h2>Running accuracy across questions</h2>
                  </div>
                  <LineChart size={18} />
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={snapshot?.analytics.timeline ?? []}>
                    <defs>
                      <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4a853" stopOpacity={0.42} />
                        <stop offset="95%" stopColor="#d4a853" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.055)" />
                    <XAxis dataKey="question" tick={{ fill: "rgba(255,255,255,.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "rgba(255,255,255,.45)", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#0b0b10", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14 }} />
                    <Area type="monotone" dataKey="accuracy" stroke="#d4a853" strokeWidth={3} fill="url(#accuracyGradient)" animationDuration={1300} />
                  </AreaChart>
                </ResponsiveContainer>
              </article>

              <article className="glass-card el-chart-card">
                <div className="el-panel-head">
                  <div>
                    <span className="el-mini-label">Subject damage</span>
                    <h2>Error rate by subject</h2>
                  </div>
                  <BarChart3 size={18} />
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={snapshot?.analytics.subjects ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.055)" />
                    <XAxis dataKey="subject" tick={{ fill: "rgba(255,255,255,.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "rgba(255,255,255,.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0b0b10", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14 }} />
                    <Bar dataKey="errorRate" radius={[10, 10, 0, 0]} animationDuration={1200}>
                      {(snapshot?.analytics.subjects ?? []).map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </article>

              {timeChartData.length > 0 && (
                <article className="glass-card el-chart-card">
                  <div className="el-panel-head">
                    <div>
                      <span className="el-mini-label">Time Scatter</span>
                      <h2>Time vs Difficulty Trap</h2>
                    </div>
                    <History size={18} />
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.055)" />
                      <XAxis type="number" dataKey="x" name="Seconds" tick={{ fill: "rgba(255,255,255,.45)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="number" dataKey="y" name="Difficulty" domain={[0, 4]} tick={{ fill: "rgba(255,255,255,.45)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => v === 1 ? 'EASY' : v === 2 ? 'MEDIUM' : v === 3 ? 'HARD' : ''} />
                      <ZAxis type="number" range={[40, 40]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: "#0b0b10", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14 }} formatter={(v: any, n: any, p: any) => [`${v}s`, `Difficulty: ${p.payload.difficulty} | Outcome: ${p.payload.outcome}`]} />
                      <Scatter data={timeChartData}>
                        {timeChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.8} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </article>
              )}
            </section>

            <section className={`el-editor-grid ${viewMode === "grid" ? "full" : ""}`}>
              <article className="glass-card el-form-card">
                <div className="el-panel-head">
                  <div>
                    <span className="el-mini-label">Question editor</span>
                    <h2>{viewMode === "form" ? "Record focused question data" : "Spreadsheet Entry"}</h2>
                  </div>
                  <div className="el-actions">
                    <button type="button" className={`btn btn-sm ${viewMode === "form" ? "btn-primary" : "btn-glass"}`} onClick={() => setViewMode("form")}>Form</button>
                    <button type="button" className={`btn btn-sm ${viewMode === "grid" ? "btn-primary" : "btn-glass"}`} onClick={() => setViewMode("grid")}>Spreadsheet</button>
                    {viewMode === "form" && (
                      <button
                        type="button"
                        className="el-icon-btn"
                        title="Next unfilled row"
                        onClick={() => {
                          const next = snapshot?.questions.find((q) => !q.questionSummary && q.outcome === "UNMARKED") || snapshot?.questions[0];
                          setQuestionDraft(toDraftQuestion(next));
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {viewMode === "form" ? (
                  <div className="el-question-form">
                  <div className="el-form-grid two">
                    <input className="el-field" type="number" min={1} value={questionDraft.questionNumber} disabled />
                    <select className="el-field el-select" value={questionDraft.subject} onChange={(event) => updateDraft("subject", event.target.value)}>
                      {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                    </select>
                  </div>
                  <textarea className="el-field el-textarea" value={questionDraft.questionSummary} onChange={(event) => updateDraft("questionSummary", event.target.value)} placeholder="Question summary or identifying clue" />
                  <div className="el-form-grid two">
                    <select className="el-field el-select" value={questionDraft.chapter} onChange={(event) => updateDraft("chapter", event.target.value)}>
                      <option value="">Select Chapter</option>
                      {getMergedChapters(questionDraft.subject).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className="el-field" list={`topics-form`} value={questionDraft.topic} onChange={(event) => updateDraft("topic", event.target.value)} onBlur={(event) => void commitQuestionTopic(event.target.value)} placeholder="Topic or custom entry" />
                    <datalist id="topics-form">
                      {getMergedTopics(questionDraft.subject, questionDraft.chapter || "").map(t => <option key={t} value={t} />)}
                    </datalist>
                  </div>
                  <div className="el-form-grid three">
                    <select className="el-field el-select" value={questionDraft.attemptStatus} onChange={(event) => updateDraft("attemptStatus", event.target.value)}>
                      {ATTEMPT_STATUS.map((item) => <option key={item} value={item}>{cleanLabel(item)}</option>)}
                    </select>
                    <select className="el-field el-select" value={questionDraft.outcome} onChange={(event) => updateDraft("outcome", event.target.value)}>
                      {OUTCOMES.map((item) => <option key={item} value={item}>{cleanLabel(item)}</option>)}
                    </select>
                    <select className="el-field el-select" value={questionDraft.difficulty} onChange={(event) => updateDraft("difficulty", event.target.value)}>
                      {DIFFICULTIES.map((item) => <option key={item} value={item}>{cleanLabel(item)}</option>)}
                    </select>
                  </div>
                  <div className="el-form-grid two">
                    <textarea className="el-field el-textarea" value={questionDraft.correctAnswer} onChange={(event) => updateDraft("correctAnswer", event.target.value)} placeholder="Correct answer" />
                    <textarea className="el-field el-textarea" value={questionDraft.whyCorrect} onChange={(event) => updateDraft("whyCorrect", event.target.value)} placeholder="Why this answer is correct" />
                  </div>
                  <textarea className="el-field el-textarea" value={questionDraft.whereLacked} onChange={(event) => updateDraft("whereLacked", event.target.value)} placeholder="Where I lacked: concept, formula, panic, reading, time, revision..." />
                  <div className="el-form-grid three">
                    <select className="el-field el-select" value={questionDraft.contentStatus} onChange={(event) => updateDraft("contentStatus", event.target.value)}>
                      {CONTENT_STATUS.map((item) => <option key={item} value={item}>{cleanLabel(item)}</option>)}
                    </select>
                    <input className="el-field" type="number" min={1} max={100} value={questionDraft.confidence} onChange={(event) => updateDraft("confidence", event.target.value)} placeholder="Confidence /100" />
                    <input className="el-field" type="number" min={0} value={questionDraft.timeSpentSeconds} onChange={(event) => updateDraft("timeSpentSeconds", event.target.value)} placeholder="Time seconds" />
                  </div>
                  <div className="el-reason-wrap">
                    {REASONS.map((reason) => (
                      <button
                        type="button"
                        key={reason}
                        className={`el-reason ${questionDraft.reasonTags.includes(reason) ? "on" : ""}`}
                        onClick={() => toggleReason(reason)}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <textarea className="el-field el-textarea" value={questionDraft.actionFix} onChange={(event) => updateDraft("actionFix", event.target.value)} placeholder="Correction action or memory hook for next test" />
                  <textarea className="el-field el-textarea" value={questionDraft.notes} onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Extra notes" />
                  <button type="button" className="btn btn-primary btn-sm" onClick={saveQuestion} disabled={savingQuestion || !snapshot}>
                    {savingQuestion ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save Question
                  </button>
                </div>
                ) : (
                  <div className="el-grid-mode">
                     <div className="el-grid-scroll">
                       <table className="el-table el-table-edit">
                         <thead>
                           <tr>
                             <th>Q</th>
                             <th>Summary</th>
                             <th>Subject</th>
                             <th>Chapter</th>
                             <th>Topic</th>
                             <th>Attempt</th>
                             <th>Outcome</th>
                             <th>Difficulty</th>
                             <th>Content</th>
                             <th>Reasons</th>
                             <th>Time (s)</th>
                             <th>Conf</th>
                           </tr>
                         </thead>
                         <tbody>
                           {gridQuestions.map((q, i) => (
                             <tr key={q.id}>
                               <td>{q.questionNumber}</td>
                               <td><input className="el-field input-sm summary-col" value={q.questionSummary} onChange={e => { const copy = [...gridQuestions]; copy[i].questionSummary = e.target.value; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])} placeholder="Summary" /></td>
                               <td>
                                 <select className="el-field el-select input-sm" value={q.subject} onChange={e => { const copy = [...gridQuestions]; copy[i].subject = e.target.value; copy[i].chapter = ""; copy[i].topic = ""; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])}>
                                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                                 </select>
                               </td>
                               <td>
                                 <select className="el-field el-select input-sm" value={q.chapter} onChange={e => { const copy = [...gridQuestions]; copy[i].chapter = e.target.value; copy[i].topic = ""; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])}>
                                   <option value="">Select Chapter</option>
                                   {getMergedChapters(q.subject).map(c => <option key={c} value={c}>{c}</option>)}
                                 </select>
                               </td>
                               <td>
                                 <input className="el-field input-sm" list={`topics-grid-${i}`} value={q.topic} onChange={e => { const copy = [...gridQuestions]; copy[i].topic = e.target.value; setGridQuestions(copy); }} onBlur={() => void commitGridTopic(i, gridQuestions[i])} placeholder="Topic" />
                                 <datalist id={`topics-grid-${i}`}>
                                   {getMergedTopics(q.subject, q.chapter || "").map(t => <option key={t} value={t} />)}
                                 </datalist>
                               </td>
                               <td>
                                 <select className="el-field el-select input-sm" value={q.attemptStatus} onChange={e => { const copy = [...gridQuestions]; copy[i].attemptStatus = e.target.value; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])}>
                                    {ATTEMPT_STATUS.map((o) => <option key={o} value={o}>{cleanLabel(o)}</option>)}
                                 </select>
                               </td>
                               <td>
                                 <select className="el-field el-select input-sm" value={q.outcome} onChange={e => { const copy = [...gridQuestions]; copy[i].outcome = e.target.value; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])}>
                                    {OUTCOMES.map((o) => <option key={o} value={o}>{cleanLabel(o)}</option>)}
                                 </select>
                               </td>
                               <td>
                                 <select className="el-field el-select input-sm" value={q.difficulty} onChange={e => { const copy = [...gridQuestions]; copy[i].difficulty = e.target.value; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])}>
                                    {DIFFICULTIES.map((o) => <option key={o} value={o}>{cleanLabel(o)}</option>)}
                                 </select>
                               </td>
                               <td>
                                 <select className="el-field el-select input-sm" value={q.contentStatus} onChange={e => { const copy = [...gridQuestions]; copy[i].contentStatus = e.target.value; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])}>
                                    {CONTENT_STATUS.map((o) => <option key={o} value={o}>{cleanLabel(o)}</option>)}
                                 </select>
                               </td>
                               <td><input className="el-field input-sm reason-col" value={Array.isArray(q.reasonTags) ? q.reasonTags.join(', ') : q.reasonTags} onChange={e => { const copy = [...gridQuestions]; copy[i].reasonTags = e.target.value.split(',').map(s=>s.trim()).filter(Boolean); setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])} placeholder="Reasons (csv)" /></td>
                               <td><input className="el-field input-sm" type="number" min={0} value={q.timeSpentSeconds} onChange={e => { const copy = [...gridQuestions]; copy[i].timeSpentSeconds = e.target.value; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])} placeholder="s" style={{width: '60px'}} /></td>
                               <td><input className="el-field input-sm" type="number" min={1} max={100} value={q.confidence} onChange={e => { const copy = [...gridQuestions]; copy[i].confidence = e.target.value; setGridQuestions(copy); }} onBlur={() => saveGridRow(gridQuestions[i])} placeholder="/100" style={{width: '60px'}} /></td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                     <button type="button" className="btn btn-primary btn-sm" onClick={saveBatch} disabled={savingBatch}>
                       {savingBatch ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save All Changes
                     </button>
                  </div>
                )}
              </article>

              <article className="glass-card el-ai-card">
                <div className="el-panel-head">
                  <div>
                    <span className="el-mini-label">On-demand AI</span>
                    <h2>Pattern reports</h2>
                  </div>
                  <BrainCircuit size={20} />
                </div>
                <div className="el-ai-actions">
                  <button className="btn btn-primary btn-sm" onClick={generateTestAnalysis} disabled={testAiLoading || !snapshot}>
                    {testAiLoading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Analyze This Test
                  </button>
                  <button className="btn btn-glass btn-sm" onClick={generateGlobalAnalysis} disabled={globalAiLoading || logs.length === 0}>
                    {globalAiLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Analyze All Tests
                  </button>
                </div>

                <div className="el-cause-chart">
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie data={reasonChartData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3} animationDuration={1200}>
                        {reasonChartData.map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#0b0b10", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="el-report-stack">
                  {latestAnalysis(snapshot) ? (
                    <article className="el-report">
                      <div className="el-report-meta">
                        <span>{latestAnalysis(snapshot)?.model ?? "AI report"}</span>
                        <strong>{format(new Date(latestAnalysis(snapshot)!.createdAt), "d MMM yyyy, h:mm a")}</strong>
                      </div>
                      <MarkdownPanel content={latestAnalysis(snapshot)!.response} />
                    </article>
                  ) : <div className="el-empty-small">No analysis generated for this test yet.</div>}

                  {globalAnalysis ? (
                    <article className="el-report global">
                      <div className="el-report-meta">
                        <span>All-test analysis</span>
                        <strong>{format(new Date(globalAnalysis.createdAt), "d MMM yyyy, h:mm a")}</strong>
                      </div>
                      <MarkdownPanel content={globalAnalysis.response} />
                    </article>
                  ) : <div className="el-empty-small">No all-test analysis generated yet.</div>}
                </div>
              </article>
            </section>

            <article className="glass-card el-table-card">
              <div className="el-panel-head">
                <div>
                  <span className="el-mini-label">Excel-style ledger</span>
                  <h2>Saved question rows</h2>
                </div>
                <div className="el-actions">
                  {snapshot ? (
                    <button type="button" className="btn btn-danger btn-sm" onClick={deleteSelected}><Trash2 size={14} /> Delete Test</button>
                  ) : null}
                  <span className="el-pill"><FileSpreadsheet size={13} /> {snapshot?.questions.length ?? 0} rows</span>
                </div>
              </div>
              <div className="el-table-wrap">
                <table className="el-table">
                  <thead>
                    <tr>
                      <th>Q</th>
                      <th>Question</th>
                      <th>Subject</th>
                      <th>Chapter</th>
                      <th>Topic</th>
                      <th>Outcome</th>
                      <th>Content</th>
                      <th>Reasons</th>
                      <th>Severity</th>
                      <th>Fix</th>
                      <th>Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot?.questions.length ? snapshot.questions.map((question) => {
                      const severity = selectedSeverity.get(question.questionNumber);
                      return (
                        <tr key={question.id} onClick={() => setQuestionDraft(toDraftQuestion(question))}>
                          <td>{question.questionNumber}</td>
                          <td>{question.questionSummary || "-"}</td>
                          <td>{question.subject}</td>
                          <td>{question.chapter || "-"}</td>
                          <td>{question.topic || "-"}</td>
                          <td><span className={`el-status ${question.outcome.toLowerCase()}`}>{cleanLabel(question.outcome)}</span></td>
                          <td>{cleanLabel(question.contentStatus)}</td>
                          <td>{(question.reasonTags || []).join(", ") || "-"}</td>
                          <td>{severity ? <span className={`severity ${severity.severity.toLowerCase()}`}>{severity.severity} {severity.score}</span> : "-"}</td>
                          <td>{question.actionFix || "-"}</td>
                          <td><button type="button" className="el-icon-btn" title="Edit row"><Pencil size={13} /></button></td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={11} className="el-empty-small">Create or select a test to begin logging.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </section>
      </main>

      <style jsx>{`
        .error-log-page { min-height: 100vh; position: relative; color: #fff; overflow: hidden; }
        .el-bg { position: fixed; inset: 0; z-index: 0; background: radial-gradient(circle at 12% 12%, rgba(212,168,83,.12), transparent 30%), radial-gradient(circle at 86% 20%, rgba(79,156,249,.10), transparent 30%), linear-gradient(155deg, #07070b 0%, #0b0d18 45%, #060608 100%); }
        .el-bg::after { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px); background-size: 34px 34px; opacity: .5; mask-image: radial-gradient(ellipse at top, black 20%, transparent 82%); }
        .el-shell { position: relative; z-index: 1; max-width: 1720px; margin: 0 auto; padding: 34px 24px 96px; }
        .el-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(270px, .34fr); gap: 20px; align-items: end; padding: 28px; border-radius: 30px; margin-bottom: 18px; background: linear-gradient(145deg, rgba(255,255,255,.085), rgba(255,255,255,.032)); }
        .el-back, .el-eyebrow, .el-mini-label, .el-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.46); }
        .el-back { margin-bottom: 14px; text-decoration: none; transition: color .16s; }
        .el-back:hover { color: var(--gold); }
        .el-eyebrow, .el-pill { width: fit-content; padding: 8px 12px; border-radius: 999px; color: var(--gold-bright); background: rgba(212,168,83,.08); border: 1px solid rgba(212,168,83,.18); }
        .el-title { max-width: 12ch; margin: 14px 0 12px; font-size: clamp(38px, 5.2vw, 72px); line-height: .94; letter-spacing: 0; }
        .el-copy { max-width: 760px; margin: 0; color: rgba(255,255,255,.58); line-height: 1.8; }
        .el-hero-meter { min-height: 170px; display: grid; place-items: center; align-content: center; gap: 8px; border-radius: 24px; background: radial-gradient(circle at 50% 32%, rgba(212,168,83,.18), transparent 42%), rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
        .el-hero-meter span, .el-hero-meter em { color: rgba(255,255,255,.48); font-size: 11px; font-style: normal; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; text-align: center; }
        .el-hero-meter strong { color: var(--gold-bright); font-size: clamp(42px, 5vw, 70px); line-height: 1; font-weight: 900; }
        .el-alert { margin-bottom: 18px; padding: 14px 16px; border-radius: 18px; border: 1px solid rgba(255,90,90,.24); background: rgba(255,90,90,.09); color: #ffc9c9; }
        .el-workbench { display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 18px; align-items: start; }
        .el-history, .el-memory, .el-chart-card, .el-form-card, .el-ai-card, .el-table-card { padding: 22px; border-radius: 28px; background: linear-gradient(145deg, rgba(255,255,255,.08), rgba(255,255,255,.032)), rgba(12,12,18,.74); }
        .el-history { position: sticky; top: 24px; max-height: calc(100vh - 48px); overflow: auto; }
        .el-main { min-width: 0; display: grid; gap: 18px; }
        .el-panel-head, .el-actions { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
        h2, h3 { margin: 0; color: rgba(255,255,255,.95); }
        h2 { font-size: 18px; }
        h3 { font-size: 14px; margin-bottom: 10px; }
        .el-create, .el-history-list, .el-question-form, .el-report-stack, .el-pattern-list { display: grid; gap: 10px; }
        .el-create { margin: 18px 0; }
        .el-create-grid { display: grid; grid-template-columns: minmax(0, 1fr) 92px; gap: 10px; }
        .el-field { width: 100%; border: 1px solid rgba(255,255,255,.09); border-radius: 14px; background: rgba(255,255,255,.045); color: rgba(255,255,255,.92); padding: 11px 13px; font: inherit; outline: none; min-width: 0; }
        .el-field::placeholder { color: rgba(255,255,255,.34); }
        .el-field:focus { border-color: rgba(212,168,83,.58); box-shadow: 0 0 0 3px rgba(212,168,83,.10); }
        .el-select { color: rgba(255,255,255,.94); background-color: rgba(18,18,26,.96); }
        .el-select option { color: #f5eee6; background: #14141f; }
        .el-textarea { min-height: 86px; resize: vertical; line-height: 1.55; }
        .el-history-card { display: grid; gap: 6px; padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.035); color: inherit; text-align: left; cursor: pointer; transition: transform .18s ease, border-color .18s ease, background .18s ease; }
        .el-history-card:hover, .el-history-card.active { transform: translateY(-2px); border-color: rgba(212,168,83,.28); background: rgba(212,168,83,.075); }
        .el-history-card span, .el-history-card em { color: rgba(255,255,255,.48); font-size: 11px; font-style: normal; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
        .el-skeleton { height: 86px; }
        .el-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
        .el-metric { min-height: 122px; display: grid; align-content: space-between; gap: 8px; padding: 18px; border-radius: 22px; }
        .el-metric span, .el-metric em { color: rgba(255,255,255,.46); font-size: 11px; font-style: normal; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .el-metric strong { font-size: clamp(26px, 3vw, 42px); line-height: 1; }
        .el-metric.gold svg, .el-metric.gold strong { color: var(--gold); }
        .el-metric.red svg, .el-metric.red strong { color: var(--danger); }
        .el-metric.blue svg, .el-metric.blue strong { color: var(--physics); }
        .el-metric.violet svg, .el-metric.violet strong { color: var(--lotus-bright); }
        .el-metric.saffron svg, .el-metric.saffron strong { color: var(--saffron); }
        .el-delta-grid, .el-pattern-grid, .el-charts, .el-editor-grid { display: grid; gap: 14px; }
        .el-delta-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 18px 0; }
        .el-delta, .el-pattern { padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.035); }
        .el-delta { display: grid; gap: 7px; }
        .el-delta span, .el-delta em, .el-pattern span, .el-pattern em { color: rgba(255,255,255,.48); font-size: 11px; font-style: normal; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .el-delta strong { font-size: 28px; line-height: 1; }
        .el-delta strong.good { color: var(--success); }
        .el-delta strong.bad { color: var(--danger); }
        .el-pattern-grid, .el-charts, .el-editor-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .el-pattern { display: grid; gap: 9px; }
        .el-pattern.active-loop { border-color: rgba(255,90,90,.18); }
        .el-pattern.recovered { border-color: rgba(34,197,94,.18); }
        .el-pattern > div { display: flex; justify-content: space-between; gap: 12px; }
        .el-pattern p, .el-muted { margin: 0; color: rgba(255,255,255,.62); font-size: 13px; line-height: 1.65; }
        .severity { display: inline-flex; width: max-content; padding: 5px 9px; border-radius: 999px; border: 1px solid rgba(255,255,255,.08); font-size: 10px; font-style: normal; font-weight: 950; letter-spacing: .06em; }
        .severity.low { color: var(--success); background: rgba(34,197,94,.10); }
        .severity.medium { color: var(--gold-bright); background: rgba(212,168,83,.10); }
        .severity.high { color: var(--saffron); background: rgba(249,115,22,.12); }
        .severity.critical { color: var(--danger); background: rgba(239,68,68,.12); }
        .el-chart-card { min-height: 360px; }
        .el-form-grid { display: grid; gap: 10px; }
        .el-form-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .el-form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .el-reason-wrap, .el-ai-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .el-reason { padding: 7px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.04); color: rgba(255,255,255,.58); font-size: 11px; font-weight: 800; cursor: pointer; transition: all .15s; }
        .el-reason.on { color: var(--gold-bright); border-color: rgba(212,168,83,.32); background: rgba(212,168,83,.12); }
        .el-ai-card { display: grid; gap: 16px; align-content: start; }
        .el-cause-chart { border-radius: 22px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.025); }
        .el-report { max-height: 480px; overflow: auto; padding: 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.032); }
        .el-report.global { border-color: rgba(79,156,249,.18); }
        .el-report-meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; color: rgba(255,255,255,.46); font-size: 11px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .el-report-meta strong { color: var(--gold-bright); font-size: 11px; text-align: right; }
        .el-table-wrap { width: 100%; max-height: 680px; overflow: auto; margin-top: 18px; border-radius: 22px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.025); }
        .el-table { width: 100%; min-width: 1280px; border-collapse: collapse; }
        .el-table th, .el-table td { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.065); text-align: left; vertical-align: top; }
        .el-table th { position: sticky; top: 0; z-index: 1; color: var(--gold-bright); background: rgba(10,12,18,.96); font-size: 11px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; }
        .el-table td { color: rgba(255,255,255,.68); font-size: 12.5px; line-height: 1.5; }
        .el-table tbody tr { cursor: pointer; transition: background .15s; }
        .el-table tbody tr:hover { background: rgba(255,255,255,.045); }
        .el-status { display: inline-flex; padding: 5px 9px; border-radius: 999px; border: 1px solid rgba(255,255,255,.08); font-size: 11px; font-weight: 900; }
        .el-status.correct { color: var(--success); background: rgba(34,197,94,.10); }
        .el-status.wrong { color: var(--danger); background: rgba(239,68,68,.10); }
        .el-status.unmarked { color: var(--gold-bright); background: rgba(212,168,83,.10); }
        .el-icon-btn { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 12px; border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.04); color: rgba(255,255,255,.68); cursor: pointer; }
        .el-icon-btn:hover { color: var(--gold-bright); border-color: rgba(212,168,83,.28); }
        .el-empty-small { padding: 18px; color: rgba(255,255,255,.52); text-align: center; }
        .el-markdown { color: rgba(245,238,230,.9); line-height: 1.72; font-size: 13px; }
        .el-markdown :global(table) { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12.5px; }
        .el-markdown :global(th), .el-markdown :global(td) { border: 1px solid rgba(255,255,255,.1); padding: 9px 10px; vertical-align: top; }
        .el-markdown :global(th) { background: rgba(212,168,83,.1); color: var(--gold-bright); }
        .el-markdown :global(p) { color: rgba(245,238,230,.86); margin: 0 0 12px; }
        .el-markdown :global(ul), .el-markdown :global(ol) { padding-left: 20px; margin: 10px 0; }
        .el-grid-mode { display: grid; gap: 14px; margin-top: 14px; }
        .el-editor-grid.full { grid-template-columns: 1fr; }
        .el-grid-scroll { width: 100%; max-height: 500px; overflow: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,.08); }
        .el-table-edit { min-width: 1400px; }
        .el-table-edit td, .el-table-edit th { padding: 8px; }
        .input-sm { padding: 6px 8px; font-size: 12px; min-height: 32px; border-radius: 8px; }
        .summary-col { min-width: 250px; }
        .reason-col { min-width: 150px; }
        .spin { animation: spin-slow 1s linear infinite; }
        @media (max-width: 1240px) { .el-workbench, .el-hero, .el-pattern-grid, .el-charts, .el-editor-grid { grid-template-columns: 1fr; } .el-history { position: static; max-height: none; } .el-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 760px) { .el-shell { padding: 22px 14px 86px; } .el-metrics, .el-delta-grid, .el-form-grid.two, .el-form-grid.three { grid-template-columns: 1fr; } .el-hero, .el-history, .el-memory, .el-chart-card, .el-form-card, .el-ai-card, .el-table-card { border-radius: 22px; } }
      `}</style>
    </div>
  );
}
