"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { useWorkspace } from "@/components/exams/workspace-context";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { REVISION_GAPS, type RevisionRow } from "@/lib/exams/metrics";
import { buildTree, type ExamKey, type TreeChapter, type TreeItem } from "@/lib/exams/syllabus";

const STATES = [
  { v: "todo", label: "To do" },
  { v: "reading", label: "Reading" },
  { v: "done", label: "Done" },
];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const customId = (key: string) => key.split(".").pop()!.slice(1);
const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

type Rows = Map<string, { status: string; revisions: number; lastRevisedAt: string | null }>;
type Shared = {
  edit: boolean;
  rows: Rows;
  revLogs: Map<string, RevisionRow[]>;
  reviseFor: string | null;
  setReviseFor: (k: string | null) => void;
  historyFor: string | null;
  setHistoryFor: (k: string | null) => void;
  run: (body: Record<string, unknown>) => Promise<boolean>;
  setStatus: (k: string, s: string) => void;
  saving: boolean;
};

export function WorkspaceSyllabus({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviseFor, setReviseFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // Deep link from the dashboard (?open=<chapter>): open it and scroll to it.
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("open");
    if (!key) return;
    setOpen((o) => ({ ...o, [key]: true }));
    const t = setTimeout(() => document.getElementById(`ch-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    return () => clearTimeout(t);
  }, []);

  const rows: Rows = useMemo(() => new Map((ws.state?.records.progress ?? []).map((r) => [r.itemKey, r])), [ws.state]);
  const revLogs = useMemo(() => {
    const map = new Map<string, RevisionRow[]>();
    for (const r of ws.state?.records.revisions ?? []) map.set(r.itemKey, [...(map.get(r.itemKey) ?? []), r]);
    return map;
  }, [ws.state]);
  const minutesByChapter = useMemo(() => new Map((ws.m?.allocation ?? []).map((a) => [a.key, a.minutes])), [ws.m]);
  const hiddenHere = useMemo(() => {
    if (!ws.state || !ws.subject) return [];
    const raw = buildTree(exam, ws.state.prefs, { items: ws.state.records.custom.items, overrides: [] });
    const rawSubject = raw.subjects.find((s) => s.key === ws.subject!.key);
    const names = new Map<string, string>();
    for (const c of rawSubject?.chapters ?? []) {
      names.set(c.key, c.name);
      for (const i of c.items) if (i.key !== c.key) names.set(i.key, `${c.name} › ${i.label}`);
    }
    return ws.state.records.custom.overrides.filter((o) => o.hidden && names.has(o.itemKey)).map((o) => ({ key: o.itemKey, name: names.get(o.itemKey)! }));
  }, [exam, ws.state, ws.subject]);

  if (!ws.state) return ws.error ? <main className="xw-page"><div className="xw-empty"><b>Couldn&apos;t load</b>{ws.error}</div></main> : <HeartLoader label="Opening the syllabus" />;

  const run = async (body: Record<string, unknown>) => {
    setError(null);
    const res = await ws.act(body);
    if (!res.ok) setError(res.error);
    return res.ok;
  };
  const stat = (items: TreeItem[]) => {
    const marks = items.reduce((s, i) => s + i.marks, 0) || 1;
    return {
      d: items.reduce((s, i) => s + (rows.get(i.key)?.status === "done" ? i.marks : 0), 0) / marks,
      r: items.reduce((s, i) => s + ((rows.get(i.key)?.revisions ?? 0) > 0 ? i.marks : 0), 0) / marks,
      n: items.filter((i) => rows.get(i.key)?.status === "done").length,
    };
  };

  /* ── No subject in focus: choose one (only one subject is shown at a time) ── */
  if (!ws.subject) {
    return (
      <main className="xw-page">
        <header className="xw-head">
          <span className="xw-kicker">{ws.tree.title} · syllabus</span>
          <h1 className="xw-title">Pick a <em>subject.</em></h1>
          <p className="xw-lede">The syllabus opens one subject at a time. Your choice is shared with every tab — change it any time from the Subject menu at the top.</p>
        </header>
        <div className="xw-pick">
          {ws.tree.subjects.map((s, i) => {
            const st = stat(s.chapters.flatMap((c) => c.items));
            return (
              <button key={s.key} type="button" onClick={() => ws.setFocus(s.key)} style={{ "--h": s.hue, "--d": st.d, "--r": 0, "--i": i } as CSSProperties}>
                <i className="dot" />
                <b>{s.name}</b>
                <small>{s.group} · ~{Math.round(s.marks)} marks · {s.chapters.length} chapters</small>
                <span className="xw-bar"><i className="d" /></span>
                <em>{Math.round(st.d * 100)}% done · {st.n} topics</em>
              </button>
            );
          })}
        </div>
      </main>
    );
  }

  const subject = ws.subject;
  const all = stat(subject.chapters.flatMap((c) => c.items));
  const shared: Shared = { edit, rows, revLogs, reviseFor, setReviseFor, historyFor, setHistoryFor, run, setStatus: async (k, s) => setError(await ws.setStatus(k, s)), saving: ws.saving };

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">{ws.tree.title} · syllabus · {subject.group}</span>
        <h1 className="xw-title">{subject.name}<em>.</em></h1>
        <p className="xw-lede">
          ~{Math.round(subject.marks)} of {ws.tree.totalMarks} marks · {subject.chapters.length} chapters · {Math.round(all.d * 100)}% covered, {Math.round(all.r * 100)}% revised. Log each revision with its minutes and how sure you felt — the next one comes due {REVISION_GAPS.join(", ")} days later.
        </p>
        <div className="xw-head-tools">
          <button type="button" className={`xw-btn is-sm ${edit ? "is-primary" : ""}`} aria-pressed={edit} onClick={() => setEdit((e) => !e)}><Pencil size={13} /> {edit ? "Done editing" : "Edit syllabus"}</button>
          <span className="xw-sub" style={{ margin: 0 }}>Add your own chapters and topics, rename or hide any — the marks re-share at once.</span>
        </div>
      </header>
      {error ? <p className="xw-error" role="alert">{error}</p> : null}

      <section className="xw-card">
        {subject.chapters.map((c) => (
          <Chapter
            key={c.key}
            c={c}
            hue={subject.hue}
            open={open[c.key] ?? false}
            toggle={() => setOpen((o) => ({ ...o, [c.key]: !(o[c.key] ?? false) }))}
            stat={stat(c.items)}
            minutes={minutesByChapter.get(c.key) ?? 0}
            s={shared}
          />
        ))}
        <AddForm kind="chapter" placeholder={`Your own ${subject.name} chapter`} onAdd={(name) => run({ action: "addChapter", subjectKey: subject.key, name })} />
      </section>

      {hiddenHere.length ? (
        <section className="xw-sect xw-card">
          <h2>Hidden from {subject.name}</h2>
          <p className="xw-sub">Hidden chapters and topics count nowhere. Restore one and it counts again.</p>
          <div className="xw-hidden">
            {hiddenHere.map((h) => (
              <button key={h.key} type="button" className="xw-btn is-sm" onClick={() => void run({ action: "unhide", itemKey: h.key })}><Eye size={13} /> {h.name}</button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Chapter({ c, hue, open, toggle, stat, minutes, s }: { c: TreeChapter; hue: number; open: boolean; toggle: () => void; stat: { d: number; r: number; n: number }; minutes: number; s: Shared }) {
  const [renaming, setRenaming] = useState(false);
  const single = c.items.length === 1 && c.items[0].key === c.key;
  return (
    <div className="xw-chapter" id={`ch-${c.key}`}>
      <div className="xw-chapter-head">
        <button type="button" aria-expanded={open} onClick={toggle}>
          <span>
            <b>{c.name}{c.custom ? <span className="xw-pill">yours</span> : null}</b>
            <small>~{c.marks.toFixed(1)} marks · {stat.n}/{c.items.length} done{minutes ? ` · ${Math.floor(minutes / 60)}h ${minutes % 60}m logged` : ""}</small>
          </span>
          <span className="xw-bar" style={{ "--d": stat.d, "--r": stat.r, "--h": hue } as CSSProperties}><i className="d" /><i className="r" /></span>
          <span className="pct">{Math.round(stat.d * 100)}%</span>
          <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .3s" }} />
        </button>
        {s.edit ? (
          <span className="xw-edit-acts">
            <button type="button" className="xw-btn is-sm" onClick={() => setRenaming((r) => !r)} aria-label={`Rename ${c.name}`}><Pencil size={13} /></button>
            {c.custom ? (
              <button type="button" className="xw-btn is-sm" onClick={() => confirm(`Delete “${c.name}” with its topics and revision history?`) && void s.run({ action: "deleteCustom", id: customId(c.key) })} aria-label={`Delete ${c.name}`}><Trash2 size={13} /></button>
            ) : (
              <button type="button" className="xw-btn is-sm" onClick={() => void s.run({ action: "hide", itemKey: c.key })} aria-label={`Hide ${c.name}`}><EyeOff size={13} /></button>
            )}
          </span>
        ) : null}
      </div>
      {renaming ? <Rename initial={c.name} onSave={async (name) => (await s.run({ action: "rename", itemKey: c.key, name })) && setRenaming(false)} onCancel={() => setRenaming(false)} /> : null}
      {open ? (
        <div className="xw-items">
          {c.items.map((it) => <Topic key={it.key} it={it} isChapter={single} s={s} />)}
          <AddForm kind="topic" placeholder="Your own topic in this chapter" onAdd={(name) => s.run({ action: "addTopic", chapterKey: c.key, name })} />
        </div>
      ) : null}
    </div>
  );
}

function Topic({ it, isChapter, s }: { it: TreeItem; isChapter: boolean; s: Shared }) {
  const [renaming, setRenaming] = useState(false);
  const r = s.rows.get(it.key);
  const status = r?.status ?? "todo";
  const history = s.revLogs.get(it.key) ?? [];
  const minutes = history.reduce((a, h) => a + h.minutes, 0);
  return (
    <div className="xw-item" data-s={status}>
      <span>
        <b>{it.label}{it.custom && !isChapter ? <span className="xw-pill">yours</span> : null}</b>
        <small>
          ~{it.marks.toFixed(2)} marks
          {r?.lastRevisedAt ? ` · last revised ${fmtDay(r.lastRevisedAt)}` : ""}
          {minutes ? ` · ${minutes} min revising` : ""}
        </small>
      </span>
      <span className="acts">
        <span className="xw-seg" role="group" aria-label={`Status of ${it.label}`}>
          {STATES.map((x) => (
            <button key={x.v} type="button" aria-pressed={status === x.v} onClick={() => status !== x.v && s.setStatus(it.key, x.v)}>{x.label}</button>
          ))}
        </span>
        <button type="button" className="xw-rev" aria-expanded={s.reviseFor === it.key} onClick={() => s.setReviseFor(s.reviseFor === it.key ? null : it.key)} aria-label={`Log a revision of ${it.label}`}>
          <RotateCcw size={12} /> Revise <b>×{r?.revisions ?? 0}</b>
        </button>
        {history.length ? <button type="button" className="xw-btn is-sm" aria-expanded={s.historyFor === it.key} onClick={() => s.setHistoryFor(s.historyFor === it.key ? null : it.key)}>History</button> : null}
        {s.edit && !isChapter ? (
          <>
            <button type="button" className="xw-btn is-sm" onClick={() => setRenaming((x) => !x)} aria-label={`Rename ${it.label}`}><Pencil size={13} /></button>
            {it.custom ? (
              <button type="button" className="xw-btn is-sm" onClick={() => confirm(`Delete “${it.label}” and its revision history?`) && void s.run({ action: "deleteCustom", id: customId(it.key) })} aria-label={`Delete ${it.label}`}><Trash2 size={13} /></button>
            ) : (
              <button type="button" className="xw-btn is-sm" onClick={() => void s.run({ action: "hide", itemKey: it.key })} aria-label={`Hide ${it.label}`}><EyeOff size={13} /></button>
            )}
          </>
        ) : null}
      </span>
      {renaming ? <Rename initial={it.label} onSave={async (name) => (await s.run({ action: "rename", itemKey: it.key, name })) && setRenaming(false)} onCancel={() => setRenaming(false)} /> : null}
      {s.reviseFor === it.key ? <ReviseForm saving={s.saving} onSave={async (v) => (await s.run({ action: "revision", itemKey: it.key, ...v })) && s.setReviseFor(null)} onCancel={() => s.setReviseFor(null)} /> : null}
      {s.historyFor === it.key ? (
        <ol className="xw-history">
          {history.map((h, i) => (
            <li key={h.id}>
              <b>#{history.length - i}</b>
              <span>{fmtDay(h.revisedOn)} · {h.minutes} min{h.confidence ? ` · sure ${h.confidence}/5` : ""}{h.note ? ` — ${h.note}` : ""}</span>
              <button type="button" className="xw-btn is-sm" aria-label="Delete this revision" onClick={() => void s.run({ action: "deleteRevision", id: h.id })}><X size={12} /></button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function ReviseForm({ onSave, onCancel, saving }: { onSave: (v: { revisedOn: string; minutes: number; confidence: number | null; note: string }) => void; onCancel: () => void; saving: boolean }) {
  const [revisedOn, setOn] = useState(today());
  const [minutes, setMinutes] = useState(30);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [note, setNote] = useState("");
  return (
    <form className="xw-revise" onSubmit={(e) => { e.preventDefault(); onSave({ revisedOn, minutes, confidence, note }); }}>
      <label className="xw-field">Date<input className="xw-input" type="date" value={revisedOn} max={today()} onChange={(e) => setOn(e.target.value)} /></label>
      <label className="xw-field">Minutes<input className="xw-input" type="number" min={0} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>
      <span className="xw-field">How sure now?
        <span className="xw-conf" role="group" aria-label="Confidence from 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={confidence === n} onClick={() => setConfidence(confidence === n ? null : n)}>{n}</button>)}
        </span>
      </span>
      <label className="xw-field grow">Note<input className="xw-input" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="What still felt shaky" /></label>
      <span className="xw-revise-acts">
        <button type="submit" className="xw-btn is-primary is-sm" disabled={saving}>Save revision</button>
        <button type="button" className="xw-btn is-sm" onClick={onCancel}>Cancel</button>
      </span>
    </form>
  );
}

function Rename({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  return (
    <form className="xw-inline" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave(name.trim()); }}>
      <input className="xw-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus aria-label="New name" />
      <button type="submit" className="xw-btn is-primary is-sm">Rename</button>
      <button type="button" className="xw-btn is-sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function AddForm({ kind, placeholder, onAdd }: { kind: "chapter" | "topic"; placeholder: string; onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={`xw-inline xw-add is-${kind}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        if (await onAdd(name.trim())) setName("");
        setBusy(false);
      }}
    >
      <Plus size={15} />
      <input className="xw-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={kind === "chapter" ? "New chapter name" : "New topic name"} />
      <button type="submit" className="xw-btn is-sm" disabled={busy || !name.trim()}>{busy ? "Adding…" : kind === "chapter" ? "Add chapter" : "Add topic"}</button>
    </form>
  );
}
