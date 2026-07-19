"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookmarkCheck,
  BookmarkMinus,
  BookMarked,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Folder,
  FolderOpen,
  GraduationCap,
  Layers3,
  Library,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeQuestionMarkdown } from "@/lib/question-markdown";

type BookmarkQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  optionExplanations?: string[];
  source?: string;
  sourceRef?: string;
};

type BookmarkRow = {
  id: string;
  subject: string;
  classLevel: string | null;
  chapter: string;
  topic: string | null;
  question: BookmarkQuestion;
  createdAt: string;
};

type FolderRow = {
  key: string;
  subject: string;
  classLabel: string;
  chapter: string;
  questions: BookmarkRow[];
};

const SUBJECT_ORDER = ["Physics", "Chemistry", "Botany", "Zoology"];

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeQuestionMarkdown(text)}</ReactMarkdown>;
}

function folderKey(subject: string, classLabel: string, chapter: string) {
  return `${subject}::${classLabel}::${chapter}`;
}

function bookmarkDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export default function BookmarkLibrary({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<BookmarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolderKey, setSelectedFolderKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/practice/bookmarks", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load bookmarks");
      setRows(json.bookmarks ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load bookmarks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const subjects = new Map<string, Map<string, Map<string, BookmarkRow[]>>>();
    for (const row of rows) {
      const classLabel = row.classLevel ? `Class ${row.classLevel}` : "Class not assigned";
      const classes = subjects.get(row.subject) ?? new Map<string, Map<string, BookmarkRow[]>>();
      const chapters = classes.get(classLabel) ?? new Map<string, BookmarkRow[]>();
      const chapterRows = chapters.get(row.chapter) ?? [];
      chapterRows.push(row);
      chapters.set(row.chapter, chapterRows);
      classes.set(classLabel, chapters);
      subjects.set(row.subject, classes);
    }
    return subjects;
  }, [rows]);

  const folders = useMemo(() => {
    const output: FolderRow[] = [];
    for (const [subject, classes] of grouped) {
      for (const [classLabel, chapters] of classes) {
        for (const [chapter, questions] of chapters) {
          output.push({ key: folderKey(subject, classLabel, chapter), subject, classLabel, chapter, questions });
        }
      }
    }
    return output.sort((left, right) => {
      const subjectDelta = SUBJECT_ORDER.indexOf(left.subject) - SUBJECT_ORDER.indexOf(right.subject);
      return subjectDelta || left.classLabel.localeCompare(right.classLabel, undefined, { numeric: true }) || left.chapter.localeCompare(right.chapter, undefined, { numeric: true });
    });
  }, [grouped]);

  useEffect(() => {
    if (!folders.length) {
      setSelectedFolderKey(null);
      return;
    }
    if (!selectedFolderKey || !folders.some((folder) => folder.key === selectedFolderKey)) setSelectedFolderKey(folders[0].key);
  }, [folders, selectedFolderKey]);

  const selectedFolder = folders.find((folder) => folder.key === selectedFolderKey) ?? null;

  const remove = async (id: string) => {
    setRemoving(id);
    setError(null);
    try {
      const response = await fetch(`/api/practice/bookmarks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not remove bookmark");
      setRows((current) => current.filter((row) => row.id !== id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove bookmark");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="bookmark-library">
      <button className="cbt-back" onClick={onBack}><ChevronLeft size={15} /> Practice Arena</button>
      <header className="bookmark-head">
        <div className="bookmark-head-icon"><BookMarked size={22} /></div>
        <div className="bookmark-head-copy"><h1>Bookmarked questions</h1><p>A clean revision library organised like folders on your computer.</p></div>
        <div className="bookmark-total"><strong>{rows.length}</strong><span>saved</span></div>
      </header>
      {error && <p className="cbt-error">{error}</p>}
      {loading ? <div className="cbt-empty"><Loader2 className="cbt-spin" size={24} /> Loading bookmarks...</div> : rows.length === 0 ? (
        <div className="cbt-empty"><BookMarked size={28} /><span>No questions bookmarked yet. Bookmark them after submitting a test.</span></div>
      ) : (
        <div className="bookmark-workspace">
          <aside className="bookmark-sidebar" aria-label="Bookmark folders">
            <div className="bookmark-sidebar-title"><Library size={17} /><span>My revision library</span></div>
            <div className="bookmark-tree">
              {[...grouped.entries()]
                .sort(([left], [right]) => SUBJECT_ORDER.indexOf(left) - SUBJECT_ORDER.indexOf(right))
                .map(([subject, classes]) => {
                  const subjectCount = [...classes.values()].reduce((total, chapters) => total + [...chapters.values()].reduce((sum, list) => sum + list.length, 0), 0);
                  return (
                    <details key={subject} open>
                      <summary><span><Layers3 size={16} />{subject}</span><em>{subjectCount}</em></summary>
                      <div className="bookmark-class-list">
                        {[...classes.entries()].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })).map(([classLabel, chapters]) => (
                          <details key={classLabel} open>
                            <summary><span><GraduationCap size={15} />{classLabel}</span><em>{[...chapters.values()].reduce((sum, list) => sum + list.length, 0)}</em></summary>
                            <div className="bookmark-chapter-list">
                              {[...chapters.entries()].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })).map(([chapter, questions]) => {
                                const key = folderKey(subject, classLabel, chapter);
                                const active = key === selectedFolderKey;
                                return (
                                  <button type="button" key={chapter} className={active ? "active" : ""} onClick={() => setSelectedFolderKey(key)}>
                                    {active ? <FolderOpen size={17} /> : <Folder size={17} />}
                                    <span>{chapter}</span><em>{questions.length}</em>
                                  </button>
                                );
                              })}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  );
                })}
            </div>
          </aside>

          <section className="bookmark-content">
            {selectedFolder && (
              <>
                <header className="bookmark-folder-head">
                  <div className="bookmark-breadcrumb"><span>{selectedFolder.subject}</span><i>/</i><span>{selectedFolder.classLabel}</span></div>
                  <div><FolderOpen size={22} /><h2>{selectedFolder.chapter}</h2><span>{selectedFolder.questions.length} saved {selectedFolder.questions.length === 1 ? "question" : "questions"}</span></div>
                </header>
                <div className="bookmark-cards">
                  {selectedFolder.questions.map((row, questionIndex) => (
                    <article key={row.id} className="bookmark-card">
                      <header className="bookmark-card-head">
                        <div className="bookmark-number"><BookmarkCheck size={15} />Question {questionIndex + 1}</div>
                        <div className="bookmark-card-meta"><span>{row.topic || "General"}</span><span><CalendarDays size={13} />{bookmarkDate(row.createdAt)}</span></div>
                        <button className="bookmark-remove" type="button" disabled={removing === row.id} onClick={() => void remove(row.id)}>
                          {removing === row.id ? <Loader2 className="cbt-spin" size={14} /> : <BookmarkMinus size={14} />} Remove
                        </button>
                      </header>
                      <div className="bookmark-question"><Markdown text={row.question.question} /></div>
                      <div className="bookmark-options">
                        {row.question.options.map((option, index) => {
                          const correct = index === row.question.correctIndex;
                          return (
                            <div key={index} className={correct ? "correct" : ""}>
                              <b>{String.fromCharCode(65 + index)}</b>
                              <div className="bookmark-option-copy"><Markdown text={option} />{row.question.optionExplanations?.[index] && <small><Markdown text={row.question.optionExplanations[index]} /></small>}</div>
                              {correct && <span className="bookmark-correct"><CheckCircle2 size={14} />Correct</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="bookmark-explanation"><strong>Complete solution</strong><Markdown text={row.question.explanation} /></div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      <style jsx>{`
        .bookmark-library { display: grid; gap: 16px; color: var(--text-primary); }
        .bookmark-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; padding: 18px 20px; border: 1px solid var(--glass-border); border-radius: 16px; background: var(--bg-surface); }
        .bookmark-head-icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: var(--gold); background: var(--gold-dim); border: 1px solid var(--gold-glow); }
        .bookmark-head-copy h1 { margin: 0 0 3px; font-family: var(--font-display), 'Playfair Display', serif; font-size: 23px; font-weight: 600; }
        .bookmark-head-copy p { margin: 0; color: var(--text-secondary); font-size: 12.5px; }
        .bookmark-total { min-width: 58px; text-align: center; padding-left: 16px; border-left: 1px solid var(--glass-border); }
        .bookmark-total strong, .bookmark-total span { display: block; }
        .bookmark-total strong { color: var(--gold); font-size: 24px; font-variant-numeric: tabular-nums; }
        .bookmark-total span { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
        .bookmark-workspace { min-height: 560px; display: grid; grid-template-columns: 294px minmax(0, 1fr); overflow: hidden; border: 1px solid var(--glass-border); border-radius: 16px; background: var(--bg-surface); }
        .bookmark-sidebar { padding: 12px; border-right: 1px solid var(--glass-border); background: color-mix(in srgb, var(--bg-elevated) 72%, transparent); }
        .bookmark-sidebar-title { display: flex; align-items: center; gap: 8px; padding: 9px 10px 13px; color: var(--text-secondary); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; }
        .bookmark-tree, .bookmark-class-list, .bookmark-chapter-list { display: grid; gap: 3px; }
        .bookmark-class-list { padding: 3px 0 3px 12px; }
        .bookmark-chapter-list { padding: 3px 0 6px 14px; }
        details { min-width: 0; }
        summary { list-style: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 34px; padding: 6px 8px; border-radius: 9px; color: var(--text-secondary); font-size: 12px; font-weight: 700; }
        summary::-webkit-details-marker { display: none; }
        summary:hover { color: var(--text-primary); background: var(--glass-bg); }
        summary span { min-width: 0; display: flex; align-items: center; gap: 7px; }
        summary em, .bookmark-chapter-list button em { flex-shrink: 0; font-style: normal; color: var(--text-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
        .bookmark-chapter-list button { width: 100%; min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 38px; padding: 7px 9px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; font-size: 11.5px; transition: var(--t-fast); }
        .bookmark-chapter-list button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bookmark-chapter-list button svg { color: var(--gold); fill: color-mix(in srgb, var(--gold) 20%, transparent); }
        .bookmark-chapter-list button:hover { color: var(--text-primary); background: var(--glass-bg); }
        .bookmark-chapter-list button.active { color: var(--gold); border-color: var(--gold-glow); background: var(--gold-dim); }
        .bookmark-content { min-width: 0; padding: 20px; }
        .bookmark-folder-head { margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--glass-border); }
        .bookmark-breadcrumb { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; color: var(--text-muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; }
        .bookmark-breadcrumb i { font-style: normal; opacity: .55; }
        .bookmark-folder-head > div:last-child { display: flex; align-items: center; gap: 9px; }
        .bookmark-folder-head svg { flex-shrink: 0; color: var(--gold); fill: color-mix(in srgb, var(--gold) 20%, transparent); }
        .bookmark-folder-head h2 { min-width: 0; margin: 0; font-size: 18px; font-weight: 650; overflow-wrap: anywhere; }
        .bookmark-folder-head > div:last-child > span { margin-left: auto; color: var(--text-muted); font-size: 11px; white-space: nowrap; }
        .bookmark-cards { display: grid; gap: 14px; }
        .bookmark-card { min-width: 0; padding: 18px; border: 1px solid var(--glass-border); border-radius: 14px; background: var(--bg-elevated); }
        .bookmark-card-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-bottom: 15px; padding-bottom: 12px; border-bottom: 1px solid var(--glass-border); }
        .bookmark-number { display: inline-flex; align-items: center; gap: 6px; color: var(--gold); font-size: 11.5px; font-weight: 700; }
        .bookmark-card-meta { min-width: 0; display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 10.5px; }
        .bookmark-card-meta span { display: inline-flex; align-items: center; gap: 4px; }
        .bookmark-remove { min-height: 32px; display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 11px; transition: var(--t-fast); }
        .bookmark-remove:hover:not(:disabled) { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 28%, transparent); background: color-mix(in srgb, var(--danger) 7%, transparent); }
        .bookmark-remove:disabled { opacity: .5; cursor: not-allowed; }
        .bookmark-question { color: var(--text-primary); font-size: 14px; line-height: 1.7; }
        .bookmark-options { display: grid; gap: 7px; margin: 14px 0; }
        .bookmark-options > div { min-width: 0; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: start; gap: 9px; padding: 11px 12px; border: 1px solid var(--glass-border); border-radius: 11px; background: color-mix(in srgb, var(--bg-surface) 72%, transparent); }
        .bookmark-options > div > b { width: 27px; height: 27px; display: grid; place-items: center; border: 1px solid var(--glass-border-mid); border-radius: 50%; color: var(--text-secondary); font-size: 11px; }
        .bookmark-options > div.correct { border-color: color-mix(in srgb, var(--success) 48%, transparent); background: color-mix(in srgb, var(--success) 7%, var(--bg-surface)); }
        .bookmark-options > div.correct > b { color: var(--bg-base); border-color: var(--success); background: var(--success); }
        .bookmark-option-copy { min-width: 0; color: var(--text-primary); font-size: 12.5px; line-height: 1.55; }
        .bookmark-option-copy small { display: block; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--glass-border-mid); color: var(--text-secondary); font-size: 11.5px; }
        .bookmark-correct { display: inline-flex; align-items: center; gap: 4px; color: var(--success); font-size: 10.5px; font-weight: 700; white-space: nowrap; }
        .bookmark-explanation { padding: 13px 14px; border-left: 2px solid var(--gold); border-radius: 0 10px 10px 0; background: var(--gold-dim); color: var(--text-secondary); font-size: 12.5px; line-height: 1.65; }
        .bookmark-explanation > strong { display: block; margin-bottom: 5px; color: var(--gold); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; }
        .bookmark-question :global(p), .bookmark-options :global(p), .bookmark-explanation :global(p) { margin: 0; overflow-wrap: anywhere; }
        .bookmark-library :global(.katex) { white-space: nowrap; font-size: 1.02em; }
        .bookmark-library :global(.katex-display) { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
        @media (max-width: 820px) {
          .bookmark-workspace { grid-template-columns: 1fr; }
          .bookmark-sidebar { max-height: 330px; overflow: auto; border-right: 0; border-bottom: 1px solid var(--glass-border); }
        }
        @media (max-width: 560px) {
          .bookmark-head { grid-template-columns: auto 1fr; padding: 15px; }
          .bookmark-total { grid-column: 1 / 3; display: flex; align-items: baseline; justify-content: center; gap: 5px; padding: 9px 0 0; border-left: 0; border-top: 1px solid var(--glass-border); }
          .bookmark-total strong, .bookmark-total span { display: inline; }
          .bookmark-content { padding: 13px; }
          .bookmark-folder-head > div:last-child { align-items: flex-start; flex-wrap: wrap; }
          .bookmark-folder-head > div:last-child > span { width: 100%; margin-left: 31px; }
          .bookmark-card { padding: 14px; }
          .bookmark-card-head { grid-template-columns: 1fr auto; }
          .bookmark-card-meta { grid-column: 1 / 3; grid-row: 2; flex-wrap: wrap; }
          .bookmark-options > div { grid-template-columns: 28px minmax(0, 1fr); }
          .bookmark-correct { grid-column: 2; }
        }
      `}</style>
    </div>
  );
}
