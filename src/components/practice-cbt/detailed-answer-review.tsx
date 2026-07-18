"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, CheckCircle2, FileDown, Loader2, Save, XCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type MistakeTag = "GUESS_WORK" | "ELIMINATION_WORK" | "NOT_STUDIED" | "SILLY_MISTAKE" | "CUSTOM";

export type DetailedReviewQuestion = {
  id: string;
  subject: string;
  chapter: string;
  source: string;
  sourceRef: string;
  question: string;
  options: string[];
  verified: boolean;
  correctIndex: number | null;
  explanation: string | null;
  optionExplanations?: string[] | null;
  visualAssetUrl?: string | null;
  visualAssetAlt?: string | null;
};

export type DetailedQuestionReview = {
  questionId: string;
  questionNumber: number;
  outcome: "CORRECT" | "WRONG" | "SKIPPED";
  mistakeTag: MistakeTag | null;
  customMistakeText: string | null;
  reviewComplete: boolean;
};

const TAGS: Array<{ value: MistakeTag; label: string }> = [
  { value: "GUESS_WORK", label: "Guess Work" },
  { value: "ELIMINATION_WORK", label: "Elimination Work" },
  { value: "NOT_STUDIED", label: "Not Studied" },
  { value: "SILLY_MISTAKE", label: "Silly Mistake" },
  { value: "CUSTOM", label: "Custom" },
];

function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{text}</ReactMarkdown>;
}

export default function DetailedAnswerReview({ testId, questions, answers, initialReviews }: {
  testId: string;
  questions: DetailedReviewQuestion[];
  answers: Map<string, number | null>;
  initialReviews: DetailedQuestionReview[];
}) {
  const [filter, setFilter] = useState<"all" | "wrong" | "skipped">("all");
  const [reviews, setReviews] = useState(initialReviews);
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>(() => Object.fromEntries(initialReviews.map((review) => [review.questionId, review.customMistakeText ?? ""])));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bookmarkingId, setBookmarkingId] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const reviewMap = useMemo(() => new Map(reviews.map((review) => [review.questionId, review])), [reviews]);
  const numberMap = useMemo(() => new Map(questions.map((question, index) => [question.id, index + 1])), [questions]);
  const pending = reviews.filter((review) => review.outcome !== "CORRECT" && !review.reviewComplete).length;

  useEffect(() => {
    let active = true;
    void fetch(`/api/practice/bookmarks?testId=${encodeURIComponent(testId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, json: await response.json() }))
      .then(({ response, json }) => {
        if (active && response.ok) setBookmarkedIds(new Set(json.bookmarkedQuestionIds ?? []));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [testId]);

  const toggleBookmark = async (questionId: string) => {
    const bookmarked = bookmarkedIds.has(questionId);
    setBookmarkingId(questionId);
    setSaveError(null);
    try {
      const response = await fetch(bookmarked
        ? `/api/practice/bookmarks?testId=${encodeURIComponent(testId)}&questionId=${encodeURIComponent(questionId)}`
        : "/api/practice/bookmarks", {
        method: bookmarked ? "DELETE" : "POST",
        headers: bookmarked ? undefined : { "content-type": "application/json" },
        body: bookmarked ? undefined : JSON.stringify({ testId, questionId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not update bookmark");
      setBookmarkedIds((current) => {
        const next = new Set(current);
        if (bookmarked) next.delete(questionId); else next.add(questionId);
        return next;
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not update bookmark");
    } finally {
      setBookmarkingId(null);
    }
  };

  const saveReview = async (questionId: string, mistakeTag: MistakeTag | null) => {
    setSavingId(questionId);
    setSaveError(null);
    try {
      const response = await fetch(`/api/practice/${testId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "review", questionId, mistakeTag, customMistakeText: mistakeTag === "CUSTOM" ? customDrafts[questionId] ?? "" : null }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not save reflection");
      setReviews(json.reviews ?? []);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save reflection");
    } finally {
      setSavingId(null);
    }
  };

  const visible = questions.filter((question) => {
    const chosen = answers.get(question.id);
    if (filter === "wrong") return chosen !== null && chosen !== undefined && chosen !== question.correctIndex;
    if (filter === "skipped") return chosen === null || chosen === undefined;
    return true;
  });

  return (
    <section className="review-shell">
      <div className="review-headline">
        <div><strong>Question-by-question review</strong><span>{pending ? `${pending} reflection${pending === 1 ? "" : "s"} pending` : "Reflection complete"}</span></div>
        <a className="review-pdf" href={`/api/practice/${testId}/report.pdf`}><FileDown size={15} /> Download performance PDF</a>
      </div>
      <div className="review-tabs">
        {(["all", "wrong", "skipped"] as const).map((entry) => <button type="button" key={entry} className={filter === entry ? "on" : ""} onClick={() => setFilter(entry)}>{entry}</button>)}
      </div>
      {saveError && <p className="review-save-error">{saveError}</p>}
      <div className="review-list">
        {visible.map((question) => {
          const chosen = answers.get(question.id);
          const review = reviewMap.get(question.id);
          const questionNumber = numberMap.get(question.id) ?? 0;
          return (
            <article className="review-card" key={question.id}>
              <div className="review-meta"><span>Q{questionNumber}</span><span>{question.subject}</span><span>{question.chapter}</span><span>{question.source} - {question.sourceRef}</span>{question.verified && <span>Strict verified</span>}<button type="button" className={`bookmark-toggle ${bookmarkedIds.has(question.id) ? "on" : ""}`} disabled={bookmarkingId === question.id} onClick={() => void toggleBookmark(question.id)}>{bookmarkingId === question.id ? <Loader2 size={14} className="spin" /> : bookmarkedIds.has(question.id) ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}{bookmarkedIds.has(question.id) ? " Bookmarked" : " Bookmark"}</button></div>
              <Markdown text={question.question} />
              {question.visualAssetUrl && <img className="review-visual" src={question.visualAssetUrl} alt={question.visualAssetAlt ?? "Question visual"} />}
              <div className="review-options">
                {question.options.map((option, optionIndex) => {
                  const isKey = optionIndex === question.correctIndex;
                  const isChosen = optionIndex === chosen;
                  return <div key={optionIndex} className={`review-option ${isKey ? "key" : ""} ${isChosen && !isKey ? "wrong" : ""}`}><b>{String.fromCharCode(65 + optionIndex)}</b><div className="review-option-copy"><Markdown text={option} />{question.optionExplanations?.[optionIndex] && <div className="option-rationale"><Markdown text={question.optionExplanations[optionIndex]} /></div>}</div>{isKey && <CheckCircle2 size={15} />}{isChosen && !isKey && <XCircle size={15} />}</div>;
                })}
              </div>
              {question.explanation && <div className="review-explanation"><strong>Complete explanation</strong><Markdown text={question.explanation} /></div>}
              <div className="mistake-reflection">
                <div className="mistake-title"><strong>{review?.outcome === "CORRECT" ? "How did this go right? (optional)" : "What went wrong?"}</strong>{review?.reviewComplete && <span><CheckCircle2 size={13} /> Saved</span>}</div>
                <div className="mistake-buttons">{TAGS.map((tag) => <button type="button" key={tag.value} className={review?.mistakeTag === tag.value ? "on" : ""} disabled={savingId === question.id} onClick={() => tag.value === "CUSTOM" ? setReviews((current) => current.map((entry) => entry.questionId === question.id ? { ...entry, mistakeTag: "CUSTOM" } : entry)) : void saveReview(question.id, review?.mistakeTag === tag.value ? null : tag.value)}>{tag.label}</button>)}</div>
                {review?.mistakeTag === "CUSTOM" && <div className="custom-mistake-row"><textarea value={customDrafts[question.id] ?? ""} onChange={(event) => setCustomDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Describe the exact error you made..." maxLength={1200} /><button type="button" disabled={savingId === question.id || !(customDrafts[question.id] ?? "").trim()} onClick={() => void saveReview(question.id, "CUSTOM")}>{savingId === question.id ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Save custom</button></div>}
              </div>
            </article>
          );
        })}
      </div>
      <style jsx>{`
        .bookmark-toggle { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--glass-border-mid); border-radius: 8px; padding: 5px 8px; background: transparent; color: inherit; cursor: pointer; }
        .bookmark-toggle.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
      `}</style>
    </section>
  );
}
