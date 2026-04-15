"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckSquare,
  Square,
  RefreshCw,
  Plus,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Trophy,
  Target,
  ArrowLeft,
  Search,
  Filter,
  Pencil,
  Sparkles,
  Brain,
  BarChart3,
  Activity,
  Layers3,
  GripVertical,
  Wand2,
  GraduationCap,
  TrendingUp,
  Clock3,
  ScrollText,
} from "lucide-react";

interface Revision {
  id: string;
  revisedAt: string;
  note: string | null;
}

interface Topic {
  id: string;
  name: string;
  chapter: string | null;
  chapterOrder: number;
  classLevel: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  questionsSolved: number;
  revisions: Revision[];
}

interface Subject {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  color: string;
  topics: Topic[];
}

const SUBJECT_META: Record<string, { gradient: string; dimBg: string; glow: string; varColor: string }> = {
  botany: {
    gradient: "linear-gradient(135deg, hsl(142,65%,48%), hsl(160,60%,36%))",
    dimBg: "hsla(142,65%,48%,0.07)",
    glow: "hsla(142,65%,48%,0.22)",
    varColor: "var(--botany)",
  },
  zoology: {
    gradient: "linear-gradient(135deg, hsl(38,88%,52%), hsl(28,80%,45%))",
    dimBg: "hsla(38,88%,52%,0.07)",
    glow: "hsla(38,88%,52%,0.22)",
    varColor: "var(--zoology)",
  },
  physics: {
    gradient: "linear-gradient(135deg, hsl(218,84%,62%), hsl(240,72%,52%))",
    dimBg: "hsla(218,84%,62%,0.07)",
    glow: "hsla(218,84%,62%,0.22)",
    varColor: "var(--physics)",
  },
  chemistry: {
    gradient: "linear-gradient(135deg, hsl(270,68%,60%), hsl(285,56%,48%))",
    dimBg: "hsla(270,68%,60%,0.07)",
    glow: "hsla(270,68%,60%,0.22)",
    varColor: "var(--chemistry)",
  },
};

function getEmoji(pct: number) {
  if (pct >= 90) return "🏆";
  if (pct >= 70) return "🔥";
  if (pct >= 50) return "⭐";
  if (pct >= 30) return "📈";
  return "🌱";
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function buildTrendBars(values: number[]) {
  const max = Math.max(...values, 1);
  return values.map((v) => clamp((v / max) * 100, 6, 100));
}

function prettyDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

type ChapterEntry = {
  chapter: string;
  chapterOrder: number;
  topics: Topic[];
  done: number;
  percent: number;
  qs: number;
  revs: number;
};

const EMPTY_TOPICS: Topic[] = [];

function getChapterLabel(chapter: string | null) {
  return chapter?.trim() || "General Topics";
}

function toStoredChapterValue(chapter: string) {
  return chapter === "General Topics" ? null : chapter;
}

function buildChapterEntries(
  topics: Topic[],
  filters?: { searchQuery: string; filterMode: "all" | "pending" | "done" }
) {
  const grouped = new Map<string, Topic[]>();
  const chapterOrderMap = new Map<string, number>();
  const searchQuery = filters?.searchQuery.trim().toLowerCase() ?? "";
  const filterMode = filters?.filterMode ?? "all";

  for (const topic of topics) {
    const chapter = getChapterLabel(topic.chapter);
    const matchesSearch =
      !searchQuery ||
      topic.name.toLowerCase().includes(searchQuery) ||
      chapter.toLowerCase().includes(searchQuery);
    const matchesFilter =
      filterMode === "all" ||
      (filterMode === "done" ? topic.isCompleted : !topic.isCompleted);

    if (!matchesSearch || !matchesFilter) {
      continue;
    }

    const currentTopics = grouped.get(chapter) ?? [];
    currentTopics.push(topic);
    grouped.set(chapter, currentTopics);

    const currentOrder = chapterOrderMap.get(chapter);
    if (currentOrder === undefined || topic.chapterOrder < currentOrder) {
      chapterOrderMap.set(chapter, topic.chapterOrder);
    }
  }

  return [...grouped.entries()]
    .map(([chapter, chapterTopics]) => {
      const done = chapterTopics.filter((topic) => topic.isCompleted).length;
      const percent = chapterTopics.length
        ? Math.round((done / chapterTopics.length) * 100)
        : 0;

      return {
        chapter,
        chapterOrder: chapterOrderMap.get(chapter) ?? 0,
        topics: chapterTopics,
        done,
        percent,
        qs: chapterTopics.reduce((sum, topic) => sum + topic.questionsSolved, 0),
        revs: chapterTopics.reduce((sum, topic) => sum + topic.revisions.length, 0),
      };
    })
    .sort((a, b) => {
      if (a.chapterOrder !== b.chapterOrder) {
        return a.chapterOrder - b.chapterOrder;
      }
      return a.chapter.localeCompare(b.chapter);
    });
}

function reorderChapterList(order: string[], source: string, target: string) {
  const sourceIndex = order.indexOf(source);
  const targetIndex = order.indexOf(target);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return order;
  }

  const next = [...order];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export default function SubjectPage() {
  const params = useParams<{ subject: string }>();
  const slug = params.subject;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "pending" | "done">("all");
  const [editingQs, setEditingQs] = useState<{ id: string; count: string } | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicChapter, setNewTopicChapter] = useState("");
  const [newTopicClass, setNewTopicClass] = useState("11");
  const [chapterOrderDraft, setChapterOrderDraft] = useState<string[]>([]);
  const [draggedChapter, setDraggedChapter] = useState<string | null>(null);
  const [dragTargetChapter, setDragTargetChapter] = useState<string | null>(null);
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editingChapterName, setEditingChapterName] = useState("");
  const [chapterActionBusy, setChapterActionBusy] = useState<string | null>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);
  const reorderSaveTimeoutRef = useRef<number | null>(null);

  const fetchSubject = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subjects");
      if (res.ok) {
        const all: Subject[] = await res.json();
        const found = all.find((s) => s.slug === slug);
        setSubject(found || null);
        if (found) {
          const chs = [...new Set(found.topics.map((t) => t.chapter || "General Topics"))].slice(0, 3);
          setExpandedChapters(new Set(chs));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchSubject();
  }, [fetchSubject]);

  useEffect(() => {
    return () => {
      if (reorderSaveTimeoutRef.current !== null) {
        window.clearTimeout(reorderSaveTimeoutRef.current);
      }
    };
  }, []);

  const toggleTopic = async (topicId: string) => {
    setToggling((prev) => new Set([...prev, topicId]));
    setSubject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        topics: prev.topics.map((t) =>
          t.id === topicId
            ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date().toISOString() : null }
            : t
        ),
      };
    });

    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_complete", topicId }),
    });

    setToggling((prev) => {
      const next = new Set(prev);
      next.delete(topicId);
      return next;
    });

    fetchSubject();
  };

  const addRevision = async (topicId: string) => {
    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_revision", topicId }),
    });

    setSubject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        topics: prev.topics.map((t) =>
          t.id === topicId
            ? { ...t, revisions: [...t.revisions, { id: Date.now().toString(), revisedAt: new Date().toISOString(), note: null }] }
            : t
        ),
      };
    });
  };

  const deleteTopic = async (topicId: string) => {
    if (!confirm("Delete this topic permanently?")) return;
    setSubject((prev) => {
      if (!prev) return prev;
      return { ...prev, topics: prev.topics.filter((t) => t.id !== topicId) };
    });

    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_topic", topicId }),
    });
  };

  const addTopic = async () => {
    if (!newTopicName.trim() || !subject) return;
    setSaving(true);
    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_topic",
        subjectId: subject.id,
        name: newTopicName.trim(),
        chapter: newTopicChapter.trim() || null,
        classLevel: newTopicClass,
      }),
    });
    setNewTopicName("");
    setNewTopicChapter("");
    setShowAddTopic(false);
    setSaving(false);
    fetchSubject();
  };

  const saveQuestions = async (topicId: string, count: string) => {
    const n = parseInt(count) || 0;
    setSubject((prev) => {
      if (!prev) return prev;
      return { ...prev, topics: prev.topics.map((t) => (t.id === topicId ? { ...t, questionsSolved: n } : t)) };
    });
    setEditingQs(null);

    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_questions", topicId, count: n }),
    });
  };

  const meta = SUBJECT_META[slug] || SUBJECT_META.botany;
  const subjectTopics = subject?.topics ?? EMPTY_TOPICS;
  const completedTopics = subjectTopics.filter((topic) => topic.isCompleted).length;
  const pct = subjectTopics.length > 0 ? Math.round((completedTopics / subjectTopics.length) * 100) : 0;
  const totalQs = subjectTopics.reduce((sum, topic) => sum + topic.questionsSolved, 0);
  const totalRevisions = subjectTopics.reduce((sum, topic) => sum + topic.revisions.length, 0);
  const pendingTopics = subjectTopics.length - completedTopics;

  const allChapterEntries = useMemo(
    () => buildChapterEntries(subjectTopics),
    [subjectTopics]
  );
  const chapterEntries = useMemo(
    () => buildChapterEntries(subjectTopics, { searchQuery, filterMode }),
    [subjectTopics, searchQuery, filterMode]
  );
  const canReorderChapters =
    filterMode === "all" && !searchQuery.trim() && allChapterEntries.length > 1;
  const chapterEntryMap = useMemo(
    () => new Map(chapterEntries.map((entry) => [entry.chapter, entry])),
    [chapterEntries]
  );

  useEffect(() => {
    setChapterOrderDraft(allChapterEntries.map((entry) => entry.chapter));
  }, [allChapterEntries]);

  const orderedChapterEntries = useMemo(() => {
    if (!canReorderChapters) {
      return chapterEntries;
    }

    const ordered = chapterOrderDraft
      .map((chapter) => chapterEntryMap.get(chapter))
      .filter((entry): entry is ChapterEntry => Boolean(entry));
    const missing = chapterEntries.filter(
      (entry) => !chapterOrderDraft.includes(entry.chapter)
    );

    return [...ordered, ...missing];
  }, [canReorderChapters, chapterEntries, chapterEntryMap, chapterOrderDraft]);

  const persistChapterOrder = useCallback(
    async (nextOrder: string[]) => {
      if (!subject) return;

      setSubject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          topics: prev.topics.map((topic) => {
            const chapter = getChapterLabel(topic.chapter);
            const chapterIndex = nextOrder.indexOf(chapter);
            return chapterIndex === -1
              ? topic
              : { ...topic, chapterOrder: chapterIndex };
          }),
        };
      });

      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder_chapters",
          items: nextOrder.map((chapter, chapterOrder) => ({
            subjectId: subject.id,
            chapter,
            chapterOrder,
          })),
        }),
      });

      if (!res.ok) {
        await fetchSubject();
      }
    },
    [fetchSubject, subject]
  );

  const queueChapterOrderSave = useCallback(
    (nextOrder: string[]) => {
      if (reorderSaveTimeoutRef.current !== null) {
        window.clearTimeout(reorderSaveTimeoutRef.current);
      }

      reorderSaveTimeoutRef.current = window.setTimeout(() => {
        void persistChapterOrder(nextOrder);
      }, 180);
    },
    [persistChapterOrder]
  );

  const finalizeChapterReorder = useCallback(
    (nextOrder: string[]) => {
      if (!canReorderChapters) return;
      setDraggedChapter(null);
      setDragTargetChapter(null);
      queueChapterOrderSave(nextOrder);
    },
    [canReorderChapters, queueChapterOrderSave]
  );

  const startChapterRename = useCallback((chapter: string) => {
    setEditingChapter(chapter);
    setEditingChapterName(chapter);
  }, []);

  const cancelChapterRename = useCallback(() => {
    setEditingChapter(null);
    setEditingChapterName("");
  }, []);

  const saveChapterRename = useCallback(
    async (chapter: string) => {
      if (!subject) return;

      const nextChapterName = editingChapterName.trim();
      if (!nextChapterName) return;
      if (nextChapterName === chapter) {
        cancelChapterRename();
        return;
      }

      setChapterActionBusy(chapter);

      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename_chapter",
          subjectId: subject.id,
          chapterName: toStoredChapterValue(chapter),
          nextChapterName,
        }),
      });

      setChapterActionBusy(null);
      cancelChapterRename();

      if (res.ok) {
        setExpandedChapters((prev) => {
          const next = new Set(prev);
          if (next.delete(chapter)) {
            next.add(nextChapterName);
          }
          return next;
        });
        await fetchSubject();
      }
    },
    [cancelChapterRename, editingChapterName, fetchSubject, subject]
  );

  const deleteChapter = useCallback(
    async (chapter: string) => {
      if (!subject) return;
      if (!confirm(`Delete the chapter "${chapter}" and all topics inside it?`)) return;

      setChapterActionBusy(chapter);

      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_chapter",
          subjectId: subject.id,
          chapterName: toStoredChapterValue(chapter),
        }),
      });

      setChapterActionBusy(null);

      if (res.ok) {
        setExpandedChapters((prev) => {
          const next = new Set(prev);
          next.delete(chapter);
          return next;
        });
        if (editingChapter === chapter) {
          cancelChapterRename();
        }
        await fetchSubject();
      }
    },
    [cancelChapterRename, editingChapter, fetchSubject, subject]
  );

  const topMomentum = [...chapterEntries].sort((a, b) => b.percent - a.percent);
  const topQuestions = [...chapterEntries].sort((a, b) => b.qs - a.qs);
  const topRevisions = [...chapterEntries].sort((a, b) => b.revs - a.revs);

  const questionTrend = buildTrendBars(topQuestions.map((chapterEntry) => chapterEntry.qs));
  const revisionTrend = buildTrendBars(topRevisions.map((chapterEntry) => chapterEntry.revs));

  if (loading) {
    return (
      <div className="subject-page animate-fade-in">
        <div className="page-bg">
          <div className="page-orb page-orb-1" />
          <div className="page-orb page-orb-2" />
          <div className="page-grid" />
        </div>
        <div className="content-shell">
          <div className="skeleton hero-skeleton" />
          <div className="skeleton stat-skeleton" />
          <div className="skeleton stat-skeleton" />
          <div className="skeleton stat-skeleton" />
          <div className="skeleton stat-skeleton" />
          <div className="skeleton block-skeleton" />
          <div className="skeleton block-skeleton" />
          <div className="skeleton block-skeleton" />
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="subject-page animate-fade-in">
        <div className="page-bg">
          <div className="page-orb page-orb-1" />
          <div className="page-orb page-orb-2" />
          <div className="page-grid" />
        </div>
        <div className="content-shell">
          <div className="glass-card empty-state">
            <div className="empty-icon">
              <BookOpen size={30} />
            </div>
            <h2>Subject not found</h2>
            <p>Ensure the database is seeded and try again.</p>
            <Link href="/dashboard" className="btn btn-primary btn-sm">
              <ArrowLeft size={14} /> Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="subject-page animate-fade-in">
      <div className="page-bg">
        <div className="page-orb page-orb-1" />
        <div className="page-orb page-orb-2" />
        <div className="page-orb page-orb-3" />
        <div className="page-grid" />
        <div className="page-noise" />
        <div className="page-vignette" />
      </div>

      <main className="content-shell">
        <Link href="/dashboard" className="back-link">
          <ArrowLeft size={14} /> Dashboard
        </Link>

        <section className="hero glass-card premium-card" style={{ borderColor: `color-mix(in srgb, ${meta.varColor} 28%, transparent)`, background: meta.dimBg }}>
          <div className="hero-ambient" style={{ background: `radial-gradient(circle at 80% 40%, ${meta.glow} 0%, transparent 58%)` }} />

          <div className="hero-left">
            <div className="hero-badge">
              <Sparkles size={13} />
              <span>NEET UG 2027</span>
            </div>
            <div className="hero-title-row">
              <div className="hero-icon" style={{ background: meta.gradient, boxShadow: `0 0 32px ${meta.glow}` }}>
                <span className="hero-emoji">{subject.emoji}</span>
              </div>
              <div>
                <h1 className="hero-title">{subject.name}</h1>
                <p className="hero-subtitle">
                  {completedTopics} of {subject.topics.length} topics done · {totalQs.toLocaleString()} questions · {totalRevisions} revisions
                </p>
              </div>
            </div>
          </div>

          <div className="hero-right">
            <div className="hero-score-card">
              <div className="hero-score">{pct}<span>%</span></div>
              <div className="hero-score-emoji">{getEmoji(pct)}</div>
            </div>

            <div className="hero-mini-stats">
              <div className="mini-row">
                <span>Completion</span>
                <strong>{pct}%</strong>
              </div>
              <div className="progress-track hero-progress">
                <div className="progress-fill" style={{ width: `${pct}%`, background: meta.gradient }} />
              </div>
              <div className="mini-meta">
                <span>{completedTopics} done</span>
                <span>{pendingTopics} left</span>
              </div>
            </div>
          </div>
        </section>

        <section className="stats-grid">
          {[
            { label: "Completed", value: completedTopics, unit: "topics", icon: Trophy, color: meta.varColor },
            { label: "Remaining", value: pendingTopics, unit: "topics", icon: Target, color: "var(--text-secondary)" },
            { label: "Questions", value: totalQs, unit: "solved", icon: BookOpen, color: "var(--gold)" },
            { label: "Revisions", value: totalRevisions, unit: "total", icon: RefreshCw, color: "var(--lotus-bright)" },
          ].map((s) => (
            <div key={s.label} className="glass-card stat-card premium-card">
              <div className="stat-top">
                <div className="stat-icon" style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${s.color} 22%, transparent)` }}>
                  <s.icon size={16} style={{ color: s.color }} />
                </div>
                <div className="stat-label">{s.label}</div>
              </div>
              <div className="stat-value">{s.value.toLocaleString()}</div>
              <div className="stat-unit">{s.unit}</div>
            </div>
          ))}
        </section>

        <section className="insights-grid">
          <div className="glass-card insight-card premium-card">
            <div className="section-head">
              <div>
                <h2>Chapter Momentum</h2>
                <p>Progress distribution across chapters</p>
              </div>
              <div className="section-icon">
                <Activity size={16} />
              </div>
            </div>

            <div className="insight-list custom-scroll">
              {topMomentum.map((c) => (
                <div key={c.chapter} className="insight-row group-hover">
                  <span className="insight-label" title={c.chapter}>{c.chapter}</span>
                  <div className="insight-track">
                    <div className="insight-fill" style={{ width: `${clamp(c.percent, 3, 100)}%`, background: meta.gradient }} />
                  </div>
                  <span className="insight-value">{c.percent}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card insight-card premium-card">
            <div className="section-head">
              <div>
                <h2>Study Distribution</h2>
                <p>Questions solved by chapter</p>
              </div>
              <div className="section-icon">
                <BarChart3 size={16} />
              </div>
            </div>

            <div className="insight-list custom-scroll">
              {questionTrend.length === 0 ? (
                <div className="chart-empty">No chapter data yet</div>
              ) : (
                topQuestions.map((c, i) => (
                  <div key={c.chapter} className="insight-row group-hover">
                    <span className="insight-label" title={c.chapter}>{c.chapter}</span>
                    <div className="insight-track">
                      <div className="insight-fill" style={{ width: `${questionTrend[i]}%`, background: meta.gradient }} />
                    </div>
                    <span className="insight-badge badge-gold">{c.qs} Qs</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card insight-card premium-card">
            <div className="section-head">
              <div>
                <h2>Revision Flow</h2>
                <p>Revision density by chapter</p>
              </div>
              <div className="section-icon">
                <Wand2 size={16} />
              </div>
            </div>

            <div className="insight-list custom-scroll">
              {revisionTrend.length === 0 ? (
                <div className="chart-empty">No revision activity yet</div>
              ) : (
                topRevisions.map((c, i) => (
                  <div key={c.chapter} className="insight-row group-hover">
                    <span className="insight-label" title={c.chapter}>{c.chapter}</span>
                    <div className="insight-track">
                      <div className="insight-fill" style={{ width: `${revisionTrend[i]}%`, background: "linear-gradient(135deg, #a78bfa, #fb7185)" }} />
                    </div>
                    <span className="insight-badge badge-lotus">{c.revs} Revs</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card insight-card premium-card">
            <div className="section-head">
              <div>
                <h2>Focus Snapshot</h2>
                <p>Study balance overview</p>
              </div>
              <div className="section-icon">
                <Brain size={16} />
              </div>
            </div>

            <div className="snapshot-grid">
              <div className="snapshot-pill">
                <Clock3 size={14} />
                <span>{subject.topics.filter((t) => t.isCompleted).length} completed topics</span>
              </div>
              <div className="snapshot-pill">
                <Layers3 size={14} />
                <span>{chapterEntries.length} chapters</span>
              </div>
              <div className="snapshot-pill">
                <ScrollText size={14} />
                <span>{totalQs.toLocaleString()} questions logged</span>
              </div>
              <div className="snapshot-pill">
                <TrendingUp size={14} />
                <span>{pct}% syllabus progress</span>
              </div>
            </div>
          </div>
        </section>

        <section className="toolbar glass-card premium-card">
          <div className="input-shell">
            <Search size={14} />
            <input
              type="text"
              className="input input-search"
              placeholder="Search topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-tabs">
            {(["all", "pending", "done"] as const).map((f) => (
              <button
                key={f}
                className={`filter-tab ${filterMode === f ? "active" : ""}`}
                onClick={() => setFilterMode(f)}
                style={{ "--fc": meta.varColor } as React.CSSProperties}
              >
                <Filter size={12} />
                {f === "all" ? "All" : f === "done" ? "Done" : "Pending"}
              </button>
            ))}
          </div>

          <button
            className="btn btn-primary btn-sm add-btn"
            onClick={() => {
              setShowAddTopic(!showAddTopic);
              setTimeout(() => topicInputRef.current?.focus(), 100);
            }}
          >
            <Plus size={14} /> Add Topic
          </button>

          <div className={`reorder-note ${canReorderChapters ? "active" : ""}`}>
            <GripVertical size={13} />
            <span>
              {canReorderChapters
                ? "Drag chapters to rearrange them."
                : "Clear search and show all topics to reorder chapters."}
            </span>
          </div>
        </section>

        {showAddTopic && (
          <section className="glass-card add-topic premium-card animate-scale-in">
            <div className="section-head compact">
              <div>
                <h2>Add New Topic</h2>
                <p>Capture a new concept into this subject map</p>
              </div>
              <div className="section-icon">
                <Plus size={16} />
              </div>
            </div>

            <div className="add-form-grid">
              <div className="field">
                <label>Topic Name *</label>
                <input
                  ref={topicInputRef}
                  type="text"
                  className="input"
                  placeholder="e.g. Photosynthesis"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTopic()}
                />
              </div>

              <div className="field">
                <label>Chapter</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Plant Physiology"
                  value={newTopicChapter}
                  onChange={(e) => setNewTopicChapter(e.target.value)}
                />
              </div>

              <div className="field narrow">
                <label>Class</label>
                <select className="input select" value={newTopicClass} onChange={(e) => setNewTopicClass(e.target.value)}>
                  <option value="11">Class 11</option>
                  <option value="12">Class 12</option>
                </select>
              </div>
            </div>

            <div className="add-actions">
              <button className="btn btn-primary btn-sm" onClick={addTopic} disabled={saving}>
                {saving ? "Saving..." : <><Check size={13} /> Save Topic</>}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddTopic(false)}>
                <X size={13} /> Cancel
              </button>
            </div>
          </section>
        )}

        <section className={`chapter-stack ${canReorderChapters ? "reorderable" : ""}`}>
          {chapterEntries.length === 0 ? (
            <div className="glass-card empty-match premium-card">
              <div className="empty-icon">
                <Search size={24} />
              </div>
              <h3>No topics match your filter</h3>
              <p>Try another keyword or switch back to all topics.</p>
            </div>
          ) : (
            orderedChapterEntries.map(({ chapter, topics, done, percent }) => {
              const isOpen = expandedChapters.has(chapter);
              const isEditingChapter = editingChapter === chapter;
              const chapterBusy = chapterActionBusy === chapter;

              return (
                <motion.article
                  key={chapter}
                  layout
                  draggable={canReorderChapters}
                  className={`glass-card chapter-card premium-card ${isOpen ? "open" : ""} ${canReorderChapters ? "drag-enabled" : ""} ${dragTargetChapter === chapter ? "drop-target" : ""}`}
                  onDragStartCapture={(event: React.DragEvent<HTMLElement>) => {
                    if (!canReorderChapters) return;
                    setDraggedChapter(chapter);
                    setDragTargetChapter(chapter);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", chapter);
                  }}
                  onDragOverCapture={(event: React.DragEvent<HTMLElement>) => {
                    if (!canReorderChapters || !draggedChapter || draggedChapter === chapter) return;
                    event.preventDefault();
                    setDragTargetChapter(chapter);
                    setChapterOrderDraft((current) => reorderChapterList(current, draggedChapter, chapter));
                  }}
                  onDropCapture={(event: React.DragEvent<HTMLElement>) => {
                    if (!canReorderChapters) return;
                    event.preventDefault();
                    finalizeChapterReorder(
                      draggedChapter && chapter !== draggedChapter
                        ? reorderChapterList(chapterOrderDraft, draggedChapter, chapter)
                        : chapterOrderDraft
                    );
                  }}
                  onDragEndCapture={() => finalizeChapterReorder(chapterOrderDraft)}
                  style={{ borderColor: isOpen ? `color-mix(in srgb, ${meta.varColor} 18%, transparent)` : "var(--glass-border)" }}
                  animate={{
                    scale: draggedChapter === chapter ? 1.01 : 1,
                    opacity: draggedChapter === chapter ? 0.92 : 1,
                  }}
                  transition={{ layout: { type: "spring", stiffness: 420, damping: 32, mass: 0.58 } }}
                >
                  <div className="chapter-header">
                    <button
                      className="chapter-toggle"
                      onClick={() => {
                        setExpandedChapters((prev) => {
                          const next = new Set(prev);
                          if (isOpen) next.delete(chapter);
                          else next.add(chapter);
                          return next;
                        });
                      }}
                    >
                      <div className="chapter-left">
                        <div className={`chapter-chevron ${isOpen ? "open" : ""}`}>
                          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                        <div className="chapter-copy">
                          <div className="chapter-name-row">
                            {isEditingChapter ? (
                              <input
                                className="input chapter-name-input"
                                value={editingChapterName}
                                autoFocus
                                onChange={(event) => setEditingChapterName(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    void saveChapterRename(chapter);
                                  }
                                  if (event.key === "Escape") {
                                    cancelChapterRename();
                                  }
                                }}
                              />
                            ) : (
                              <span className="chapter-name">{chapter}</span>
                            )}
                            <span className="badge badge-gold chapter-badge">{done}/{topics.length}</span>
                          </div>
                          <div className="chapter-subline">{done} completed - {topics.length - done} pending</div>
                        </div>
                      </div>
                    </button>

                    <div className="chapter-right">
                      {canReorderChapters && (
                        <div className={`chapter-handle ${dragTargetChapter === chapter ? "active" : ""}`} aria-hidden="true">
                          <GripVertical size={15} />
                        </div>
                      )}
                      <div className="chapter-actions">
                        {isEditingChapter ? (
                          <>
                            <button
                              className="btn btn-glass btn-xs chapter-action-btn"
                              onClick={() => void saveChapterRename(chapter)}
                              disabled={chapterBusy || !editingChapterName.trim()}
                            >
                              <Check size={12} />
                            </button>
                            <button
                              className="btn btn-ghost btn-xs chapter-action-btn"
                              onClick={cancelChapterRename}
                              disabled={chapterBusy}
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-glass btn-xs chapter-action-btn"
                              onClick={() => startChapterRename(chapter)}
                              disabled={chapterBusy}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              className="btn btn-ghost btn-xs chapter-action-btn danger-btn"
                              onClick={() => void deleteChapter(chapter)}
                              disabled={chapterBusy}
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="chapter-percent">{percent}%</div>
                      <div className="progress-track chapter-track">
                        <div className="progress-fill" style={{ width: `${percent}%`, background: meta.gradient }} />
                      </div>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                    <motion.div
                      className="topic-list-wrap"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                    <div className="topic-list">
                      {topics.map((topic, idx) => {
                        const revisionCount = topic.revisions.length;
                        const completedAt = topic.completedAt ? prettyDate(topic.completedAt) : null;

                        return (
                          <div
                            key={topic.id}
                            className={`topic-row ${topic.isCompleted ? "done" : ""} ${toggling.has(topic.id) ? "toggling" : ""}`}
                            style={{
                              "--tc": meta.varColor,
                              borderBottom: idx < topics.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                            } as React.CSSProperties}
                          >
                            <button
                              className="topic-check"
                              onClick={() => toggleTopic(topic.id)}
                              style={{ color: topic.isCompleted ? meta.varColor : "var(--text-muted)" }}
                              disabled={toggling.has(topic.id)}
                            >
                              {topic.isCompleted ? (
                                <CheckSquare size={19} style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${meta.varColor} 60%, transparent))` }} />
                              ) : (
                                <Square size={19} />
                              )}
                            </button>

                            <div className="topic-body">
                              <div className="topic-topline">
                                <span
                                  className="topic-name"
                                  style={{
                                    textDecoration: topic.isCompleted ? "line-through" : "none",
                                    opacity: topic.isCompleted ? 0.55 : 1,
                                  }}
                                >
                                  {topic.name}
                                </span>
                                <div className="topic-mini-stats">
                                  <span className="mini-chip">
                                    <BookOpen size={11} /> {topic.questionsSolved}
                                  </span>
                                  <span className="mini-chip">
                                    <RefreshCw size={11} /> {revisionCount}
                                  </span>
                                  {completedAt && (
                                    <span className="mini-chip">
                                      <GraduationCap size={11} /> {completedAt}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="topic-tags">
                                {topic.classLevel && <span className="badge badge-lotus">Class {topic.classLevel}</span>}
                                {revisionCount > 0 && <span className="badge badge-gold">Rev {revisionCount}</span>}
                                {topic.isCompleted && revisionCount === 0 && <span className="badge badge-warning">Needs Revision</span>}
                              </div>
                            </div>

                            <div className="topic-actions">
                              {editingQs?.id === topic.id ? (
                                <div className="question-editor">
                                  <input
                                    type="number"
                                    className="input q-input"
                                    value={editingQs.count}
                                    autoFocus
                                    onChange={(e) => setEditingQs({ id: topic.id, count: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveQuestions(topic.id, editingQs.count);
                                      if (e.key === "Escape") setEditingQs(null);
                                    }}
                                  />
                                  <button className="btn btn-glass btn-xs" onClick={() => saveQuestions(topic.id, editingQs.count)}>
                                    <Check size={12} />
                                  </button>
                                  <button className="btn btn-ghost btn-xs" onClick={() => setEditingQs(null)}>
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button className="topic-qs-btn" onClick={() => setEditingQs({ id: topic.id, count: String(topic.questionsSolved) })}>
                                  <BookOpen size={11} />
                                  <span>{topic.questionsSolved}</span>
                                  <span className="qs-muted">Qs</span>
                                </button>
                              )}

                              <button className="btn btn-glass btn-xs action-btn" onClick={() => addRevision(topic.id)}>
                                <RefreshCw size={11} /> Revise
                              </button>

                              <button className="btn btn-ghost btn-xs danger-btn" onClick={() => deleteTopic(topic.id)}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              );
            })
          )}
        </section>
      </main>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(html) {
          scroll-behavior: smooth;
        }

        :global(body) {
          background: #050507;
        }

        .subject-page {
          --rose-light: #fb7185;
          --gold: #fbbf24;
          --lotus-bright: #c084fc;
          --botany: #34d399;
          --chemistry: #a78bfa;
          --physics: #3b82f6;
          --zoology: #f59e0b;

          min-height: 100vh;
          position: relative;
          color: #f4f4f5;
          overflow: hidden;
          background:
            radial-gradient(circle at top, rgba(251, 191, 36, 0.08), transparent 28%),
            linear-gradient(180deg, #08080b 0%, #050507 100%);
          font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
        }

        .page-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }

        .page-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.45;
          animation: floatOrb 12s ease-in-out infinite;
        }

        .page-orb-1 {
          width: 430px;
          height: 430px;
          left: -120px;
          top: -80px;
          background: rgba(212, 168, 83, 0.12);
        }

        .page-orb-2 {
          width: 380px;
          height: 380px;
          right: -100px;
          top: 18%;
          background: rgba(91, 156, 245, 0.1);
          animation-delay: -3s;
        }

        .page-orb-3 {
          width: 480px;
          height: 480px;
          left: 35%;
          bottom: -180px;
          background: rgba(232, 114, 138, 0.08);
          animation-delay: -5s;
        }

        .page-grid {
          position: absolute;
          inset: 0;
          opacity: 0.18;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: radial-gradient(ellipse at top, rgba(0, 0, 0, 1) 0%, transparent 82%);
          -webkit-mask-image: radial-gradient(ellipse at top, rgba(0, 0, 0, 1) 0%, transparent 82%);
        }

        .page-noise {
          position: absolute;
          inset: 0;
          opacity: 0.03;
          background-image: radial-gradient(circle at 20% 20%, white 1px, transparent 1px);
          background-size: 24px 24px;
          mix-blend-mode: screen;
        }

        .page-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 35%, #050507 100%);
        }

        .content-shell {
          position: relative;
          z-index: 1;
          max-width: 1440px;
          margin: 0 auto;
          padding: 40px 32px 120px;
        }

        .glass-card {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 28px;
          box-shadow:
            0 24px 80px rgba(0, 0, 0, 0.28),
            inset 0 1px 1px rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(24px) saturate(170%);
          -webkit-backdrop-filter: blur(24px) saturate(170%);
          overflow: hidden;
        }

        .premium-card {
          position: relative;
        }

        .premium-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, rgba(255,255,255,0.06), transparent 30%, transparent 70%, rgba(255,255,255,0.04));
          opacity: 0.28;
          pointer-events: none;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.72);
          font-size: 13px;
          font-weight: 700;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          margin-bottom: 18px;
          transition: transform 0.25s ease, background 0.25s ease, color 0.25s ease, border-color 0.25s ease;
        }

        .back-link:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.06);
          color: #ffffff;
          border-color: rgba(255,255,255,0.14);
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 34px 36px;
          position: relative;
          margin-bottom: 22px;
        }

        .hero-ambient {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .hero-left {
          display: flex;
          flex-direction: column;
          gap: 18px;
          position: relative;
          z-index: 1;
          flex: 1;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 800;
          color: var(--gold);
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.18);
        }

        .hero-title-row {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .hero-icon {
          width: 74px;
          height: 74px;
          border-radius: 22px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,0.14);
        }

        .hero-emoji {
          font-size: 32px;
        }

        .hero-title {
          margin: 0;
          font-size: clamp(30px, 4vw, 42px);
          line-height: 1.05;
          letter-spacing: -0.05em;
          color: #ffffff;
          font-weight: 900;
        }

        .hero-subtitle {
          margin: 10px 0 0;
          color: rgba(255,255,255,0.62);
          line-height: 1.7;
          font-size: 14px;
        }

        .hero-right {
          display: grid;
          grid-template-columns: auto minmax(260px, 1fr);
          gap: 20px;
          align-items: center;
          position: relative;
          z-index: 1;
          flex-shrink: 0;
        }

        .hero-score-card {
          width: 134px;
          height: 134px;
          border-radius: 28px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.05);
        }

        .hero-score {
          font-size: 42px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.06em;
          color: #fff;
        }

        .hero-score span {
          font-size: 18px;
          opacity: 0.55;
          margin-left: 2px;
        }

        .hero-score-emoji {
          font-size: 26px;
          margin-top: 6px;
        }

        .hero-mini-stats {
          padding: 18px 18px 16px;
          border-radius: 22px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          min-width: 290px;
        }

        .mini-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
          color: rgba(255,255,255,0.72);
        }

        .mini-row strong {
          font-size: 18px;
          color: #fff;
        }

        .hero-progress {
          height: 12px;
          margin-bottom: 10px;
        }

        .mini-meta {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: rgba(255,255,255,0.52);
          font-size: 12px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 22px;
        }

        .stat-card {
          padding: 22px 20px;
        }

        .stat-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }

        .stat-label {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.62);
        }

        .stat-value {
          font-size: 30px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.05em;
          color: #fff;
        }

        .stat-unit {
          font-size: 12px;
          color: rgba(255,255,255,0.42);
          margin-top: 8px;
        }

        .insights-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 22px;
        }

        .insight-card {
          padding: 22px 22px 20px;
          min-height: 220px;
          display: flex;
          flex-direction: column;
        }

        .insight-card:last-child {
          grid-column: 1 / -1;
        }

        .section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .section-head h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.03em;
        }

        .section-head p {
          margin: 6px 0 0;
          font-size: 13px;
          color: rgba(255,255,255,0.54);
          line-height: 1.6;
        }

        .section-icon {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.82);
          flex-shrink: 0;
        }

        .insight-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 220px;
          padding-right: 8px;
        }

        .insight-row {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
          transition: opacity 0.2s ease;
        }

        .insight-list:hover .insight-row:not(:hover) {
          opacity: 0.5;
        }

        .insight-label {
          width: 140px;
          font-size: 13px;
          font-weight: 500;
          color: rgba(255,255,255,0.85);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .insight-track {
          flex: 1;
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }

        .insight-fill {
          height: 100%;
          border-radius: inherit;
        }

        .insight-value {
          width: 44px;
          text-align: right;
          font-size: 13px;
          font-weight: 800;
          color: rgba(255,255,255,0.9);
          flex-shrink: 0;
        }

        .insight-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 24px;
          min-width: 60px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          flex-shrink: 0;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .badge-gold {
          color: var(--gold);
          border-color: rgba(251, 191, 36, 0.25);
          background: rgba(251, 191, 36, 0.08);
        }

        .badge-lotus {
          color: var(--lotus-bright);
          border-color: rgba(192, 132, 252, 0.25);
          background: rgba(192, 132, 252, 0.08);
        }

        .custom-scroll {
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.12) transparent;
        }

        .custom-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12);
          border-radius: 999px;
        }
        
        .custom-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.25);
        }

        .chart-empty {
          padding: 24px;
          border-radius: 18px;
          text-align: center;
          color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.03);
          border: 1px dashed rgba(255,255,255,0.08);
        }

        .snapshot-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .snapshot-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.7);
          font-size: 13px;
          line-height: 1.5;
        }

        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 16px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        .reorder-note {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.55);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        .reorder-note.active {
          color: rgba(255,255,255,0.82);
          border-color: rgba(251,191,36,0.2);
          background: rgba(251,191,36,0.08);
        }

        .input-shell {
          position: relative;
          flex: 1;
          max-width: 360px;
          min-width: 220px;
        }

        .input-shell svg {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255,255,255,0.42);
          pointer-events: none;
        }

        .input-search {
          padding-left: 40px;
          width: 100%;
        }

        .filter-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .filter-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.64);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
        }

        .filter-tab:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.06);
          color: #fff;
        }

        .filter-tab.active {
          background: color-mix(in srgb, var(--fc) 15%, transparent);
          color: var(--fc);
          border-color: color-mix(in srgb, var(--fc) 26%, transparent);
          box-shadow: 0 0 18px color-mix(in srgb, var(--fc) 16%, transparent);
        }

        .add-btn {
          flex-shrink: 0;
        }

        .add-topic {
          padding: 22px 22px 20px;
          margin-bottom: 16px;
        }

        .compact {
          margin-bottom: 16px;
        }

        .add-form-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr 110px;
          gap: 12px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field label {
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.48);
          font-weight: 800;
        }

        .field.narrow {
          min-width: 0;
        }

        .add-actions {
          display: flex;
          gap: 8px;
          margin-top: 14px;
          flex-wrap: wrap;
        }

        .chapter-stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chapter-stack.reorderable {
          position: relative;
        }

        .chapter-card {
          overflow: hidden;
          will-change: transform;
        }

        .chapter-card.drag-enabled {
          cursor: grab;
        }

        .chapter-card.drag-enabled:active {
          cursor: grabbing;
        }

        .chapter-card.drop-target {
          border-color: color-mix(in srgb, var(--gold) 26%, transparent) !important;
          box-shadow: 0 0 0 1px rgba(251,191,36,0.14), 0 20px 44px rgba(0,0,0,0.24);
        }

        .chapter-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 18px 20px;
          transition: background 0.2s ease;
        }

        .chapter-header:hover {
          background: rgba(255,255,255,0.02);
        }

        .chapter-toggle {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 18px;
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
          text-align: left;
          padding: 0;
        }

        .chapter-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          flex: 1;
        }

        .chapter-chevron {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.56);
          flex-shrink: 0;
        }

        .chapter-chevron.open {
          color: var(--gold);
        }

        .chapter-copy {
          min-width: 0;
          flex: 1;
        }

        .chapter-name-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .chapter-name {
          font-size: 15px;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: #fff;
        }

        .chapter-name-input {
          max-width: 360px;
          min-height: 40px;
          font-weight: 700;
        }

        .chapter-badge {
          flex-shrink: 0;
        }

        .chapter-subline {
          margin-top: 6px;
          font-size: 12px;
          color: rgba(255,255,255,0.52);
        }

        .chapter-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
          min-width: 180px;
        }

        .chapter-handle {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.5);
          transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
        }

        .chapter-card.drag-enabled:hover .chapter-handle,
        .chapter-handle.active {
          transform: translateY(-1px);
          color: var(--gold);
          border-color: rgba(251,191,36,0.22);
          background: rgba(251,191,36,0.08);
        }

        .chapter-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .chapter-action-btn {
          min-width: 32px;
          padding-inline: 10px;
        }

        .chapter-percent {
          font-size: 17px;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: #fff;
          min-width: 48px;
          text-align: right;
        }

        .chapter-track {
          width: 120px;
          height: 6px;
        }

        .topic-list {
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .topic-list-wrap {
          overflow: hidden;
        }

        .topic-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 18px 13px 16px;
          transition: background 0.18s ease, transform 0.18s ease;
        }

        .topic-row:hover {
          background: rgba(255,255,255,0.025);
        }

        .topic-row.done {
          background: rgba(74, 222, 128, 0.012);
        }

        .topic-row.toggling {
          opacity: 0.6;
        }

        .topic-check {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }

        .topic-check:hover:not(:disabled) {
          transform: scale(1.08);
        }

        .topic-check:disabled {
          opacity: 0.5;
          cursor: wait;
        }

        .topic-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .topic-topline {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          min-width: 0;
        }

        .topic-name {
          font-size: 14px;
          line-height: 1.5;
          font-weight: 650;
          color: #fff;
          min-width: 0;
        }

        .topic-mini-stats {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .mini-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.72);
          font-size: 11px;
          font-weight: 700;
        }

        .topic-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .topic-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .question-editor {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .q-input {
          width: 72px;
          padding: 7px 10px;
        }

        .topic-qs-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.82);
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
        }

        .topic-qs-btn:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.12);
        }

        .qs-muted {
          opacity: 0.5;
          font-size: 10px;
        }

        .action-btn {
          gap: 5px;
        }

        .danger-btn {
          color: var(--danger);
          opacity: 0.72;
        }

        .danger-btn:hover {
          opacity: 1;
        }

        .empty-state,
        .empty-match {
          padding: 60px 24px;
          text-align: center;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          border-radius: 22px;
          display: grid;
          place-items: center;
          margin: 0 auto 16px;
          color: var(--gold);
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.18);
        }

        .empty-state h2,
        .empty-match h3 {
          margin: 0;
          font-size: 22px;
          font-weight: 900;
          color: #fff;
          letter-spacing: -0.03em;
        }

        .empty-state p,
        .empty-match p {
          margin: 10px 0 20px;
          color: rgba(255,255,255,0.58);
          line-height: 1.7;
          font-size: 14px;
        }

        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.07), rgba(255,255,255,0.04));
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 24px;
        }

        .hero-skeleton {
          height: 180px;
          margin-bottom: 22px;
        }

        .stat-skeleton {
          height: 120px;
          border-radius: 24px;
          margin-bottom: 16px;
        }

        .block-skeleton {
          height: 80px;
          border-radius: 24px;
          margin-bottom: 10px;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        @keyframes floatOrb {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -16px, 0) scale(1.04); }
        }

        @media (max-width: 1180px) {
          .hero {
            flex-direction: column;
            align-items: stretch;
          }

          .hero-right {
            grid-template-columns: 1fr;
            justify-items: stretch;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .insights-grid {
            grid-template-columns: 1fr;
          }

          .insight-card:last-child {
            grid-column: auto;
          }
        }

        @media (max-width: 900px) {
          .content-shell {
            padding: 28px 18px 92px;
          }

          .hero,
          .add-topic {
            padding: 22px;
          }

          .add-form-grid {
            grid-template-columns: 1fr;
          }

          .toolbar {
            align-items: stretch;
          }

          .input-shell {
            max-width: none;
          }

          .chapter-right {
            min-width: 150px;
          }

          .bar-row {
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .bar-value {
            text-align: left;
          }
        }

        @media (max-width: 720px) {
          .hero-title-row {
            align-items: flex-start;
          }

          .hero-icon {
            width: 62px;
            height: 62px;
          }

          .hero-score-card {
            width: 118px;
            height: 118px;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .snapshot-grid {
            grid-template-columns: 1fr;
          }

          .chapter-header,
          .topic-row,
          .chapter-left,
          .topic-topline {
            flex-direction: column;
            align-items: flex-start;
          }

          .chapter-right,
          .topic-actions {
            width: 100%;
          }

          .chapter-right {
            min-width: 0;
          }

          .chapter-track {
            width: 100%;
          }

          .topic-topline {
            width: 100%;
          }

          .topic-mini-stats {
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
