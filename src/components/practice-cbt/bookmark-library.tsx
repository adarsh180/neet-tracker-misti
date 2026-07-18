"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkMinus, BookMarked, ChevronLeft, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

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

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{text}</ReactMarkdown>;
}

export default function BookmarkLibrary({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<BookmarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <div><h1><BookMarked size={22} /> Bookmarked questions</h1><p>Automatically organised by subject, class and chapter.</p></div>
        <strong>{rows.length}</strong>
      </header>
      {error && <p className="cbt-error">{error}</p>}
      {loading ? <div className="cbt-empty"><Loader2 className="cbt-spin" size={24} /> Loading bookmarks...</div> : rows.length === 0 ? (
        <div className="cbt-empty"><BookMarked size={28} /><span>No questions bookmarked yet. Bookmark them after submitting a test.</span></div>
      ) : (
        <div className="bookmark-tree">
          {[...grouped.entries()].map(([subject, classes]) => (
            <details key={subject} open>
              <summary><span>{subject}</span><em>{[...classes.values()].reduce((total, chapters) => total + [...chapters.values()].reduce((sum, list) => sum + list.length, 0), 0)}</em></summary>
              <div className="bookmark-class-list">
                {[...classes.entries()].map(([classLabel, chapters]) => (
                  <details key={classLabel} open>
                    <summary><span>{classLabel}</span><em>{[...chapters.values()].reduce((sum, list) => sum + list.length, 0)}</em></summary>
                    <div className="bookmark-chapter-list">
                      {[...chapters.entries()].map(([chapter, questions]) => (
                        <details key={chapter}>
                          <summary><span>{chapter}</span><em>{questions.length}</em></summary>
                          <div className="bookmark-cards">
                            {questions.map((row) => (
                              <article key={row.id} className="bookmark-card">
                                <div className="bookmark-meta"><span>{row.topic || "General"}</span><span>{new Date(row.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span><button type="button" disabled={removing === row.id} onClick={() => void remove(row.id)}>{removing === row.id ? <Loader2 className="cbt-spin" size={14} /> : <BookmarkMinus size={14} />} Remove</button></div>
                                <Markdown text={row.question.question} />
                                <div className="bookmark-options">
                                  {row.question.options.map((option, index) => <div key={index} className={index === row.question.correctIndex ? "correct" : ""}><b>{String.fromCharCode(65 + index)}</b><div><Markdown text={option} />{row.question.optionExplanations?.[index] && <small><Markdown text={row.question.optionExplanations[index]} /></small>}</div></div>)}
                                </div>
                                <div className="bookmark-explanation"><strong>Solution</strong><Markdown text={row.question.explanation} /></div>
                              </article>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      <style jsx>{`
        .bookmark-library { display: grid; gap: 16px; }
        .bookmark-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px; border: 1px solid var(--glass-border); border-radius: 16px; background: var(--glass-bg); }
        .bookmark-head h1 { display: flex; align-items: center; gap: 9px; margin: 0 0 4px; font-size: 22px; }
        .bookmark-head p { margin: 0; color: var(--text-secondary); }
        .bookmark-head > strong { font-size: 28px; }
        .bookmark-tree, .bookmark-class-list, .bookmark-chapter-list, .bookmark-cards { display: grid; gap: 10px; }
        .bookmark-class-list, .bookmark-chapter-list, .bookmark-cards { padding: 10px 0 0 14px; }
        details { border-left: 2px solid var(--glass-border-mid); padding-left: 12px; }
        summary { cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; background: var(--glass-bg); font-weight: 700; }
        summary em { font-style: normal; color: var(--text-secondary); font-size: 12px; }
        .bookmark-card { padding: 16px; border: 1px solid var(--glass-border); border-radius: 14px; background: var(--glass-bg); }
        .bookmark-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--text-secondary); font-size: 12px; }
        .bookmark-meta button { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--glass-border); border-radius: 8px; padding: 6px 9px; background: transparent; color: inherit; cursor: pointer; }
        .bookmark-options { display: grid; gap: 8px; margin: 12px 0; }
        .bookmark-options > div { display: grid; grid-template-columns: 28px 1fr; gap: 8px; padding: 10px; border: 1px solid var(--glass-border); border-radius: 10px; }
        .bookmark-options > div.correct { border-color: var(--success); background: color-mix(in srgb, var(--success) 8%, transparent); }
        .bookmark-options :global(p), .bookmark-explanation :global(p) { margin: 0; }
        .bookmark-options small { display: block; margin-top: 5px; color: var(--text-secondary); }
        .bookmark-explanation { padding: 12px; border-radius: 10px; background: var(--glass-bg-strong); }
        @media (max-width: 640px) { .bookmark-class-list, .bookmark-chapter-list, .bookmark-cards { padding-left: 6px; } }
      `}</style>
    </div>
  );
}
