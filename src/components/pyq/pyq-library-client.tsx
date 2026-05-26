"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookMarked,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Search,
} from "lucide-react";

type Paper = {
  id: string;
  year: string;
  title: string;
  fileName: string;
  pathname: string;
  bytes: number;
};

type YearFolder = {
  year: string;
  totalBytes: number;
  papers: Paper[];
};

type JeeCatalog = {
  exam: string;
  firstYear: string | null;
  lastYear: string | null;
  totalPapers: number;
  totalBytes: number;
  years: YearFolder[];
};

type Props = {
  jeeCatalog: JeeCatalog;
  assetBaseUrl: string;
};

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function buildDocumentUrl(baseUrl: string, pathname: string) {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBase) return null;

  const encodedPath = pathname
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${normalizedBase}/${encodedPath}`;
}

export default function PyqLibraryClient({ jeeCatalog, assetBaseUrl }: Props) {
  const [activeArchive, setActiveArchive] = useState<"jee" | "neet" | null>(null);
  const [selectedYear, setSelectedYear] = useState(jeeCatalog.years[0]?.year ?? "");
  const [query, setQuery] = useState("");

  const currentYear = jeeCatalog.years.find((folder) => folder.year === selectedYear);
  const normalizedQuery = query.trim().toLowerCase();

  const visiblePapers = useMemo(() => {
    if (!normalizedQuery) return currentYear?.papers ?? [];

    return jeeCatalog.years
      .flatMap((folder) => folder.papers)
      .filter((paper) => {
        const searchable = `${paper.year} ${paper.title} ${paper.fileName}`.toLowerCase();
        return searchable.includes(normalizedQuery);
      });
  }, [currentYear, jeeCatalog.years, normalizedQuery]);

  const hasDocumentOrigin = Boolean(assetBaseUrl.trim());

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
            <strong>{formatSize(jeeCatalog.totalBytes)}</strong>
            <span>Library size</span>
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
              <Folder size={34} className="folder-icon" />
              <span className="folder-name">NEET</span>
              <span className="folder-caption">A reserved shelf for upcoming papers</span>
              <span className="folder-action">View folder <ArrowUpRight size={15} /></span>
            </button>
          </div>
        </section>
      )}

      {activeArchive === "neet" && (
        <section className="empty-folder">
          <button className="back-button" onClick={() => setActiveArchive(null)} type="button">
            <ArrowLeft size={15} /> All collections
          </button>
          <Folder size={52} />
          <span className="archive-eyebrow">NEET folder</span>
          <h2>This shelf is ready.</h2>
          <p>No NEET PDF folder was present in the supplied archive, so nothing artificial has been placed here.</p>
        </section>
      )}

      {activeArchive === "jee" && (
        <section className="explorer">
          <div className="explorer-toolbar">
            <button className="back-button" onClick={() => { setActiveArchive(null); setQuery(""); }} type="button">
              <ArrowLeft size={15} /> All collections
            </button>
            <label className="search-box">
              <Search size={16} />
              <input
                type="search"
                placeholder="Find a year, date, shift or subject"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          {!hasDocumentOrigin && (
            <div className="delivery-note" role="status">
              Paper index is ready. PDF delivery activates once the Vercel Blob library sync completes.
            </div>
          )}

          <div className="explorer-shell">
            <aside className="year-rail" aria-label="JEE paper years">
              <div className="year-rail-head">
                <span className="archive-eyebrow">JEE Main</span>
                <strong>Year folders</strong>
              </div>
              {jeeCatalog.years.map((folder, index) => {
                const active = !normalizedQuery && folder.year === selectedYear;
                return (
                  <button
                    className={`year-folder ${active ? "is-active" : ""}`}
                    key={folder.year}
                    onClick={() => { setSelectedYear(folder.year); setQuery(""); }}
                    style={{ "--folder-index": index } as CSSProperties}
                    type="button"
                  >
                    {active ? <FolderOpen size={19} /> : <Folder size={19} />}
                    <span>
                      <strong>{folder.year}</strong>
                      <small>{folder.papers.length} files</small>
                    </span>
                    <em>{formatSize(folder.totalBytes)}</em>
                  </button>
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
                  const documentUrl = buildDocumentUrl(assetBaseUrl, paper.pathname);
                  return (
                    <article className="paper-row" key={paper.id} style={{ "--paper-index": Math.min(index, 14) } as CSSProperties}>
                      <div className="paper-icon">
                        <FileText size={20} />
                      </div>
                      <div className="paper-name">
                        <strong>{paper.title}</strong>
                        <span>{paper.year} / PDF / {formatSize(paper.bytes)}</span>
                      </div>
                      <div className="paper-actions">
                        {documentUrl ? (
                          <>
                            <a className="open-paper" href={documentUrl} rel="noreferrer" target="_blank">
                              Open PDF <ArrowUpRight size={14} />
                            </a>
                            <a className="download-paper" href={`${documentUrl}?download=1`} aria-label={`Download ${paper.title}`}>
                              <Download size={15} />
                            </a>
                          </>
                        ) : (
                          <span className="awaiting">Awaiting sync</span>
                        )}
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
        .delivery-note {
          margin-bottom: 14px;
          border: 1px solid rgba(212,168,83,0.18);
          border-radius: 8px;
          padding: 11px 14px;
          font-size: 13px;
          color: var(--text-secondary);
          background: rgba(212,168,83,0.055);
        }
        .explorer-shell {
          display: grid;
          grid-template-columns: 268px minmax(0, 1fr);
          min-height: min(670px, calc(100vh - 260px));
          overflow: hidden;
        }
        .year-rail {
          padding: 20px 13px;
          border-right: 1px solid rgba(255,255,255,0.065);
          background: rgba(255,255,255,0.016);
        }
        .year-rail-head {
          padding: 3px 8px 16px;
        }
        .year-rail-head strong {
          font-size: 17px;
          font-weight: 550;
        }
        .year-folder {
          width: 100%;
          min-height: 52px;
          margin-bottom: 5px;
          border: 1px solid transparent;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 9px;
          background: transparent;
          color: var(--text-secondary);
          text-align: left;
          cursor: pointer;
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
        .year-folder span { flex: 1; min-width: 0; }
        .year-folder strong {
          display: block;
          color: inherit;
          font-size: 14px;
        }
        .year-folder small {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .year-folder em {
          color: var(--text-muted);
          font-style: normal;
          font-size: 10px;
          white-space: nowrap;
        }
        .file-pane {
          min-width: 0;
          padding: clamp(17px, 2.3vw, 25px);
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
          max-height: calc(100vh - 363px);
          min-height: 270px;
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
        .awaiting {
          color: var(--text-muted);
          font-size: 11px;
          padding-right: 6px;
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
        .empty-folder {
          position: relative;
          min-height: 430px;
          margin-top: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 11px;
          color: var(--success);
          text-align: center;
        }
        .empty-folder .back-button {
          position: absolute;
          left: 22px;
          top: 22px;
        }
        .empty-folder h2 {
          color: var(--text-primary);
          margin: 3px 0 0;
          font: 500 27px/1.15 var(--font-display);
        }
        .empty-folder p {
          max-width: 460px;
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.55;
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
        @media (max-width: 980px) {
          .archive-hero { flex-wrap: wrap; }
          .archive-overview { width: 100%; margin-top: 7px; }
          .explorer-shell { grid-template-columns: 1fr; }
          .year-rail {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .year-rail-head { min-width: 122px; }
          .year-folder { min-width: 140px; margin: 0; }
          .paper-list { max-height: none; }
        }
        @media (max-width: 640px) {
          .archive-page { padding: 16px; padding-bottom: 92px; }
          .archive-hero { align-items: flex-start; }
          .archive-heading { flex-basis: calc(100% - 74px); }
          .archive-overview { overflow-x: auto; }
          .archive-overview div { min-width: 106px; }
          .collection-grid { grid-template-columns: 1fr; }
          .explorer-toolbar { flex-direction: column; align-items: stretch; }
          .paper-row { align-items: flex-start; flex-wrap: wrap; }
          .paper-name { width: calc(100% - 54px); flex: none; }
          .paper-actions { width: 100%; padding-left: 54px; }
          .open-paper { flex: 1; }
          .empty-folder .back-button {
            position: static;
            margin: 0 0 30px;
          }
        }
      `}</style>
    </main>
  );
}
