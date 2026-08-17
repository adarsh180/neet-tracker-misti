"use client";

import {
  ArrowRight, Atom, BookOpen, ChevronDown, ChevronUp, CornerDownLeft,
  GraduationCap, Leaf, Loader2, Mic, Microscope, Search, Sparkles, X, Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CHAPTERS, SUBJECT_SLUGS } from "@/data/syllabus/neet-chapters";
import { SITE_ASSISTANT_OPEN_EVENT } from "@/lib/site-assistant";

type SearchResult = {
  id: string;
  type: "SUBJECT" | "CHAPTER" | "TOPIC";
  title: string;
  subtitle: string;
  href: string;
};

const QUICK_JUMPS = [
  { label: "Physics", href: "/subjects/physics", icon: Zap, accent: "#5b9cf5" },
  { label: "Chemistry", href: "/subjects/chemistry", icon: Atom, accent: "#b680d9" },
  { label: "Botany", href: "/subjects/botany", icon: Leaf, accent: "#5cc87d" },
  { label: "Zoology", href: "/subjects/zoology", icon: Microscope, accent: "#e59b63" },
];

function getLocalResults(query: string): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const subjects: SearchResult[] = SUBJECT_SLUGS
    .map((slug) => ({ slug, label: slug[0].toUpperCase() + slug.slice(1) }))
    .filter((entry) => entry.label.toLowerCase().includes(needle))
    .map((entry) => ({
      id: `subject:${entry.slug}`,
      type: "SUBJECT",
      title: entry.label,
      subtitle: "Open subject workspace",
      href: `/subjects/${entry.slug}`,
    }));

  const chapters: SearchResult[] = CHAPTERS
    .filter((entry) => `${entry.subject} ${entry.chapter} ${entry.aliases.join(" ")}`.toLowerCase().includes(needle))
    .slice(0, 12)
    .map((entry) => ({
      id: `chapter:${entry.slug}:${entry.classLevel}:${entry.chapter}`,
      type: "CHAPTER",
      title: entry.chapter,
      subtitle: `Class ${entry.classLevel} · ${entry.subject}`,
      href: `/subjects/${entry.slug}?chapter=${encodeURIComponent(entry.chapter)}`,
    }));

  return [...subjects, ...chapters];
}

function mergeResults(local: SearchResult[], remote: SearchResult[]) {
  const seen = new Set<string>();
  return [...local, ...remote].filter((result) => {
    if (seen.has(result.id)) return false;
    seen.add(result.id);
    return true;
  }).slice(0, 24);
}

function ResultIcon({ type }: { type: SearchResult["type"] }) {
  if (type === "SUBJECT") return <GraduationCap size={18} />;
  if (type === "TOPIC") return <Sparkles size={17} />;
  return <BookOpen size={18} />;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return text;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + needle.length)}</mark>{text.slice(index + needle.length)}</>;
}

export default function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const close = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setSelectedIndex(0);
      return;
    }
    const localResults = getLocalResults(query);
    setResults(localResults);
    setSelectedIndex(0);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json();
        if (response.ok) {
          const remoteResults = Array.isArray(payload.results) ? payload.results as SearchResult[] : [];
          setResults(mergeResults(localResults, remoteResults));
          setSelectedIndex(0);
        }
      } catch {
        // Local subject and chapter matches remain usable if the request is
        // cancelled by fast typing or the database-backed topic search fails.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      resultRefs.current[selectedIndex]?.click();
    }
  };

  const openAssistant = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent(SITE_ASSISTANT_OPEN_EVENT));
  };

  let body: ReactNode;
  if (query.trim().length < 2) {
    body = <div className="search-welcome">
      <div className="welcome-copy"><span>Quick jump</span><p>Search the complete NEET syllabus or open a subject workspace.</p></div>
      <div className="quick-grid">{QUICK_JUMPS.map((item) => <a key={item.label} href={item.href} style={{ "--accent": item.accent } as CSSProperties} onClick={close}><span><item.icon size={18} /></span><strong>{item.label}</strong><ArrowRight size={15} /></a>)}</div>
    </div>;
  } else if (!loading && results.length === 0) {
    body = <div className="empty-state"><Search size={22} /><strong>No syllabus match</strong><p>Try a chapter name, topic, class or subject.</p></div>;
  } else {
    body = <div className="result-list" role="listbox" aria-label="Syllabus search results">
      <div className="result-summary"><span>Best matches</span><em>{results.length} result{results.length === 1 ? "" : "s"}</em></div>
      {results.map((result, index) => <a key={result.id} ref={(node) => { resultRefs.current[index] = node; }} href={result.href} role="option" aria-selected={selectedIndex === index} className={selectedIndex === index ? "active" : ""} onMouseEnter={() => setSelectedIndex(index)} onClick={close}>
        <span className={`result-icon result-icon--${result.type.toLowerCase()}`}><ResultIcon type={result.type} /></span>
        <span className="result-copy"><strong><HighlightMatch text={result.title} query={query} /></strong><small>{result.subtitle}</small></span>
        <span className="result-kind">{result.type.toLowerCase()}<ArrowRight size={14} /></span>
      </a>)}
    </div>;
  }

  return <>
    <div className="global-search-dock">
    <button className="global-search-trigger" onClick={() => setOpen(true)} aria-label="Search subjects, chapters and topics">
      <span className="trigger-icon"><Search size={17} /></span>
      <span className="trigger-copy"><small>Find anything</small><strong>Search syllabus</strong></span>
    </button>
    <button className="global-voice-trigger" onClick={openAssistant} aria-label="Open voice assistant" title="Voice assistant"><Mic size={18} /></button>
    </div>

    {open && <div className="global-search-backdrop" role="presentation" onMouseDown={close}>
      <section className="global-search-dialog" role="dialog" aria-modal="true" aria-label="Search syllabus" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-kicker"><span><Sparkles size={13} /> NEET Navigator</span><button onClick={close} aria-label="Close search"><X size={16} /></button></div>
        <div className="global-search-field"><Search size={22} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onInputKeyDown} placeholder="Search chapters, subjects and topics..." aria-label="Search chapters, subjects and topics" aria-controls="global-search-results" aria-autocomplete="list" />{loading && <Loader2 size={18} className="spin" />}<button type="button" onClick={openAssistant} aria-label="Open voice assistant"><Mic size={18} /></button></div>
        <div id="global-search-results" className="global-search-results">{body}</div>
        <footer><span><ChevronUp size={13} /><ChevronDown size={13} /> Select</span><span><CornerDownLeft size={13} /> Open</span><span><kbd>Esc</kbd> Close</span></footer>
      </section>
    </div>}

    <style jsx>{`
      .global-search-dock{position:fixed;top:16px;left:50%;z-index:820;display:flex;align-items:stretch;gap:2px;width:min(430px,calc(100vw - 190px));padding:5px;border:1px solid color-mix(in srgb,var(--glass-border) 76%,var(--gold) 24%);border-radius:21px;background:linear-gradient(145deg,color-mix(in srgb,var(--bg-surface) 93%,transparent),color-mix(in srgb,var(--bg-elevated) 84%,transparent));box-shadow:0 16px 48px rgba(0,0,0,.3),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(24px) saturate(155%);transform:translateX(-50%)}.global-search-trigger{display:grid;grid-template-columns:38px 1fr;align-items:center;gap:10px;min-width:0;flex:1;min-height:48px;padding:5px 10px 5px 5px;border:0;border-radius:15px;background:transparent;color:var(--text-primary);cursor:pointer;text-align:left;transition:background .2s ease,box-shadow .2s ease}.global-search-trigger:hover{background:linear-gradient(90deg,var(--gold-dim),color-mix(in srgb,var(--bg-hover) 72%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--gold) 20%,transparent)}.global-voice-trigger{width:46px;display:grid;place-items:center;flex:none;border:0;border-radius:13px;background:transparent;color:#cbc5ff;cursor:pointer;transition:background .2s ease,color .2s ease,transform .2s ease}.global-voice-trigger:hover{transform:translateY(-1px);background:color-mix(in srgb,#cbc5ff 10%,transparent);color:#dedaff}.global-voice-trigger.listening{background:color-mix(in srgb,#cbc5ff 18%,transparent);color:#d9f0ff;animation:voicePulse 1.3s ease-in-out infinite}.trigger-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(145deg,var(--gold-dim),color-mix(in srgb,var(--gold-dim) 45%,transparent));color:var(--gold);border:1px solid color-mix(in srgb,var(--gold) 24%,transparent)}.trigger-copy{min-width:0}.trigger-copy small,.trigger-copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.trigger-copy small{font-size:8px;letter-spacing:.11em;text-transform:uppercase;color:var(--text-muted)}.trigger-copy strong{margin-top:2px;font-size:12px;letter-spacing:-.01em}
      .global-search-backdrop{position:fixed;inset:0;z-index:1300;display:grid;place-items:start center;padding:9vh 18px 24px;background:radial-gradient(circle at 50% 12%,rgba(212,168,83,.08),transparent 32%),rgba(2,3,7,.72);backdrop-filter:blur(18px) saturate(130%)}.global-search-dialog{width:min(720px,100%);overflow:hidden;border:1px solid color-mix(in srgb,var(--glass-border) 78%,var(--gold) 22%);border-radius:26px;background:linear-gradient(155deg,color-mix(in srgb,var(--bg-surface) 96%,transparent),color-mix(in srgb,var(--bg-elevated) 90%,transparent));box-shadow:0 38px 110px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.06)}.dialog-kicker{display:flex;align-items:center;justify-content:space-between;padding:13px 17px 7px;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.dialog-kicker span{display:flex;align-items:center;gap:6px}.dialog-kicker button{width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--text-muted);cursor:pointer}.dialog-kicker button:hover{background:var(--bg-hover);color:var(--text-primary)}.global-search-field{display:flex;align-items:center;gap:13px;margin:0 14px 14px;padding:15px 16px;border:1px solid var(--glass-border);border-radius:17px;background:color-mix(in srgb,var(--bg-base) 48%,transparent);color:var(--gold);box-shadow:inset 0 1px 10px rgba(0,0,0,.1)}.global-search-field:focus-within{border-color:color-mix(in srgb,var(--gold) 48%,var(--glass-border));box-shadow:0 0 0 3px var(--gold-dim)}.global-search-field input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text-primary);font:650 17px/1.3 inherit;letter-spacing:-.02em}.global-search-field input::placeholder{color:var(--text-muted);font-weight:500}.global-search-field>button{width:34px;height:34px;display:grid;place-items:center;flex:none;border:1px solid color-mix(in srgb,#cbc5ff 28%,var(--glass-border));border-radius:10px;background:color-mix(in srgb,#cbc5ff 8%,transparent);color:#cbc5ff;cursor:pointer}.global-search-field>button.listening{background:linear-gradient(145deg,#b9ddff,#cbc5ff);color:#292340;animation:voicePulse 1.3s ease-in-out infinite}.voice-status{display:flex;align-items:center;gap:7px;margin:-6px 18px 10px;color:var(--text-muted);font-size:10px}.voice-status>span{width:7px;height:7px;border-radius:50%;background:#cbc5ff}.voice-status>span.pulse{animation:voiceDot 1s ease-in-out infinite}.global-search-results{max-height:min(57vh,540px);overflow:auto;border-top:1px solid var(--glass-border);border-bottom:1px solid var(--glass-border);padding:10px}.result-summary{display:flex;justify-content:space-between;padding:5px 10px 9px;color:var(--text-muted);font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.08em}.result-summary em{font-style:normal;font-weight:600;letter-spacing:0;text-transform:none}.result-list>a{width:100%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:11px 12px;border:1px solid transparent;border-radius:15px;color:var(--text-primary);text-align:left;text-decoration:none;transition:background .16s ease,border-color .16s ease,transform .16s ease}.result-list>a.active{background:linear-gradient(90deg,var(--gold-dim),color-mix(in srgb,var(--bg-hover) 70%,transparent));border-color:color-mix(in srgb,var(--gold) 20%,var(--glass-border));transform:translateX(2px)}.result-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--gold-dim);color:var(--gold)}.result-icon--topic{background:color-mix(in srgb,#b680d9 13%,transparent);color:#c69ce4}.result-icon--subject{background:color-mix(in srgb,#5b9cf5 13%,transparent);color:#79adf6}.result-copy strong,.result-copy small{display:block}.result-copy strong{font-size:13px}.result-copy strong :global(mark){padding:0 1px;border-radius:3px;background:color-mix(in srgb,var(--gold) 24%,transparent);color:inherit}.result-copy small{margin-top:4px;color:var(--text-muted);font-size:10px}.result-kind{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-size:9px;font-weight:750;text-transform:uppercase;letter-spacing:.06em}.search-welcome{padding:9px 5px 12px}.welcome-copy{padding:7px 10px 13px}.welcome-copy span{color:var(--gold);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.09em}.welcome-copy p{margin:5px 0 0;color:var(--text-muted);font-size:12px}.quick-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.quick-grid a{--accent:var(--gold);display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:10px;padding:11px;border:1px solid var(--glass-border);border-radius:14px;background:var(--glass-thin);color:var(--text-primary);text-decoration:none}.quick-grid a:hover{border-color:color-mix(in srgb,var(--accent) 42%,var(--glass-border));background:color-mix(in srgb,var(--accent) 8%,var(--glass-thin))}.quick-grid a>span{width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent)}.quick-grid strong{font-size:12px}.quick-grid a>svg{color:var(--text-muted)}.empty-state{display:grid;justify-items:center;padding:44px 18px;color:var(--text-muted);text-align:center}.empty-state strong{margin-top:10px;color:var(--text-secondary);font-size:13px}.empty-state p{margin:5px 0 0;font-size:11px}.global-search-dialog footer{display:flex;align-items:center;gap:18px;padding:10px 16px;color:var(--text-muted);font-size:9px}.global-search-dialog footer span{display:flex;align-items:center;gap:5px}.global-search-dialog footer span:first-child svg+svg{margin-left:-6px}.global-search-dialog footer kbd{font:inherit;padding:2px 5px;border:1px solid var(--glass-border);border-radius:5px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes voicePulse{50%{box-shadow:0 0 0 8px color-mix(in srgb,#cbc5ff 12%,transparent),0 18px 48px rgba(0,0,0,.3)}}@keyframes voiceDot{50%{opacity:.25;transform:scale(.72)}}
      @media(max-width:640px){.global-search-dock{top:calc(10px + env(safe-area-inset-top));width:min(300px,calc(100vw - 130px));padding:4px;border-radius:18px}.global-search-trigger{grid-template-columns:34px 1fr;gap:8px;min-height:44px;padding:5px}.trigger-icon{width:34px;height:34px;border-radius:10px}.trigger-copy small{display:none}.trigger-copy strong{margin:0;font-size:11px}.global-voice-trigger{width:42px;border-radius:12px}.global-search-backdrop{padding:5vh 10px 16px}.global-search-dialog{border-radius:22px}.global-search-field input{font-size:15px}.quick-grid{grid-template-columns:1fr}.result-kind{display:none}.global-search-dialog footer{justify-content:center}}
    `}</style>
    <style jsx global>{`
      .global-search-results .result-summary{display:flex;justify-content:space-between;padding:5px 10px 9px;color:var(--text-muted);font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.08em}.global-search-results .result-summary em{font-style:normal;font-weight:600;letter-spacing:0;text-transform:none}.global-search-results .result-list>a{width:100%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:11px 12px;border:1px solid transparent;border-radius:15px;color:var(--text-primary);text-align:left;text-decoration:none;transition:background .16s ease,border-color .16s ease,transform .16s ease}.global-search-results .result-list>a.active{background:linear-gradient(90deg,var(--gold-dim),color-mix(in srgb,var(--bg-hover) 70%,transparent));border-color:color-mix(in srgb,var(--gold) 20%,var(--glass-border));transform:translateX(2px)}.global-search-results .result-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--gold-dim);color:var(--gold)}.global-search-results .result-icon--topic{background:color-mix(in srgb,#b680d9 13%,transparent);color:#c69ce4}.global-search-results .result-icon--subject{background:color-mix(in srgb,#5b9cf5 13%,transparent);color:#79adf6}.global-search-results .result-copy strong,.global-search-results .result-copy small{display:block}.global-search-results .result-copy strong{font-size:13px}.global-search-results .result-copy strong mark{padding:0 1px;border-radius:3px;background:color-mix(in srgb,var(--gold) 24%,transparent);color:inherit}.global-search-results .result-copy small{margin-top:4px;color:var(--text-muted);font-size:10px}.global-search-results .result-kind{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-size:9px;font-weight:750;text-transform:uppercase;letter-spacing:.06em}.global-search-results .search-welcome{padding:9px 5px 12px}.global-search-results .welcome-copy{padding:7px 10px 13px}.global-search-results .welcome-copy span{color:var(--gold);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.09em}.global-search-results .welcome-copy p{margin:5px 0 0;color:var(--text-muted);font-size:12px}.global-search-results .quick-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.global-search-results .quick-grid a{--accent:var(--gold);display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:10px;padding:11px;border:1px solid var(--glass-border);border-radius:14px;background:var(--glass-thin);color:var(--text-primary);text-decoration:none}.global-search-results .quick-grid a:hover{border-color:color-mix(in srgb,var(--accent) 42%,var(--glass-border));background:color-mix(in srgb,var(--accent) 8%,var(--glass-thin))}.global-search-results .quick-grid a>span{width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--accent)}.global-search-results .quick-grid strong{font-size:12px}.global-search-results .quick-grid a>svg{color:var(--text-muted)}.global-search-results .empty-state{display:grid;justify-items:center;padding:44px 18px;color:var(--text-muted);text-align:center}.global-search-results .empty-state strong{margin-top:10px;color:var(--text-secondary);font-size:13px}.global-search-results .empty-state p{margin:5px 0 0;font-size:11px}
      @media(max-width:640px){.global-search-results .quick-grid{grid-template-columns:1fr}.global-search-results .result-kind{display:none}}
    `}</style>
  </>;
}
