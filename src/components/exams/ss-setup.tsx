"use client";

import { useEffect, useState } from "react";

import { NEET_SS_GROUPS } from "@/data/exams/neet-ss";
import type { SsChoice } from "@/lib/exams/syllabus";

/**
 * Pick the NEET-SS question-paper group (official NBEMS list) and, optionally,
 * up to four DM/MCh/DrNB courses you are aiming at. The paper's marks follow
 * the group; the courses add their own chapters for depth.
 */
export function SsSetup({ value, onSave, saving }: { value: SsChoice | null | undefined; onSave: (v: SsChoice) => void; saving: boolean }) {
  const [group, setGroup] = useState(value?.group ?? NEET_SS_GROUPS[0].key);
  const [specs, setSpecs] = useState<string[]>(value?.specialties ?? []);
  useEffect(() => {
    setGroup(value?.group ?? NEET_SS_GROUPS[0].key);
    setSpecs(value?.specialties ?? []);
  }, [value?.group, value?.specialties]);
  const g = NEET_SS_GROUPS.find((x) => x.key === group) ?? NEET_SS_GROUPS[0];
  const toggle = (k: string) => setSpecs((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= 4 ? s : [...s, k]));
  const dirty = group !== value?.group || specs.join() !== (value?.specialties ?? []).join();
  const courses = g.courses.filter((c) => c.subject);

  return (
    <div className="xw-card">
      <h2>Your group &amp; courses</h2>
      <p className="xw-sub">
        {g.exception
          ? <>The {g.name} paper asks only from the topics of {g.courses[0]?.name} (NBEMS NEET-SS 2025 bulletin, Table 2).</>
          : <>All 150 questions come from the PG-exit curriculum of <b>{g.feeder}</b> — its general part and every sub-specialty part (NBEMS NEET-SS 2025 bulletin, Table 1). Pick the courses you want; their chapters are added for depth and carry no paper marks.</>}
      </p>
      <div className="xw-form">
        <select className="xw-select" value={group} onChange={(e) => { setGroup(e.target.value); setSpecs([]); }} aria-label="SS question-paper group">
          {NEET_SS_GROUPS.map((x) => <option key={x.key} value={x.key}>{x.name} — {x.exception ? "own paper" : `feeder ${x.feeder}`}</option>)}
        </select>
        {courses.length ? (
          <div className="xw-subjtabs" style={{ flexWrap: "wrap" }}>
            {courses.map((c, i) => (
              <button key={c.key} type="button" aria-pressed={specs.includes(c.key)} onClick={() => toggle(c.key)} style={{ "--h": (g.hue + 40 + i * 47) % 360 } as React.CSSProperties}>
                <i />{c.name}
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="xw-btn is-primary" disabled={!dirty || saving} onClick={() => onSave({ group, specialties: specs })}>
            {saving ? "Saving…" : "Use this selection"}
          </button>
          {courses.length ? <span className="xw-sub" style={{ margin: 0 }}>{specs.length}/4 courses</span> : null}
        </div>
      </div>
    </div>
  );
}
