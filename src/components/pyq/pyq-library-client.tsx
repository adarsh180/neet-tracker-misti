"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookMarked,
  Check,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Minus,
  Plus,
  Search,
} from "lucide-react";

type Paper = {
  id: string;
  year: string;
  title: string;
  fileName: string;
  pathname: string;
};

type YearFolder = {
  year: string;
  papers: Paper[];
};

type JeeCatalog = {
  exam: string;
  firstYear: string | null;
  lastYear: string | null;
  totalPapers: number;
  years: YearFolder[];
};

type Props = {
  jeeCatalog: JeeCatalog;
};

type YearProgress = {
  year: string;
  completed: boolean;
  revisionCount: number;
  updatedAt?: string;
};

function buildDocumentUrl(pathname: string, download = false) {
  const params = new URLSearchParams({ pathname });
  if (download) params.set("download", "1");
  return `/api/pyq/document?${params.toString()}`;
}

// NEET UG covers 20 years of papers (2006–2025). No PDF blobs were supplied for
// NEET, so each year tracks progress here and opens a Practice Arena session
// built from that year's PYQs instead of a static file.
const NEET_YEARS = Array.from({ length: 2025 - 2006 + 1 }, (_, index) => String(2025 - index));

export default function PyqLibraryClient({ jeeCatalog }: Props) {
  const [activeArchive, setActiveArchive] = useState<"jee" | "neet" | null>(null);
  const [selectedYear, setSelectedYear] = useState(jeeCatalog.years[0]?.year ?? "");
  const [query, setQuery] = useState("");
  const [yearProgress, setYearProgress] = useState<Record<string, YearProgress>>({});
  const [neetProgress, setNeetProgress] = useState<Record<string, YearProgress>>({});
  const [progressLoading, setProgressLoading] = useState(true);
  const [savingYears, setSavingYears] = useState<Set<string>>(() => new Set());
  const [progressError, setProgressError] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "pending">("all");
  const pendingYearsRef = useRef(new Set<string>());

  const currentYear = jeeCatalog.years.find((folder) => folder.year === selectedYear);
  const normalizedQuery = query.trim().toLowerCase();
  const completedYears = jeeCatalog.years.filter((folder) => yearProgress[folder.year]?.completed).length;
  const revisionRounds = jeeCatalog.years.reduce(
    (total, folder) => total + (yearProgress[folder.year]?.revisionCount ?? 0),
    0,
  );

  const visiblePapers = useMemo(() => {
    let papers = !normalizedQuery
      ? currentYear?.papers ?? []
      : jeeCatalog.years
          .flatMap((folder) => folder.papers)
          .filter((paper) => {
            const searchable = `${paper.year} ${paper.title} ${paper.fileName}`.toLowerCase();
            return searchable.includes(normalizedQuery);
          });

    if (filter === "completed") {
      papers = papers.filter((paper) => yearProgress[paper.year]?.completed);
    } else if (filter === "pending") {
      papers = papers.filter((paper) => !yearProgress[paper.year]?.completed);
    }

    return papers;
  }, [currentYear, jeeCatalog.years, normalizedQuery, filter, yearProgress]);

  const loadProgress = useCallback(async (quiet = false) => {
    if (!quiet) setProgressLoading(true);

    try {
      const [jeeResponse, neetResponse] = await Promise.all([
        fetch("/api/pyq/progress?exam=jee-main", { cache: "no-store" }),
        fetch("/api/pyq/progress?exam=neet-ug", { cache: "no-store" }),
      ]);
      if (!jeeResponse.ok || !neetResponse.ok) throw new Error("Unable to load PYQ progress");

      const records = (await jeeResponse.json()) as YearProgress[];
      const neetRecords = (await neetResponse.json()) as YearProgress[];
      setYearProgress((current) => {
        const synced = Object.fromEntries(records.map((record) => [record.year, record]));
        pendingYearsRef.current.forEach((year) => {
          if (current[year]) synced[year] = current[year];
        });
        return synced;
      });
      setNeetProgress((current) => {
        const synced = Object.fromEntries(neetRecords.map((record) => [record.year, record]));
        pendingYearsRef.current.forEach((year) => {
          if (current[year]) synced[year] = current[year];
        });
        return synced;
      });
      setProgressError("");
    } catch {
      setProgressError("Progress could not be synced right now.");
    } finally {
      if (!quiet) setProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProgress();

    const intervalId = window.setInterval(() => {
      void loadProgress(true);
    }, 5000);
    const handleFocus = () => void loadProgress(true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void loadProgress(true);
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadProgress]);

  async function saveProgress(
    year: string,
    changes: Partial<Pick<YearProgress, "completed" | "revisionCount">>,
    exam: "jee-main" | "neet-ug" = "jee-main",
  ) {
    const progressMap = exam === "neet-ug" ? neetProgress : yearProgress;
    const setProgressMap = exam === "neet-ug" ? setNeetProgress : setYearProgress;
    const previous = progressMap[year] ?? { year, completed: false, revisionCount: 0 };
    const next = { ...previous, ...changes };

    pendingYearsRef.current.add(year);
    setProgressMap((current) => ({ ...current, [year]: next }));
    setSavingYears((current) => new Set(current).add(year));
    setProgressError("");

    try {
      const response = await fetch("/api/pyq/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam,
          year,
          completed: next.completed,
          revisionCount: next.revisionCount,
        }),
      });
      if (!response.ok) throw new Error("Unable to save PYQ progress");

      const saved = (await response.json()) as YearProgress;
      setProgressMap((current) => ({ ...current, [year]: saved }));
    } catch {
      setProgressMap((current) => ({ ...current, [year]: previous }));
      setProgressError("Progress could not be saved. Please try again.");
    } finally {
      pendingYearsRef.current.delete(year);
      setSavingYears((current) => {
        const nextSaving = new Set(current);
        nextSaving.delete(year);
        return nextSaving;
      });
    }
  }

  return (
    <main className="archive-page">
      <div className="archive-background" aria-hidden="true" />

      <header className="archive-hero">
        <div className="archive-hero-mark">
          <BookMarked size={20} />
        </div>
        <div className="archive-heading">
          <span className="archive-eyebrow">Study archive</span>
          <h1>Previous Year Papers</h1>
          <p>
            An ordered desk of real papers, ready for an unhurried study session.
          </p>
        </div>
        <div className="archive-overview" aria-label="Archive summary">
          <div>
            <strong>{jeeCatalog.totalPapers}</strong>
            <span>JEE papers</span>
          </div>
          <div>
            <strong>{jeeCatalog.firstYear}-{jeeCatalog.lastYear}</strong>
            <span>Collected years</span>
          </div>
          <div>
            <strong>{completedYears}/{jeeCatalog.years.length}</strong>
            <span>Years completed</span>
          </div>
          <div>
            <strong>{revisionRounds}</strong>
            <span>Revision rounds</span>
          </div>
        </div>
      </header>

      {!activeArchive && (
        <section className="cabinet" aria-label="Paper collections">
          <div className="cabinet-title">
            <span className="archive-eyebrow">Cabinet</span>
            <h2>Choose a folder</h2>
          </div>
          <div className="collection-grid">
            <button className="collection-folder collection-folder-jee" onClick={() => setActiveArchive("jee")} type="button">
              <span className="folder-lip" />
              <span className="folder-glare" />
              <FolderOpen size={34} className="folder-icon" />
              <span className="folder-name">JEE Main</span>
              <span className="folder-caption">{jeeCatalog.totalPapers} papers / {jeeCatalog.firstYear}-{jeeCatalog.lastYear}</span>
              <span className="folder-action">Open archive <ArrowUpRight size={15} /></span>
            </button>
            <button className="collection-folder collection-folder-neet" onClick={() => setActiveArchive("neet")} type="button">
              <span className="folder-lip" />
              <span className="folder-glare" />
              <FolderOpen size={34} className="folder-icon" />
              <span className="folder-name">NEET UG</span>
              <span className="folder-caption">{NEET_YEARS.length} years / 2006-2025 · practice sessions</span>
              <span className="folder-action">Open archive <ArrowUpRight size={15} /></span>
            </button>
          </div>
        </section>
      )}

      {activeArchive === "neet" && (
        <section className="neet-shelf">
          <div className="neet-toolbar">
            <button className="back-button" onClick={() => setActiveArchive(null)} type="button">
              <ArrowLeft size={15} /> All collections
            </button>
            <div className="neet-shelf-head">
              <span className="archive-eyebrow">NEET UG · 2006-2025</span>
              <h2>Year-wise NEET papers</h2>
              <p>
                Tick a year after finishing it from your books, count revision rounds, or launch a Practice Arena
                session built from that year&apos;s PYQs with verified answer keys.
              </p>
            </div>
          </div>
          <div className="neet-grid">
            {NEET_YEARS.map((year, index) => {
              const status = neetProgress[year] ?? { year, completed: false, revisionCount: 0 };
              const saving = savingYears.has(year);
              return (
                <div className={`neet-year ${status.completed ? "is-complete" : ""}`} key={year} style={{ "--folder-index": index } as CSSProperties}>
                  <div className="neet-year-top">
                    <Folder size={18} />
                    <strong>NEET {year}</strong>
                    <span className={`sync-status ${saving ? "is-saving" : ""}`}>
                      {saving ? "Saving..." : status.completed ? "Completed" : "Pending"}
                    </span>
                  </div>
                  <div className="progress-controls">
                    <label className={`completion-check ${status.completed ? "is-checked" : ""}`}>
                      <input
                        checked={status.completed}
                        disabled={progressLoading || saving}
                        onChange={(event) => void saveProgress(year, { completed: event.target.checked }, "neet-ug")}
                        type="checkbox"
                      />
                      <span className="check-box"><Check size={12} /></span>
                      Done end-to-end
                    </label>
                    <div className="revision-control" aria-label={`NEET ${year} revision rounds`}>
                      <button
                        aria-label={`Decrease NEET ${year} revision count`}
                        disabled={progressLoading || saving || status.revisionCount === 0}
                        onClick={() => void saveProgress(year, { revisionCount: Math.max(0, status.revisionCount - 1) }, "neet-ug")}
                        type="button"
                      >
                        <Minus size={12} />
                      </button>
                      <span><strong>{status.revisionCount}</strong> Rev</span>
                      <button
                        aria-label={`Increase NEET ${year} revision count`}
                        disabled={progressLoading || saving || status.revisionCount === 99}
                        onClick={() => void saveProgress(year, { revisionCount: Math.min(99, status.revisionCount + 1) }, "neet-ug")}
                        type="button"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <a className="neet-practice" href={`/practice?year=${year}`}>
                    Practice {year} PYQs <ArrowUpRight size={13} />
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeArchive === "jee" && (
        <section className="explorer">
          <div className="explorer-toolbar">
            <button className="back-button" onClick={() => { setActiveArchive(null); setQuery(""); }} type="button">
              <ArrowLeft size={15} /> All collections
            </button>
            <div className="explorer-controls">
              <label className="search-box">
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Find a year, date, shift or subject"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="filter-pills" aria-label="Paper filters">
                <button
                  className={`filter-pill ${filter === "all" ? "is-active" : ""}`}
                  onClick={() => setFilter("all")}
                  type="button"
                >
                  All
                </button>
                <button
                  className={`filter-pill ${filter === "completed" ? "is-active" : ""}`}
                  onClick={() => setFilter("completed")}
                  type="button"
                >
                  Completed
                </button>
                <button
                  className={`filter-pill ${filter === "pending" ? "is-active" : ""}`}
                  onClick={() => setFilter("pending")}
                  type="button"
                >
                  Pending
                </button>
              </div>
            </div>
          </div>

          {progressError && (
            <div className="delivery-note delivery-note-error" role="status">
              {progressError}
            </div>
          )}

          <div className="explorer-shell">
            <aside className="year-rail" aria-label="JEE paper years">
              <div className="year-rail-head">
                <span className="archive-eyebrow">JEE Main</span>
                <strong>Year folders</strong>
                <p>Tick a year after completing every paper. Revision rounds stay saved for Misti.</p>
              </div>
              {jeeCatalog.years.map((folder, index) => {
                const active = !normalizedQuery && folder.year === selectedYear;
                const status = yearProgress[folder.year] ?? {
                  year: folder.year,
                  completed: false,
                  revisionCount: 0,
                };
                const saving = savingYears.has(folder.year);
                return (
                  <div
                    className={`year-folder ${active ? "is-active" : ""}`}
                    key={folder.year}
                    style={{ "--folder-index": index } as CSSProperties}
                  >
                    <button
                      className="year-folder-open"
                      onClick={() => { setSelectedYear(folder.year); setQuery(""); }}
                      type="button"
                    >
                      {active ? <FolderOpen size={19} /> : <Folder size={19} />}
                      <span>
                        <strong>{folder.year}</strong>
                        <small>{folder.papers.length} files</small>
                      </span>
                    </button>
                    <div className="progress-controls">
                      <label className={`completion-check ${status.completed ? "is-checked" : ""}`}>
                        <input
                          checked={status.completed}
                          disabled={progressLoading || saving}
                          onChange={(event) => void saveProgress(folder.year, { completed: event.target.checked })}
                          type="checkbox"
                        />
                        <span className="check-box"><Check size={12} /></span>
                        Done end-to-end
                      </label>
                      <div className="revision-control" aria-label={`${folder.year} revision rounds`}>
                        <button
                          aria-label={`Decrease ${folder.year} revision count`}
                          disabled={progressLoading || saving || status.revisionCount === 0}
                          onClick={() => void saveProgress(folder.year, { revisionCount: Math.max(0, status.revisionCount - 1) })}
                          type="button"
                        >
                          <Minus size={12} />
                        </button>
                        <span><strong>{status.revisionCount}</strong> Rev</span>
                        <button
                          aria-label={`Increase ${folder.year} revision count`}
                          disabled={progressLoading || saving || status.revisionCount === 99}
                          onClick={() => void saveProgress(folder.year, { revisionCount: Math.min(99, status.revisionCount + 1) })}
                          type="button"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <span className={`sync-status ${saving ? "is-saving" : ""}`}>
                      {saving ? "Saving..." : status.completed ? "Completed" : "Ready"}
                    </span>
                  </div>
                );
              })}
            </aside>

            <div className="file-pane">
              <div className="file-pane-header">
                <div>
                  <span className="archive-eyebrow">{normalizedQuery ? "Search results" : "Folder open"}</span>
                  <h2>{normalizedQuery ? `"${query.trim()}"` : `JEE Main ${selectedYear}`}</h2>
                </div>
                <span className="result-pill">{visiblePapers.length} PDFs</span>
              </div>

              <div className="paper-list">
                {visiblePapers.map((paper, index) => {
                  const documentUrl = buildDocumentUrl(paper.pathname);
                  return (
                    <article className="paper-row" key={paper.id} style={{ "--paper-index": Math.min(index, 14) } as CSSProperties}>
                      <div className="paper-icon">
                        <FileText size={20} />
                      </div>
                      <div className="paper-name">
                        <strong>{paper.title}</strong>
                        <span>{paper.year} / PDF</span>
                      </div>
                      <div className="paper-actions">
                        <a className="open-paper" href={documentUrl} rel="noreferrer" target="_blank">
                          Open PDF <ArrowUpRight size={14} />
                        </a>
                        <a className="download-paper" href={buildDocumentUrl(paper.pathname, true)} aria-label={`Download ${paper.title}`}>
                          <Download size={15} />
                        </a>
                      </div>
                    </article>
                  );
                })}
                {visiblePapers.length === 0 && (
                  <div className="no-results">
                    <Search size={22} />
                    <strong>No paper matches that search.</strong>
                    <span>Try a year, month, shift number or subject.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <style jsx>{`
        .archive-page {
          position: relative;
          min-height: 100vh;
          padding: clamp(20px, 3vw, 34px);
          padding-bottom: 104px;
          color: var(--text-primary);
          isolation: isolate;
        }
        .archive-background {
          position: fixed;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(circle at 18% 6%, rgba(212,168,83,0.14), transparent 27%),
            radial-gradient(circle at 82% 18%, rgba(91,156,245,0.08), transparent 28%),
            linear-gradient(110deg, rgba(31,25,19,0.35), transparent 40%),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.014) 0 1px, transparent 1px 76px),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 76px),
            hsl(240, 18%, 5%);
        }
        .archive-hero, .cabinet, .explorer-shell, .empty-folder {
          border: 1px solid rgba(255,255,255,0.085);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.068), rgba(255,255,255,0.025)),
            rgba(6,7,11,0.73);
          box-shadow: 0 20px 58px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07);
          backdrop-filter: blur(20px) saturate(145%);
          -webkit-backdrop-filter: blur(20px) saturate(145%);
          border-radius: 10px;
        }
        .archive-hero {
          position: relative;
          display: flex;
          align-items: center;
          gap: 20px;
          padding: clamp(22px, 3.1vw, 34px);
          overflow: hidden;
        }
        .archive-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(112deg, rgba(255,236,196,0.1), transparent 28%);
        }
        .archive-hero-mark {
          width: 54px;
          height: 54px;
          flex-shrink: 0;
          border-radius: 14px;
          display: grid;
          place-items: center;
          color: var(--gold-bright);
          border: 1px solid rgba(212,168,83,0.28);
          background: rgba(212,168,83,0.1);
          position: relative;
          z-index: 1;
        }
        .archive-heading {
          position: relative;
          z-index: 1;
          flex: 1;
        }
        .archive-eyebrow {
          display: block;
          margin-bottom: 7px;
          color: var(--gold-bright);
          font-size: 10px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .archive-heading h1 {
          margin: 0 0 6px;
          font: 600 clamp(27px, 3vw, 38px)/1.06 var(--font-display);
          letter-spacing: -0.035em;
        }
        .archive-heading p {
          margin: 0;
          max-width: 530px;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.5;
        }
        .archive-overview {
          position: relative;
          z-index: 1;
          display: flex;
          gap: 8px;
        }
        .archive-overview div {
          min-width: 112px;
          padding: 13px 14px;
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 8px;
          background: rgba(255,255,255,0.035);
        }
        .archive-overview strong {
          display: block;
          color: var(--text-primary);
          font-size: 18px;
          font-weight: 650;
          white-space: nowrap;
        }
        .archive-overview span {
          color: var(--text-muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .cabinet {
          margin-top: 18px;
          padding: clamp(20px, 2.8vw, 30px);
        }
        .cabinet-title h2 {
          margin: 0 0 24px;
          font: 500 24px/1.15 var(--font-display);
        }
        .collection-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(260px, 390px));
          gap: 18px;
        }
        .collection-folder {
          position: relative;
          min-height: 206px;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          overflow: hidden;
          padding: 34px 24px 21px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          color: var(--text-primary);
          cursor: pointer;
          background:
            linear-gradient(130deg, rgba(255,255,255,0.11), rgba(255,255,255,0.035) 36%, transparent),
            rgba(255,255,255,0.035);
          transition: transform 180ms var(--ease-out), border-color 180ms var(--ease-out), box-shadow 180ms var(--ease-out);
        }
        .collection-folder:hover {
          transform: translateY(-3px);
          border-color: rgba(212,168,83,0.32);
          box-shadow: 0 18px 40px rgba(0,0,0,0.28), inset 0 1px rgba(255,255,255,0.12);
        }
        .collection-folder:active { transform: translateY(-1px) scale(0.99); }
        .collection-folder-jee {
          background:
            radial-gradient(circle at 88% 4%, rgba(212,168,83,0.14), transparent 35%),
            linear-gradient(130deg, rgba(255,255,255,0.10), rgba(255,255,255,0.025) 36%),
            rgba(212,168,83,0.035);
        }
        .collection-folder-neet {
          background:
            radial-gradient(circle at 88% 4%, rgba(77,200,125,0.09), transparent 35%),
            linear-gradient(130deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025) 36%),
            rgba(77,200,125,0.02);
        }
        .folder-lip {
          position: absolute;
          left: 20px;
          top: 0;
          width: 104px;
          height: 15px;
          border-radius: 0 0 8px 8px;
          background: rgba(212,168,83,0.2);
          border: 1px solid rgba(212,168,83,0.16);
          border-top: 0;
        }
        .collection-folder-neet .folder-lip {
          background: rgba(77,200,125,0.13);
          border-color: rgba(77,200,125,0.13);
        }
        .folder-glare {
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, rgba(255,255,255,0.12), transparent 26%);
          opacity: 0.55;
          pointer-events: none;
        }
        .folder-icon {
          color: var(--gold-bright);
          margin-bottom: 19px;
        }
        .collection-folder-neet .folder-icon { color: var(--success); }
        .folder-name {
          font: 600 25px/1.15 var(--font-display);
          letter-spacing: -0.03em;
        }
        .folder-caption {
          color: var(--text-secondary);
          font-size: 13px;
          margin-top: 6px;
        }
        .folder-action {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--gold-bright);
          font-size: 12px;
          font-weight: 650;
          letter-spacing: 0.04em;
          margin-top: auto;
        }
        .collection-folder-neet .folder-action { color: var(--success); }
        .explorer { margin-top: 18px; }
        .explorer-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
        }
        .back-button {
          display: inline-flex;
          gap: 7px;
          align-items: center;
          height: 42px;
          padding: 0 15px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.045);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--t-fast);
        }
        .back-button:hover {
          color: var(--text-primary);
          border-color: rgba(212,168,83,0.25);
          background: rgba(212,168,83,0.08);
        }
        .search-box {
          height: 44px;
          width: min(400px, 100%);
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.04);
          border-radius: 9px;
          color: var(--text-muted);
        }
        .search-box:focus-within {
          color: var(--gold);
          border-color: rgba(212,168,83,0.33);
          box-shadow: 0 0 0 3px rgba(212,168,83,0.08);
        }
        .search-box input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--text-primary);
          font: inherit;
          font-size: 13.5px;
        }
        .search-box input::placeholder { color: var(--text-muted); }
        .explorer-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          justify-content: flex-end;
        }
        .filter-pills {
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid rgba(255,255,255,0.07);
          padding: 3px;
          border-radius: 9px;
          background: rgba(255,255,255,0.02);
        }
        .filter-pill {
          height: 36px;
          padding: 0 14px;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--text-muted);
          font-size: 12.5px;
          font-weight: 600;
          background: transparent;
          cursor: pointer;
          transition: var(--t-fast);
        }
        .filter-pill:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.045);
        }
        .filter-pill.is-active {
          color: var(--gold-bright);
          background: rgba(212,168,83,0.11);
          border-color: rgba(212,168,83,0.18);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
        }
        :global(html[data-theme="light"]) .filter-pills {
          border-color: rgba(70,45,24,0.08);
          background: rgba(70,45,24,0.02);
        }
        :global(html[data-theme="light"]) .filter-pill.is-active {
          color: var(--gold-bright);
          background: rgba(212,168,83,0.1);
          border-color: rgba(212,168,83,0.2);
        }
        .delivery-note {
          margin-bottom: 14px;
          border: 1px solid rgba(212,168,83,0.18);
          border-radius: 8px;
          padding: 11px 14px;
          font-size: 13px;
          color: var(--text-secondary);
          background: rgba(212,168,83,0.055);
        }
        .delivery-note-error {
          border-color: rgba(232,114,138,0.22);
          color: hsl(352, 75%, 79%);
          background: rgba(232,114,138,0.07);
        }
        .explorer-shell {
          display: grid;
          grid-template-columns: minmax(302px, 322px) minmax(0, 1fr);
          height: clamp(560px, calc(100vh - 260px), 700px);
          overflow: hidden;
        }
        .year-rail {
          min-height: 0;
          padding: 20px 13px;
          border-right: 1px solid rgba(255,255,255,0.065);
          background: rgba(255,255,255,0.016);
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(212,168,83,0.25) transparent;
        }
        .year-rail-head {
          padding: 3px 8px 16px;
        }
        .year-rail-head strong {
          font-size: 17px;
          font-weight: 550;
        }
        .year-rail-head p {
          margin: 8px 0 0;
          color: var(--text-muted);
          font-size: 11px;
          line-height: 1.45;
        }
        .year-folder {
          width: 100%;
          min-height: 102px;
          margin-bottom: 7px;
          border: 1px solid transparent;
          border-radius: 8px;
          padding: 7px 8px 8px;
          background: transparent;
          color: var(--text-secondary);
          text-align: left;
          animation: riseIn 250ms var(--ease-out) both;
          animation-delay: calc(var(--folder-index) * 18ms);
          transition: var(--t-fast);
        }
        .year-folder:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.05);
        }
        .year-folder.is-active {
          color: var(--gold-bright);
          border-color: rgba(212,168,83,0.22);
          background: rgba(212,168,83,0.09);
        }
        .year-folder-open {
          width: 100%;
          min-height: 42px;
          padding: 0 3px;
          border: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          color: inherit;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }
        .year-folder-open span { flex: 1; min-width: 0; }
        .year-folder-open strong {
          display: block;
          color: inherit;
          font-size: 14px;
        }
        .year-folder-open small {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .progress-controls {
          min-height: 31px;
          margin-top: 4px;
          padding-top: 7px;
          border-top: 1px solid rgba(255,255,255,0.055);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .completion-check {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--text-muted);
          font-size: 10.5px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .completion-check input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .check-box {
          width: 16px;
          height: 16px;
          flex: none;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 5px;
          color: transparent;
          background: rgba(255,255,255,0.035);
          transition: var(--t-fast);
        }
        .completion-check:hover .check-box,
        .completion-check input:focus-visible + .check-box {
          border-color: rgba(212,168,83,0.42);
        }
        .completion-check input:focus-visible + .check-box {
          box-shadow: 0 0 0 3px rgba(212,168,83,0.11);
        }
        .completion-check.is-checked { color: var(--success); }
        .completion-check.is-checked .check-box {
          color: hsl(142, 60%, 87%);
          border-color: rgba(77,200,125,0.38);
          background: rgba(77,200,125,0.19);
        }
        .completion-check:has(input:disabled) { opacity: 0.58; cursor: wait; }
        .revision-control {
          height: 25px;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 999px;
          background: rgba(255,255,255,0.025);
        }
        .revision-control button {
          width: 20px;
          height: 20px;
          border: 0;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: var(--text-secondary);
          background: transparent;
          cursor: pointer;
          transition: var(--t-fast);
        }
        .revision-control button:hover:not(:disabled) {
          color: var(--gold-bright);
          background: rgba(212,168,83,0.14);
        }
        .revision-control button:disabled {
          opacity: 0.34;
          cursor: not-allowed;
        }
        .revision-control span {
          min-width: 38px;
          color: var(--text-muted);
          font-size: 10px;
          text-align: center;
        }
        .revision-control strong {
          display: inline;
          margin-right: 2px;
          color: var(--text-primary);
          font-size: 11px;
        }
        .sync-status {
          display: block;
          margin: 5px 3px 0;
          color: var(--text-muted);
          font-size: 9.5px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }
        .sync-status.is-saving { color: var(--gold-bright); }
        .file-pane {
          min-width: 0;
          min-height: 0;
          padding: clamp(17px, 2.3vw, 25px);
          display: flex;
          flex-direction: column;
        }
        .file-pane-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 15px;
          padding-bottom: 19px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .file-pane-header h2 {
          margin: 0;
          font: 500 clamp(21px, 2vw, 26px)/1.15 var(--font-display);
        }
        .result-pill {
          padding: 7px 11px;
          border-radius: 999px;
          color: var(--gold-bright);
          font-size: 11px;
          font-weight: 700;
          background: rgba(212,168,83,0.09);
          border: 1px solid rgba(212,168,83,0.15);
          white-space: nowrap;
        }
        .paper-list {
          flex: 1;
          max-height: none;
          min-height: 0;
          margin-right: -8px;
          padding: 13px 8px 13px 0;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(212,168,83,0.25) transparent;
        }
        .paper-row {
          min-height: 70px;
          margin-bottom: 7px;
          border: 1px solid rgba(255,255,255,0.055);
          border-radius: 8px;
          padding: 10px 11px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255,255,255,0.025);
          animation: riseIn 260ms var(--ease-out) both;
          animation-delay: calc(var(--paper-index) * 14ms);
          transition: var(--t-fast);
        }
        .paper-row:hover {
          border-color: rgba(255,255,255,0.105);
          background: rgba(255,255,255,0.045);
        }
        .paper-icon {
          width: 42px;
          height: 42px;
          border-radius: 8px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          color: hsl(352, 65%, 70%);
          border: 1px solid rgba(232,114,138,0.16);
          background: rgba(232,114,138,0.08);
        }
        .paper-name {
          flex: 1;
          min-width: 0;
        }
        .paper-name strong {
          display: block;
          color: var(--text-primary);
          font-size: 13.5px;
          line-height: 1.35;
          font-weight: 570;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .paper-name span {
          display: block;
          margin-top: 4px;
          color: var(--text-muted);
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .paper-actions {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .open-paper, .download-paper {
          height: 36px;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          text-decoration: none;
          color: var(--gold-bright);
          background: rgba(212,168,83,0.08);
          border: 1px solid rgba(212,168,83,0.16);
          font-size: 12px;
          font-weight: 650;
          transition: var(--t-fast);
        }
        .open-paper { padding: 0 12px; }
        .download-paper { width: 36px; color: var(--text-secondary); }
        .open-paper:hover, .download-paper:hover {
          color: hsl(42, 90%, 82%);
          border-color: rgba(212,168,83,0.33);
          background: rgba(212,168,83,0.14);
        }
        .no-results {
          min-height: 250px;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 8px;
          color: var(--text-muted);
          text-align: center;
        }
        .no-results strong { color: var(--text-secondary); font-size: 15px; }
        .no-results span { font-size: 13px; }
        .neet-shelf {
          margin-top: 18px;
          padding: clamp(18px, 2.6vw, 28px);
          border: 1px solid rgba(255,255,255,0.085);
          background:
            linear-gradient(180deg, rgba(255,255,255,0.068), rgba(255,255,255,0.025)),
            rgba(6,7,11,0.73);
          box-shadow: 0 20px 58px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07);
          backdrop-filter: blur(20px) saturate(145%);
          border-radius: 10px;
        }
        .neet-toolbar { margin-bottom: 18px; }
        .neet-shelf-head { margin-top: 16px; }
        .neet-shelf-head h2 {
          margin: 4px 0 6px;
          font: 500 25px/1.15 var(--font-display);
          color: var(--text-primary);
        }
        .neet-shelf-head p {
          margin: 0;
          max-width: 560px;
          color: var(--text-secondary);
          font-size: 13.5px;
          line-height: 1.55;
        }
        .neet-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 12px;
        }
        .neet-year {
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 13px 13px 12px;
          background: rgba(255,255,255,0.028);
          animation: riseIn 250ms var(--ease-out) both;
          animation-delay: calc(var(--folder-index) * 16ms);
        }
        .neet-year.is-complete {
          border-color: rgba(77,200,125,0.28);
          background: rgba(77,200,125,0.05);
        }
        .neet-year-top {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--success);
          margin-bottom: 8px;
        }
        .neet-year-top strong {
          flex: 1;
          color: var(--text-primary);
          font-size: 14px;
        }
        .neet-year-top .sync-status { margin: 0; }
        .neet-practice {
          margin-top: 10px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border-radius: 7px;
          text-decoration: none;
          color: var(--success);
          background: rgba(77,200,125,0.08);
          border: 1px solid rgba(77,200,125,0.2);
          font-size: 12px;
          font-weight: 650;
          transition: var(--t-fast);
        }
        .neet-practice:hover {
          background: rgba(77,200,125,0.15);
          border-color: rgba(77,200,125,0.35);
        }
        :global(html[data-theme="light"]) .neet-shelf {
          border-color: rgba(70,45,24,0.11);
          background: rgba(255,251,242,0.73);
          box-shadow: 0 18px 50px rgba(70,45,24,0.1), inset 0 1px 0 rgba(255,255,255,0.8);
        }
        :global(html[data-theme="light"]) .neet-year {
          border-color: rgba(70,45,24,0.1);
          background: rgba(255,255,255,0.44);
        }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }
        :global(html[data-theme="light"]) .archive-background {
          background:
            radial-gradient(circle at 18% 6%, rgba(169,112,52,0.13), transparent 27%),
            radial-gradient(circle at 82% 18%, rgba(91,156,245,0.08), transparent 28%),
            repeating-linear-gradient(90deg, rgba(70,45,24,0.028) 0 1px, transparent 1px 76px),
            repeating-linear-gradient(0deg, rgba(70,45,24,0.022) 0 1px, transparent 1px 76px),
            var(--bg-base);
        }
        :global(html[data-theme="light"]) .archive-hero,
        :global(html[data-theme="light"]) .cabinet,
        :global(html[data-theme="light"]) .explorer-shell,
        :global(html[data-theme="light"]) .empty-folder {
          border-color: rgba(70,45,24,0.11);
          background: rgba(255,251,242,0.73);
          box-shadow: 0 18px 50px rgba(70,45,24,0.1), inset 0 1px 0 rgba(255,255,255,0.8);
        }
        :global(html[data-theme="light"]) .collection-folder,
        :global(html[data-theme="light"]) .paper-row,
        :global(html[data-theme="light"]) .archive-overview div,
        :global(html[data-theme="light"]) .search-box,
        :global(html[data-theme="light"]) .back-button {
          border-color: rgba(70,45,24,0.1);
          background-color: rgba(255,255,255,0.44);
        }
        :global(html[data-theme="light"]) .year-rail {
          border-color: rgba(70,45,24,0.08);
          background: rgba(70,45,24,0.025);
        }
        :global(html[data-theme="light"]) .progress-controls {
          border-color: rgba(70,45,24,0.08);
        }
        :global(html[data-theme="light"]) .check-box,
        :global(html[data-theme="light"]) .revision-control {
          border-color: rgba(70,45,24,0.14);
          background: rgba(255,255,255,0.48);
        }
        @media (max-width: 980px) {
          .archive-hero { flex-wrap: wrap; }
          .archive-overview { width: 100%; margin-top: 7px; }
          .explorer-shell { grid-template-columns: 1fr; height: auto; }
          .year-rail {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            overflow-y: hidden;
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .year-rail-head { min-width: 206px; max-width: 206px; }
          .year-folder { min-width: 280px; margin: 0; }
          .file-pane { display: block; }
          .paper-list { min-height: 270px; }
        }
        @media (max-width: 640px) {
          .archive-page { padding: 16px; padding-bottom: 92px; }
          .archive-hero { align-items: flex-start; }
          .archive-heading { flex-basis: calc(100% - 74px); }
          .archive-overview {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            overflow: visible;
          }
          .archive-overview div { min-width: 0; }
          .collection-grid { grid-template-columns: 1fr; }
          .explorer-toolbar { flex-direction: column; align-items: stretch; }
          .year-rail {
            display: block;
            max-height: 410px;
            overflow-x: hidden;
            overflow-y: auto;
          }
          .year-rail-head { min-width: 0; max-width: none; }
          .year-folder { min-width: 0; margin-bottom: 7px; }
          .paper-row { align-items: flex-start; flex-wrap: wrap; }
          .paper-name { width: calc(100% - 54px); flex: none; }
          .paper-actions { width: 100%; padding-left: 54px; }
          .open-paper { flex: 1; }
          .neet-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 480px) {
          .neet-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
