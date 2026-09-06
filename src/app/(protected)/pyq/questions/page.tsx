"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import SmoothLink from "@/components/layout/smooth-link";
import styles from "./questions.module.css";

type Facet = { examYear: number | null; subject: string; classLevel: string | null; chapter: string; count: number };
type Pyq = {
  id: string; subject: string; classLevel: string | null; chapter: string; topic: string | null;
  difficulty: string; examYear: number | null; sourceRef: string; question: string; options: string[];
  correctIndex: number; explanation: string; optionExplanations?: unknown; visualAssetUrl?: string | null;
};
type Payload = { questions: Pyq[]; facets: Facet[]; total: number; pageSize: number };
const empty: Payload = { questions: [], facets: [], total: 0, pageSize: 20 };

function MathText({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{children}</ReactMarkdown>;
}

function QuestionCard({ question, number }: { question: Pyq; number: number }) {
  const [answer, setAnswer] = useState<number | null>(null);
  const [diagramFailed, setDiagramFailed] = useState(false);
  const usable = Array.isArray(question.options) && question.options.length === 4
    && question.options.every(option => typeof option === "string" && option.trim())
    && Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < 4;
  const answered = answer !== null;
  const correct = answer === question.correctIndex;
  const practiceParams = new URLSearchParams({ subject: question.subject.toLowerCase(), chapter: question.chapter, source: "pyq" });
  if (question.classLevel) practiceParams.set("classLevel", question.classLevel);
  const explanations = Array.isArray(question.optionExplanations) ? question.optionExplanations : [];
  return <article className="pq-card" aria-labelledby={`question-${question.id}`}>
    <header className="pq-meta"><span className="pq-number">{String(number).padStart(2, "0")}</span><span>{question.examYear ?? "Year unlisted"} · {question.subject}</span>{question.classLevel && <span>Class {question.classLevel}</span>}<span className="pq-level">{question.difficulty.toLowerCase()}</span></header>
    <p className="pq-chapter">{question.chapter}{question.topic ? ` / ${question.topic}` : ""}</p>
    <div id={`question-${question.id}`} className="pq-stem"><MathText>{question.question}</MathText></div>
    {question.visualAssetUrl && <figure className="pq-figure">
      {/* External educational diagrams retain their source URL and natural aspect ratio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={question.visualAssetUrl} alt={`Diagram for question ${number}`} loading="lazy" onError={event => { setDiagramFailed(true); event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} />
      <figcaption hidden>Diagram could not load. Don’t attempt this graphical question without its figure.</figcaption>
    </figure>}
    {!usable ? <p role="status" className="pq-state">This question needs a data review before it can be attempted.</p> : <>
      <div className="pq-options" role="group" aria-label={`Answer question ${number}`}>
        {question.options.map((option, index) => <button key={index} type="button" disabled={answered || diagramFailed} aria-pressed={answer === index}
          className={answered && index === question.correctIndex ? "is-correct" : answer === index ? "is-incorrect" : ""}
          onClick={() => setAnswer(index)}><span className="pq-letter">{String.fromCharCode(65 + index)}</span><span className="pq-option-text"><MathText>{option}</MathText></span>{answered && index === question.correctIndex && <Check size={18} aria-label="Correct answer" />}</button>)}
      </div>
      {answered && <div className={`pq-feedback ${correct ? "is-correct" : ""}`}>
        <p role="status"><strong>{correct ? "Well done — you got it." : "Keep going — this is a useful one to revisit."}</strong> Correct answer: {String.fromCharCode(65 + question.correctIndex)}.</p>
        {question.explanation?.trim() ? <MathText>{question.explanation}</MathText> : <p>An explanation has not yet been provided for this question.</p>}
        {explanations.some(value => typeof value === "string" && value.trim()) && <details><summary>Why each option fits — or doesn’t</summary>{explanations.map((value, index) => typeof value === "string" && value.trim() ? <div key={index}><strong>Option {String.fromCharCode(65 + index)}</strong><MathText>{value}</MathText></div> : null)}</details>}
      </div>}
    </>}
    <footer className="pq-card-footer"><details><summary>Source & answer record</summary><p>{question.sourceRef || "Source reference unavailable — report for review."}</p><p>Listed from the bank’s verified-strict collection. This practice attempt stays on this page; it does not change your study totals.</p></details><SmoothLink href={`/practice?${practiceParams}`}>Test this chapter <ArrowRight size={15} /></SmoothLink></footer>
  </article>;
}

export default function PyqExplorerPage() {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [year, setYear] = useState("");
  const [chapter, setChapter] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<Payload>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ page: String(page) });
      for (const [key, value] of Object.entries({ q: query.trim(), subject, year, chapter, classLevel, difficulty })) if (value) params.set(key, value);
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/pyq/questions?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Questions could not load. Your filters are still here.");
        const result = await response.json();
        if (!Array.isArray(result.questions) || !Array.isArray(result.facets) || !Number.isInteger(result.total) || !Number.isInteger(result.pageSize) || result.pageSize < 1) throw new Error("The question list was incomplete. Please retry.");
        if (!controller.signal.aborted) setPayload(result);
      } catch (err) {
        if (!controller.signal.aborted || timedOut) setError(timedOut ? "Loading took too long. Please retry." : err instanceof Error ? err.message : "Questions could not load.");
      } finally { window.clearTimeout(timeout); if (!controller.signal.aborted || timedOut) setLoading(false); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); window.clearTimeout(timeout); };
  }, [chapter, classLevel, difficulty, page, query, retry, subject, year]);

  const years = useMemo(() => [...new Set(payload.facets.map(entry => entry.examYear).filter((value): value is number => value !== null))].sort((a, b) => b - a), [payload.facets]);
  const chapters = useMemo(() => [...new Set(payload.facets.filter(entry => (!subject || entry.subject === subject) && (!classLevel || entry.classLevel === classLevel)).map(entry => entry.chapter))].sort(), [payload.facets, subject, classLevel]);
  const pages = Math.max(1, Math.ceil(payload.total / payload.pageSize));
  const setFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); setLoading(true); setError(""); };
  const clear = () => { setQuery(""); setSubject(""); setYear(""); setChapter(""); setClassLevel(""); setDifficulty(""); setPage(1); setRetry(value => value + 1); setLoading(true); setError(""); };
  const hasFilters = Boolean(query || subject || year || chapter || classLevel || difficulty);
  return <main className={`${styles.page} studio-page`} data-studio-native>
    <header className="pq-heading"><SmoothLink href="/pyq" className="pq-back"><ArrowLeft size={15} /> Paper archive</SmoothLink><span className="studio-eyebrow">Practice library</span><h1>Past questions. Fresh thinking.</h1><p>Find a chapter, try an answer, then see the reasoning.</p></header>
    <section className="pq-filter-panel" aria-label="Question filters">
      <label className="pq-search"><Search size={19} /><input type="search" aria-label="Search PYQ questions" value={query} onChange={event => setFilter(setQuery, event.target.value)} placeholder="Search a question, chapter or topic" /></label>
      <button className="pq-filter-toggle" aria-expanded={filtersOpen} aria-controls="pyq-extra-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={16} /> {filtersOpen ? "Hide filters" : "Refine selection"}</button>
      <div className="pq-filter-grid" id="pyq-extra-filters" data-expanded={filtersOpen}>
        <label><span>Subject</span><select value={subject} onChange={e => { setFilter(setSubject, e.target.value); setChapter(""); }}><option value="">All subjects</option>{["Physics", "Chemistry", "Botany", "Zoology"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Class</span><select value={classLevel} onChange={e => { setFilter(setClassLevel, e.target.value); setChapter(""); }}><option value="">Both classes</option><option value="11">Class 11</option><option value="12">Class 12</option></select></label>
        <label className="pq-chapter-filter"><span>Chapter</span><select value={chapter} onChange={e => setFilter(setChapter, e.target.value)}><option value="">All chapters</option>{chapters.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Exam year</span><select value={year} onChange={e => setFilter(setYear, e.target.value)}><option value="">All years</option>{years.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Difficulty</span><select value={difficulty} onChange={e => setFilter(setDifficulty, e.target.value)}><option value="">All levels</option><option value="EASY">Easy</option><option value="MODERATE">Moderate</option><option value="TOUGH">Tough</option></select></label>
      </div>
    </section>
    <div className="pq-result-bar" role="status"><span><SlidersHorizontal size={15} />{loading ? "Finding questions…" : error ? "Library unavailable" : `${payload.total.toLocaleString()} matching questions`}</span>{hasFilters && <button onClick={clear}><RotateCcw size={14} /> Clear filters</button>}</div>
    {error ? <section className="pq-state" role="alert"><BookOpen size={28} /><h2>Let’s try that again.</h2><p>{error}</p><button className="studio-action" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Retry loading</button></section>
      : loading ? <div className="pq-skeleton" aria-label="Loading questions" aria-busy="true"><span /><span /><span /></div>
      : !payload.questions.length ? <section className="pq-state"><BookOpen size={28} /><h2>No questions in this selection yet.</h2><p>Try another chapter or clear the filters. Missing years are not filled with generated questions.</p>{hasFilters && <button className="studio-action" onClick={clear}>Clear filters</button>}</section>
      : <section className="pq-list" aria-label="PYQ questions">{payload.questions.map((question, index) => <QuestionCard key={question.id} question={question} number={(page - 1) * payload.pageSize + index + 1} />)}</section>}
    {!error && payload.total > 0 && <nav className="pq-pagination" aria-label="Question pages"><button disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage(value => value - 1); }}><ArrowLeft size={16} /> Previous</button><span>Page {page} of {pages}</span><button disabled={loading || page >= pages} onClick={() => { setLoading(true); setPage(value => value + 1); }}>Next <ArrowRight size={16} /></button></nav>}
  </main>;
}
