"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

import { ACTIVITIES, type WorkspaceMetrics } from "@/lib/exams/metrics";

const ACT_VAR: Record<string, string> = { study: "var(--x-a1)", revision: "var(--x-a2)", practice: "var(--x-a3)", test: "var(--pl-ink-3)" };
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m` : `${Math.round(min)}m`);
const ago = (iso: string | null) => {
  if (!iso) return "never revised";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "revised today" : `revised ${d}d ago`;
};

/** 30 days of minutes, stacked by what the time was spent on, against the daily target. */
export function TimeStack({ m, hoursTarget }: { m: WorkspaceMetrics; hoursTarget: number }) {
  const [hot, setHot] = useState<number | null>(null);
  const totals = m.daily.map((d) => d.study + d.revision + d.practice + d.test);
  const top = Math.max(hoursTarget * 60, ...totals, 60);
  const W = 600;
  const H = 180;
  const bw = W / m.daily.length;
  const y = (v: number) => H - (v / top) * (H - 12);
  const all = Object.values(m.byActivity).reduce((s, x) => s + x, 0);
  const h = hot === null ? null : m.daily[hot];
  return (
    <div className="xw-time">
      <div className="xw-time-read">
        {h ? (
          <><b>{new Date(`${h.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</b><span>{hm(totals[hot!])}{totals[hot!] ? ` — ${ACTIVITIES.filter((a) => h[a.key]).map((a) => `${a.label.toLowerCase()} ${hm(h[a.key])}`).join(", ")}` : " — nothing logged"}</span></>
        ) : (
          <><b>{hm(m.minutes28)}</b><span>in the last 28 days · {m.hoursPerDay.toFixed(1)}h a day against {hoursTarget}h</span></>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHot(null)} role="img" aria-label="Minutes per day for 30 days, by activity">
        <line className="tgt" x1="0" x2={W} y1={y(hoursTarget * 60)} y2={y(hoursTarget * 60)} />
        {m.daily.map((d, i) => {
          let acc = 0;
          return (
            <g key={d.date} onMouseEnter={() => setHot(i)} className={hot === i ? "is-hot" : ""} style={{ "--i": i } as CSSProperties}>
              <rect className="hit" x={i * bw} y="0" width={bw} height={H} />
              {ACTIVITIES.map((a) => {
                const v = d[a.key];
                if (!v) return null;
                const y1 = y(acc + v);
                const hgt = y(acc) - y1;
                acc += v;
                return <rect key={a.key} className="seg" x={i * bw + bw * 0.18} width={bw * 0.64} y={y1} height={Math.max(0.5, hgt)} rx="2" fill={ACT_VAR[a.key]} />;
              })}
              {!totals[i] ? <rect className="none" x={i * bw + bw * 0.36} width={bw * 0.28} y={H - 3} height="3" rx="1.5" /> : null}
            </g>
          );
        })}
      </svg>
      <ul className="xw-split">
        {ACTIVITIES.map((a) => (
          <li key={a.key} style={{ "--c": ACT_VAR[a.key], "--s": all ? m.byActivity[a.key] / all : 0 } as CSSProperties}>
            <i />
            <span>{a.label}</span>
            <b>{hm(m.byActivity[a.key])}</b>
            <em>{all ? Math.round((m.byActivity[a.key] / all) * 100) : 0}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How deep revision goes: finished topics by revision count, then what is due now. */
export function RevisionLadder({ m, base }: { m: WorkspaceMetrics; base: string }) {
  const labels = ["Never revised", "Once", "Twice", "3 times +"];
  const max = Math.max(1, ...m.ladder);
  return (
    <div className="xw-ladder">
      <div className="xw-ladder-steps">
        {m.ladder.map((n, i) => (
          <div key={i} className="step" style={{ "--v": n / max, "--i": i } as CSSProperties}>
            <span className="bar"><i /></span>
            <b>{n}</b>
            <small>{labels[i]}</small>
          </div>
        ))}
      </div>
      <p className="xw-ladder-meta">
        <span><b>{hm(m.revisionMinutes28)}</b> revising in 28 days</span>
        <span>confidence <b>{m.avgConfidence === null ? "—" : `${m.avgConfidence.toFixed(1)}/5`}</b></span>
        <span>gaps 3 · 7 · 21 · 45 · 90 days</span>
      </p>
      {m.dueItems.length ? (
        <ul className="xw-due">
          {m.dueItems.slice(0, 7).map((d) => (
            <li key={d.key} style={{ "--h": d.hue } as CSSProperties}>
              <i />
              <span><b>{d.label}</b><small>{d.chapter} · {ago(d.lastRevisedAt)}</small></span>
              <Link href={`${base}/syllabus?open=${encodeURIComponent(d.chapterKey)}`} className="xw-btn is-sm">Revise</Link>
            </li>
          ))}
          {m.dueItems.length > 7 ? <li className="more">+{m.dueItems.length - 7} more due</li> : null}
        </ul>
      ) : (
        <div className="xw-empty"><b>Nothing due</b>Finished topics come due 3, 7, 21, 45 and 90 days after each revision.</div>
      )}
    </div>
  );
}

/** Where the time went vs where the marks are. Over-invested rows tilt one way, neglected ones the other. */
export function Allocation({ m, onPick }: { m: WorkspaceMetrics; onPick?: (key: string) => void }) {
  const rows = [...m.allocation].sort((a, b) => b.marksShare - a.marksShare);
  const max = Math.max(0.0001, ...rows.map((r) => Math.max(r.marksShare, r.timeShare)));
  return (
    <div className="xw-alloc">
      <div className="xw-alloc-head"><span /><span>covered</span><span>paper share <i className="k-m" /> vs your time <i className="k-t" /></span></div>
      {rows.map((r, i) => {
        const tilt = m.allocMinutes ? r.timeShare - r.marksShare : 0;
        const Tag = onPick ? "button" : "div";
        return (
          <Tag key={r.key} type={onPick ? "button" : undefined} className="xw-alloc-row" onClick={onPick ? () => onPick(r.key) : undefined} style={{ "--h": r.hue, "--d": r.done, "--m": r.marksShare / max, "--t": r.timeShare / max, "--i": i } as CSSProperties}>
            <span className="nm"><b>{r.name}</b><small>~{r.marks.toFixed(r.marks < 10 ? 1 : 0)} marks · {hm(r.minutes)}</small></span>
            <span className="cov"><i /><em>{Math.round(r.done * 100)}%</em></span>
            <span className="share">
              <i className="m" />
              <i className="t" />
              {m.allocMinutes && Math.abs(tilt) >= 0.03 ? <em className={tilt > 0 ? "over" : "under"}>{tilt > 0 ? "+" : "−"}{Math.round(Math.abs(tilt) * 100)}</em> : null}
            </span>
          </Tag>
        );
      })}
      {!m.allocMinutes ? <p className="xw-sub" style={{ margin: "10px 0 0" }}>Log sessions with a chapter and the time bars appear next to what each one is worth.</p> : null}
    </div>
  );
}

/** Test level per subject, from subject tests tagged on the Tests tab. */
export function SubjectTests({ m, onPick }: { m: WorkspaceMetrics; onPick?: (key: string) => void }) {
  const target = m.targets[0]?.share ?? 0.6;
  if (!m.bySubject.length) return <div className="xw-empty"><b>No subject tests yet</b>Tag a test with its subject on the Tests tab and each subject gets its own level here.</div>;
  return (
    <div className="xw-subtests" style={{ "--tg": target } as CSSProperties}>
      {m.bySubject.map((s, i) => (
        <button key={s.key} type="button" onClick={() => onPick?.(s.key)} style={{ "--h": s.hue, "--v": s.share ?? 0, "--i": i } as CSSProperties} className={(s.share ?? 0) >= target ? "is-ok" : ""}>
          <span><b>{s.name}</b><small>{s.tests} test{s.tests === 1 ? "" : "s"}</small></span>
          <span className="bar"><i /><u /></span>
          <em>{Math.round((s.share ?? 0) * 100)}%</em>
        </button>
      ))}
      <p className="xw-legend"><span><i style={{ background: "var(--x-a2)", width: 2 }} />target ~{Math.round(target * 100)}% of max</span></p>
    </div>
  );
}
