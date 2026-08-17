"use client";

import { ArrowRight, BookOpen, FileText, Highlighter, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SmoothLink from "@/components/layout/smooth-link";

type ReaderDocument = { id: string; subject: string; classLevel: string; chapter: string; title: string; edition: string | null; pageCount: number | null; highlightCount: number; progress: { currentPage: number } | null };

export default function ReaderLibraryPage() {
  const [documents, setDocuments] = useState<ReaderDocument[]>([]);
  const [query, setQuery] = useState("");
  const [classLevel, setClassLevel] = useState<"ALL" | "11" | "12">("ALL");
  const [subject, setSubject] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reader", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => setDocuments(Array.isArray(payload.documents) ? payload.documents : []))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => documents.filter((document) =>
    (classLevel === "ALL" || document.classLevel === classLevel) &&
    (subject === "ALL" || document.subject === subject) &&
    (!query.trim() || `${document.title} ${document.chapter} ${document.subject}`.toLowerCase().includes(query.trim().toLowerCase())),
  ), [classLevel, documents, query, subject]);

  return (
    <main className="reader-library">
      <header>
        <span className="eyebrow"><BookOpen size={14} /> NCERT Reader</span>
        <h1>Your NCERT, chapter by chapter</h1>
        <p>Read the verified source PDF naturally. Exam-linked sentences open interactive historical questions without leaving the chapter.</p>
      </header>
      <section className="reader-toolbar">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a chapter" /></label>
        <div>{(["ALL", "11", "12"] as const).map((value) => <button key={value} className={classLevel === value ? "active" : ""} onClick={() => setClassLevel(value)}>{value === "ALL" ? "Both classes" : `Class ${value}`}</button>)}</div>
        <select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="ALL">All subjects</option>{["Physics", "Chemistry", "Botany", "Zoology"].map((value) => <option key={value}>{value}</option>)}</select>
      </section>
      {loading ? <div className="reader-empty"><Loader2 className="spin" /> Loading verified NCERT library...</div> : visible.length ? (
        <section className="reader-grid">
          {visible.map((document) => (
            <article key={document.id}>
              <div className="document-icon"><FileText size={22} /></div>
              <span>Class {document.classLevel} · {document.subject}</span>
              <h2>{document.title}</h2>
              <p>{document.pageCount ? `${document.pageCount} pages` : "PDF"} · {document.highlightCount} verified exam highlight{document.highlightCount === 1 ? "" : "s"}</p>
              <SmoothLink href={`/reader/${document.id}`}>{document.progress ? `Continue page ${document.progress.currentPage}` : "Start reading"}<ArrowRight size={15} /></SmoothLink>
            </article>
          ))}
        </section>
      ) : <div className="reader-empty"><Highlighter size={26} /><strong>No verified reader chapter matches.</strong><span>NCERT PDFs enter this library only after source hash and chapter mapping checks pass.</span></div>}
      <style jsx>{`
        .reader-library{min-height:100vh;padding:clamp(28px,5vw,70px);padding-bottom:130px;color:var(--text-primary);background:radial-gradient(circle at 10% 0%,rgba(92,200,125,.10),transparent 28%),radial-gradient(circle at 88% 10%,rgba(91,156,245,.08),transparent 25%)}header{max-width:850px;margin:20px auto 34px;text-align:center}.eyebrow{display:inline-flex;align-items:center;gap:7px;color:var(--botany);font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.12em}h1{margin:13px 0 10px;font-size:clamp(34px,5vw,62px);line-height:1;letter-spacing:-.055em}header p{margin:0 auto;max-width:700px;color:var(--text-secondary);line-height:1.7}.reader-toolbar{max-width:1180px;margin:0 auto 22px;display:grid;grid-template-columns:minmax(240px,1fr) auto auto;gap:12px;padding:12px;border:1px solid var(--glass-border);border-radius:20px;background:var(--glass-thin)}.reader-toolbar label{display:flex;align-items:center;gap:9px;padding:0 12px;border-radius:12px;background:var(--bg-surface)}.reader-toolbar input,.reader-toolbar select,select{border:0;outline:0;background:transparent;color:inherit;font:inherit}.reader-toolbar input{width:100%}.reader-toolbar>div{display:flex;gap:6px}.reader-toolbar button,.reader-toolbar select{padding:10px 12px;border:1px solid var(--glass-border);border-radius:11px;background:var(--glass-thin);color:var(--text-secondary);cursor:pointer}.reader-toolbar button.active{color:var(--gold);border-color:var(--gold-glow);background:var(--gold-dim)}.reader-grid{max-width:1180px;margin:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.reader-grid article{padding:22px;border:1px solid var(--glass-border);border-radius:22px;background:linear-gradient(160deg,var(--glass-mid),var(--glass-thin));box-shadow:var(--shadow-card)}.document-icon{width:44px;height:44px;display:grid;place-items:center;border-radius:14px;background:var(--gold-dim);color:var(--gold);margin-bottom:18px}.reader-grid article>span{color:var(--text-muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.reader-grid h2{margin:8px 0;font-size:18px}.reader-grid p{color:var(--text-secondary);font-size:12px}.reader-grid :global(a){margin-top:18px;display:flex;align-items:center;justify-content:space-between;padding:11px 13px;border-radius:12px;background:var(--gold);color:#16100a;text-decoration:none;font-size:12px;font-weight:850}.reader-empty{max-width:760px;margin:70px auto;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;color:var(--text-muted)}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:850px){.reader-toolbar{grid-template-columns:1fr}.reader-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.reader-library{padding:24px 14px 140px}.reader-grid{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}

