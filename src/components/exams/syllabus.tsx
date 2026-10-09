"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ListChecks, NotebookText, Pencil, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";

import { ChapterSpiral } from "@/components/exams/chapter-spiral";
import { useWorkspace } from "@/components/exams/workspace-context";
import { HeartLoader } from "@/components/pulse/heart-loader";
import { REVISION_GAPS, type RevisionRow } from "@/lib/exams/metrics";
import type { ExamKey, SyllabusNode, TreeChapter, TreeItem, TreeSubject } from "@/lib/exams/syllabus";

const STATES = [
  { v: "todo", label: "To do" },
  { v: "reading", label: "Reading" },
  { v: "done", label: "Done" },
];
const LEVEL = { 1: "subject", 2: "chapter", 3: "topic", 4: "subtopic" } as const;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const fmtDay = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

type Rows = Map<string, { status: string; revisions: number; lastRevisedAt: string | null }>;
type Shared = {
  exam: ExamKey;
  edit: boolean;
  rows: Rows;
  revLogs: Map<string, RevisionRow[]>;
  reviseFor: string | null;
  setReviseFor: (k: string | null) => void;
  historyFor: string | null;
  setHistoryFor: (k: string | null) => void;
  run: (body: Record<string, unknown>) => Promise<boolean>;
  setStatus: (k: string, s: string) => void;
  tick: (key: string, done: boolean) => void;
  subsOf: (chapterKey: string) => SyllabusNode[] | undefined;
  loadSubs: (chapterKey: string, force?: boolean) => Promise<void>;
  saving: boolean;
  showMarks: boolean;
};

/**
 * The syllabus, one subject at a time, four levels deep — subject → chapter →
 * topic → subtopic — every level with its own notes. Anything can be added,
 * renamed, annotated, reordered or removed; removed built-in items wait in a
 * "Removed" list to be restored, your own ones are deleted for good.
 */
export function WorkspaceSyllabus({ exam }: { exam: ExamKey }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviseFor, setReviseFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [subs, setSubs] = useState<Record<string, SyllabusNode[]>>({});
  const [editSubject, setEditSubject] = useState(false);

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

  const loadSubs = useCallback(
    async (chapterKey: string, force = false) => {
      if (!force && subs[chapterKey]) return;
      const res = await fetch(`/api/exams/${exam}?subtopics=${encodeURIComponent(chapterKey)}`, { cache: "no-store" }).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      if (data?.nodes) setSubs((s) => ({ ...s, [chapterKey]: data.nodes as SyllabusNode[] }));
    },
    [exam, subs],
  );

  // Removed (hidden) built-in items under the subject in view, so they can be restored.
  const removedHere = useMemo(() => {
    if (!ws.state) return [] as Array<{ key: string; name: string; level: number }>;
    const nodes = ws.state.records.syllabus.nodes;
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const path = (n: SyllabusNode) => {
      const parts = [n.name];
      let p = n.parent ? byKey.get(n.parent) : undefined;
      while (p && p.level > 1) { parts.unshift(p.name); p = p.parent ? byKey.get(p.parent) : undefined; }
      return parts.join(" › ");
    };
    const subjectKey = ws.subject?.key;
    const under = (k: string) => (subjectKey ? k.startsWith(`${subjectKey}.`) : false);
    const list = nodes.filter((n) => n.hidden && (subjectKey ? under(n.key) : n.level === 1)).map((n) => ({ key: n.key, name: subjectKey ? path(n) : n.name, level: n.level }));
    for (const chapterSubs of Object.values(subs)) for (const n of chapterSubs) if (n.hidden && under(n.key)) list.push({ key: n.key, name: `${byKey.get(n.parent ?? "")?.name ?? ""} › ${n.name}`, level: 4 });
    return list;
  }, [ws.state, ws.subject, subs]);

  if (!ws.state) return ws.error ? <main className="xw-page"><div className="xw-empty"><b>Couldn&apos;t load</b>{ws.error}</div></main> : <HeartLoader label="Opening the syllabus" />;

  const run = async (body: Record<string, unknown>) => {
    setError(null);
    const res = await ws.act(body);
    if (!res.ok) setError(res.error);
    return res.ok;
  };
  // Subtopic tick: optimistic, then the topic follows its checklist.
  const tick = async (key: string, done: boolean) => {
    const put = (itemKey: string, status: string) =>
      ws.setState((s) => {
        if (!s) return s;
        const prev = s.records.progress.find((r) => r.itemKey === itemKey);
        const row = { itemKey, revisions: 0, lastRevisedAt: null, questions: 0, ...prev, status };
        return { ...s, records: { ...s.records, progress: [...s.records.progress.filter((r) => r.itemKey !== itemKey), row] } };
      });
    const before = rows.get(key)?.status ?? "todo";
    put(key, done ? "done" : "todo");
    const res = await ws.act({ action: "subtick", key, done }, { reload: false });
    if (!res.ok) { put(key, before); setError(res.error); return; }
    const t = res.data.topic as { itemKey: string; status: string } | undefined;
    if (t) put(t.itemKey, t.status);
  };
  const stat = (items: TreeItem[]) => {
    const marks = items.reduce((s, i) => s + i.marks, 0);
    const n = items.filter((i) => rows.get(i.key)?.status === "done").length;
    const share = (pick: (i: TreeItem) => boolean) => (marks ? items.reduce((s, i) => s + (pick(i) ? i.marks : 0), 0) / marks : items.length ? items.filter(pick).length / items.length : 0);
    return { d: share((i) => rows.get(i.key)?.status === "done"), r: share((i) => (rows.get(i.key)?.revisions ?? 0) > 0), n };
  };
  const shared: Shared = {
    exam, edit, rows, revLogs, reviseFor, setReviseFor, historyFor, setHistoryFor, run,
    setStatus: async (k, s) => setError(await ws.setStatus(k, s)),
    tick: (k, d) => void tick(k, d),
    subsOf: (c) => subs[c],
    loadSubs,
    saving: ws.saving,
    showMarks: (ws.subject?.marks ?? 1) > 0,
  };
  const restore = async (key: string) => {
    if (!(await run({ action: "node.restore", key }))) return;
    const ch = Object.keys(subs).find((c) => key.startsWith(`${c}.`));
    if (ch) void loadSubs(ch, true);
  };
  const removedList = removedHere.length ? (
    <section className="xw-sect xw-card">
      <h2>Removed</h2>
      <p className="xw-sub">Built-in items you removed count nowhere. Restore one and it counts again.</p>
      <div className="xw-hidden">
        {removedHere.map((h) => (
          <button key={h.key} type="button" className="xw-btn is-sm" onClick={() => void restore(h.key)}><Undo2 size={13} /> {h.name} <small>· {LEVEL[h.level as 1 | 2 | 3 | 4]}</small></button>
        ))}
      </div>
    </section>
  ) : null;

  /* ── No subject in focus: choose one (only one subject is shown at a time) ── */
  if (!ws.subject) {
    return (
      <main className="xw-page">
        <header className="xw-head">
          <span className="xw-kicker">{ws.tree.title} · syllabus</span>
          <h1 className="xw-title">Pick a <em>subject.</em></h1>
          <p className="xw-lede">The syllabus opens one subject at a time — chapters, topics and subtopics, each with your notes. Your choice is shared with every tab; change it any time from the Subject menu at the top.</p>
          {exam === "ss" ? <p className="xw-sub" style={{ marginTop: 8 }}>{ws.tree.note}</p> : null}
        </header>
        {error ? <p className="xw-error" role="alert">{error}</p> : null}
        <div className="xw-pick">
          {ws.tree.subjects.map((s, i) => {
            const st = stat(s.chapters.flatMap((c) => c.items));
            const topics = s.chapters.reduce((a, c) => a + c.items.length, 0);
            return (
              <button key={s.key} type="button" onClick={() => ws.setFocus(s.key)} style={{ "--h": s.hue, "--d": st.d, "--r": 0, "--i": i } as CSSProperties}>
                <i className="dot" />
                <b>{s.name}</b>
                <small>{s.group} · {s.marks ? `~${Math.round(s.marks)} marks · ` : ""}{s.chapters.length} chapters · {topics} topics</small>
                <span className="xw-bar"><i className="d" /></span>
                <em>{Math.round(st.d * 100)}% done · {st.n} topics</em>
              </button>
            );
          })}
        </div>
        <section className="xw-sect xw-card">
          <h2>Add your own subject</h2>
          <p className="xw-sub">{exam === "pg" ? "Give it a weight (share of the paper) to count it in marks; 0 tracks it without marks." : "Your own subjects are tracked alongside the paper; they carry no paper marks."}</p>
          <AddForm kind="subject" placeholder="Subject name" withWeight={exam === "pg"} onAdd={(name, weight) => run({ action: "node.add", parentKey: null, name, weight })} />
        </section>
        {removedList}
      </main>
    );
  }

  const subject = ws.subject;
  const all = stat(subject.chapters.flatMap((c) => c.items));
  const subCount = subject.chapters.reduce((a, c) => a + c.items.reduce((b, i) => b + i.subs, 0), 0);
  const topicCount = subject.chapters.reduce((a, c) => a + c.items.length, 0);

  return (
    <main className="xw-page">
      <header className="xw-head">
        <span className="xw-kicker">{ws.tree.title} · syllabus · {subject.group}</span>
        <h1 className="xw-title">{subject.name}<em>.</em></h1>
        <p className="xw-lede">
          {subject.marks ? `~${Math.round(subject.marks)} of ${ws.tree.totalMarks} marks · ` : "Beyond the paper — tracked for depth · "}
          {subject.chapters.length} chapters · {topicCount} topics · {subCount} subtopics · {Math.round(all.d * 100)}% covered, {Math.round(all.r * 100)}% revised. Revisions come due {REVISION_GAPS.join(", ")} days apart.
        </p>
        {subject.detail && !editSubject ? <p className="xw-note is-lede"><NotebookText size={13} /> {subject.detail}</p> : null}
        <div className="xw-head-tools">
          <button type="button" className={`xw-btn is-sm ${edit ? "is-primary" : ""}`} aria-pressed={edit} onClick={() => setEdit((e) => !e)}><Pencil size={13} /> {edit ? "Done editing" : "Edit syllabus"}</button>
          {edit ? (
            <>
              <button type="button" className="xw-btn is-sm" onClick={() => setEditSubject((v) => !v)}><NotebookText size={13} /> Subject name &amp; notes</button>
              <button
                type="button"
                className="xw-btn is-sm"
                onClick={async () => {
                  const ok = confirm(subject.custom ? `Delete “${subject.name}” with everything in it?` : `Remove “${subject.name}”? You can restore it from the subject list.`);
                  if (ok && (await run({ action: "node.remove", key: subject.key }))) ws.setFocus(null);
                }}
              >
                <Trash2 size={13} /> {subject.custom ? "Delete subject" : "Remove subject"}
              </button>
            </>
          ) : <span className="xw-sub" style={{ margin: 0 }}>Add, rename, annotate, reorder or remove any chapter, topic or subtopic.</span>}
        </div>
        {editSubject ? <NodeEditor name={subject.name} detail={subject.detail} weight={exam === "pg" ? subject.weight : undefined} onSave={async (v) => { if (await run({ action: "node.edit", key: subject.key, ...v })) setEditSubject(false); }} onCancel={() => setEditSubject(false)} /> : null}
      </header>
      {error ? <p className="xw-error" role="alert">{error}</p> : null}

      <section className="xw-card xw-sect">
        <h2>Spiral of {subject.name}</h2>
        <p className="xw-sub">Every chapter is a numbered stretch of one arm, every topic a dot along it: filled = done, half = reading, rings = revisions, a pulse = due now.</p>
        <ChapterSpiral
          subject={subject}
          items={ws.m?.items ?? []}
          onStatus={(k, st) => shared.setStatus(k, st)}
          onOpen={(key) => {
            setOpen((o) => ({ ...o, [key]: true }));
            void loadSubs(key);
            setTimeout(() => document.getElementById(`ch-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
          }}
        />
      </section>

      <section className="xw-card">
        {subject.chapters.map((c, i) => (
          <Chapter
            key={c.key}
            c={c}
            subject={subject}
            index={i}
            count={subject.chapters.length}
            open={open[c.key] ?? false}
            toggle={() => {
              const next = !(open[c.key] ?? false);
              setOpen((o) => ({ ...o, [c.key]: next }));
              if (next) void loadSubs(c.key);
            }}
            stat={stat(c.items)}
            minutes={minutesByChapter.get(c.key) ?? 0}
            s={shared}
          />
        ))}
        <AddForm kind="chapter" placeholder={`Your own ${subject.name} chapter`} onAdd={(name) => run({ action: "node.add", parentKey: subject.key, name })} />
      </section>

      {removedList}
    </main>
  );
}

function Chapter({ c, subject, index, count, open, toggle, stat, minutes, s }: { c: TreeChapter; subject: TreeSubject; index: number; count: number; open: boolean; toggle: () => void; stat: { d: number; r: number; n: number }; minutes: number; s: Shared }) {
  const [editing, setEditing] = useState(false);
  const single = c.items.length === 1 && c.items[0].key === c.key;
  const subs = s.subsOf(c.key);
  return (
    <div className="xw-chapter" id={`ch-${c.key}`}>
      <div className="xw-chapter-head">
        <button type="button" aria-expanded={open} onClick={toggle}>
          <span>
            <b>{c.name}{c.custom ? <span className="xw-pill">yours</span> : null}</b>
            <small>{s.showMarks ? `~${c.marks.toFixed(1)} marks · ` : ""}{stat.n}/{c.items.length} done · {c.items.reduce((a, i) => a + i.subs, 0)} subtopics{minutes ? ` · ${Math.floor(minutes / 60)}h ${minutes % 60}m logged` : ""}</small>
          </span>
          <span className="xw-bar" style={{ "--d": stat.d, "--r": stat.r, "--h": subject.hue } as CSSProperties}><i className="d" /><i className="r" /></span>
          <span className="pct">{Math.round(stat.d * 100)}%</span>
          <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .3s" }} />
        </button>
        {s.edit ? <EditActs label={c.name} custom={c.custom} first={index === 0} last={index === count - 1} onEdit={() => setEditing((v) => !v)} onMove={(dir) => void s.run({ action: "node.move", key: c.key, dir })} onRemove={() => void s.run({ action: "node.remove", key: c.key })} /> : null}
      </div>
      {c.detail && !editing ? <p className="xw-note"><NotebookText size={12} /> {c.detail}</p> : null}
      {editing ? <NodeEditor name={c.name} detail={c.detail} onSave={async (v) => { if (await s.run({ action: "node.edit", key: c.key, ...v })) setEditing(false); }} onCancel={() => setEditing(false)} /> : null}
      {open ? (
        <div className="xw-items">
          {c.items.map((it, i) => (
            <Topic key={it.key} it={it} isChapter={single} chapterKey={c.key} index={i} count={c.items.length} subs={subs?.filter((n) => n.parent === it.key)} loaded={Boolean(subs)} s={s} />
          ))}
          <AddForm kind="topic" placeholder="Your own topic in this chapter" onAdd={(name) => s.run({ action: "node.add", parentKey: c.key, name })} />
        </div>
      ) : null}
    </div>
  );
}

function Topic({ it, isChapter, chapterKey, index, count, subs, loaded, s }: { it: TreeItem; isChapter: boolean; chapterKey: string; index: number; count: number; subs: SyllabusNode[] | undefined; loaded: boolean; s: Shared }) {
  const [editing, setEditing] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const r = s.rows.get(it.key);
  const status = r?.status ?? "todo";
  const history = s.revLogs.get(it.key) ?? [];
  const minutes = history.reduce((a, h) => a + h.minutes, 0);
  const visibleSubs = (subs ?? []).filter((n) => !n.hidden).sort((a, b) => a.ord - b.ord || a.name.localeCompare(b.name));
  const doneSubs = visibleSubs.filter((n) => s.rows.get(n.key)?.status === "done").length;
  const subTotal = loaded ? visibleSubs.length : it.subs;
  return (
    <div className="xw-item" data-s={status}>
      <span>
        <b>{it.label}{it.custom && !isChapter ? <span className="xw-pill">yours</span> : null}</b>
        <small>
          {s.showMarks ? `~${it.marks.toFixed(2)} marks` : "beyond the paper"}
          {r?.lastRevisedAt ? ` · last revised ${fmtDay(r.lastRevisedAt)}` : ""}
          {minutes ? ` · ${minutes} min revising` : ""}
        </small>
        {it.detail && !editing ? <em className="xw-note is-inline"><NotebookText size={11} /> {it.detail}</em> : null}
      </span>
      <span className="acts">
        <span className="xw-seg" role="group" aria-label={`Status of ${it.label}`}>
          {STATES.map((x) => (
            <button key={x.v} type="button" aria-pressed={status === x.v} onClick={() => status !== x.v && s.setStatus(it.key, x.v)}>{x.label}</button>
          ))}
        </span>
        {!isChapter && (subTotal > 0 || s.edit) ? (
          <button type="button" className={`xw-subs-toggle ${showSubs ? "is-open" : ""}`} aria-expanded={showSubs} onClick={() => setShowSubs((v) => !v)} aria-label={`Subtopics of ${it.label}`} style={{ "--p": subTotal ? doneSubs / subTotal : 0 } as CSSProperties}>
            <ListChecks size={13} /> {loaded ? `${doneSubs}/${subTotal}` : subTotal}
          </button>
        ) : null}
        <button type="button" className="xw-rev" aria-expanded={s.reviseFor === it.key} onClick={() => s.setReviseFor(s.reviseFor === it.key ? null : it.key)} aria-label={`Log a revision of ${it.label}`}>
          <RotateCcw size={12} /> Revise <b>×{r?.revisions ?? 0}</b>
        </button>
        {history.length ? <button type="button" className="xw-btn is-sm" aria-expanded={s.historyFor === it.key} onClick={() => s.setHistoryFor(s.historyFor === it.key ? null : it.key)}>History</button> : null}
        {s.edit && !isChapter ? <EditActs label={it.label} custom={it.custom} first={index === 0} last={index === count - 1} onEdit={() => setEditing((v) => !v)} onMove={(dir) => void s.run({ action: "node.move", key: it.key, dir })} onRemove={() => void s.run({ action: "node.remove", key: it.key })} /> : null}
      </span>
      {editing ? <NodeEditor name={it.label} detail={it.detail} onSave={async (v) => { if (await s.run({ action: "node.edit", key: it.key, ...v })) setEditing(false); }} onCancel={() => setEditing(false)} /> : null}
      {showSubs && !isChapter ? (
        <div className="xw-subs">
          {!loaded ? <p className="xw-sub">Loading subtopics…</p> : null}
          {visibleSubs.map((n, i) => <Subtopic key={n.key} n={n} index={i} count={visibleSubs.length} chapterKey={chapterKey} s={s} />)}
          <AddForm
            kind="subtopic"
            placeholder="Add a subtopic"
            onAdd={async (name) => {
              const ok = await s.run({ action: "node.add", parentKey: it.key, name });
              if (ok) await s.loadSubs(chapterKey, true);
              return ok;
            }}
          />
        </div>
      ) : null}
      {s.reviseFor === it.key ? <ReviseForm saving={s.saving} onSave={async (v) => { if (await s.run({ action: "revision", itemKey: it.key, ...v })) s.setReviseFor(null); }} onCancel={() => s.setReviseFor(null)} /> : null}
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

function Subtopic({ n, index, count, chapterKey, s }: { n: SyllabusNode; index: number; count: number; chapterKey: string; s: Shared }) {
  const [editing, setEditing] = useState(false);
  const done = s.rows.get(n.key)?.status === "done";
  const after = async (body: Record<string, unknown>) => {
    const ok = await s.run(body);
    if (ok) await s.loadSubs(chapterKey, true);
    return ok;
  };
  return (
    <div className={`xw-subrow ${done ? "is-done" : ""}`}>
      <button type="button" className="xw-check" role="checkbox" aria-checked={done} onClick={() => s.tick(n.key, !done)} aria-label={`${n.name} — ${done ? "done" : "not done"}`}>{done ? <Check size={12} strokeWidth={3} /> : null}</button>
      <span>
        <b>{n.name}{n.user ? <span className="xw-pill">yours</span> : null}</b>
        {n.detail && !editing ? <em className="xw-note is-inline"><NotebookText size={11} /> {n.detail}</em> : null}
      </span>
      {s.edit ? <EditActs label={n.name} custom={n.user} first={index === 0} last={index === count - 1} onEdit={() => setEditing((v) => !v)} onMove={(dir) => void after({ action: "node.move", key: n.key, dir })} onRemove={() => void after({ action: "node.remove", key: n.key })} /> : null}
      {editing ? <NodeEditor name={n.name} detail={n.detail} onSave={async (v) => { if (await after({ action: "node.edit", key: n.key, ...v })) setEditing(false); }} onCancel={() => setEditing(false)} /> : null}
    </div>
  );
}

function EditActs({ label, custom, first, last, onEdit, onMove, onRemove }: { label: string; custom: boolean; first: boolean; last: boolean; onEdit: () => void; onMove: (dir: "up" | "down") => void; onRemove: () => void }) {
  return (
    <span className="xw-edit-acts">
      <button type="button" className="xw-btn is-sm" onClick={onEdit} aria-label={`Rename or add notes to ${label}`}><Pencil size={13} /></button>
      <button type="button" className="xw-btn is-sm" disabled={first} onClick={() => onMove("up")} aria-label={`Move ${label} up`}><ArrowUp size={13} /></button>
      <button type="button" className="xw-btn is-sm" disabled={last} onClick={() => onMove("down")} aria-label={`Move ${label} down`}><ArrowDown size={13} /></button>
      <button
        type="button"
        className="xw-btn is-sm"
        onClick={() => confirm(custom ? `Delete “${label}” and everything under it, with its progress?` : `Remove “${label}”? It moves to the Removed list, where you can restore it.`) && onRemove()}
        aria-label={`${custom ? "Delete" : "Remove"} ${label}`}
      >
        <Trash2 size={13} />
      </button>
    </span>
  );
}

function NodeEditor({ name: initialName, detail: initialDetail, weight: initialWeight, onSave, onCancel }: { name: string; detail: string | null; weight?: number; onSave: (v: { name: string; detail: string; weight?: number }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [detail, setDetail] = useState(initialDetail ?? "");
  const [weight, setWeight] = useState(initialWeight ?? 0);
  return (
    <form className="xw-node-edit" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave({ name: name.trim(), detail, ...(initialWeight !== undefined ? { weight } : {}) }); }}>
      <label className="xw-field grow">Name<input className="xw-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      {initialWeight !== undefined ? <label className="xw-field">Weight<input className="xw-input" type="number" min={0} max={100} step={0.5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></label> : null}
      <label className="xw-field full">Notes<textarea className="xw-input" rows={3} maxLength={4000} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Key points, mnemonics, sources, what's high-yield…" /></label>
      <span className="xw-revise-acts">
        <button type="submit" className="xw-btn is-primary is-sm">Save</button>
        <button type="button" className="xw-btn is-sm" onClick={onCancel}>Cancel</button>
      </span>
    </form>
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

function AddForm({ kind, placeholder, withWeight = false, onAdd }: { kind: "subject" | "chapter" | "topic" | "subtopic"; placeholder: string; withWeight?: boolean; onAdd: (name: string, weight?: number) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={`xw-inline xw-add is-${kind}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        if (await onAdd(name.trim(), withWeight ? weight : undefined)) setName("");
        setBusy(false);
      }}
    >
      <Plus size={15} />
      <input className="xw-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={`New ${kind} name`} />
      {withWeight ? <input className="xw-input xw-weight" type="number" min={0} max={100} step={0.5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} aria-label="Weight (share of the paper)" title="Weight — share of the paper" /> : null}
      <button type="submit" className="xw-btn is-sm" disabled={busy || !name.trim()}>{busy ? "Adding…" : `Add ${kind}`}</button>
    </form>
  );
}
