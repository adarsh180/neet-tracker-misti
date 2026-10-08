"use client";

import { useEffect, useState } from "react";

import { NEET_SS_GROUPS } from "@/data/exams/neet-ss";
import type { SsChoice } from "@/lib/exams/syllabus";

/** Pick the SS group (from the feeder degree) and up to four super-specialties. Every metric follows. */
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

  return (
    <div className="xw-card">
      <h2>Your group & specialties</h2>
      <p className="xw-sub">Choose the group your PG degree feeds into, then up to four DM/MCh courses. ~40% of the paper comes from the feeder ({g.feeder.name}), ~60% from the courses you pick.</p>
      <div className="xw-form">
        <select className="xw-select" value={group} onChange={(e) => { setGroup(e.target.value); setSpecs([]); }} aria-label="SS group">
          {NEET_SS_GROUPS.map((x) => <option key={x.key} value={x.key}>{x.name} — feeder {x.feeder.name}</option>)}
        </select>
        <div className="xw-subjtabs" style={{ flexWrap: "wrap" }}>
          {g.specialties.map((s, i) => (
            <button key={s.key} type="button" aria-pressed={specs.includes(s.key)} onClick={() => toggle(s.key)} style={{ "--h": (g.hue + 40 + i * 47) % 360 } as React.CSSProperties}>
              <i />{s.degree} {s.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="xw-btn is-primary" disabled={!dirty || saving || !specs.length} onClick={() => onSave({ group, specialties: specs })}>
            {saving ? "Saving…" : "Use this selection"}
          </button>
          <span className="xw-sub" style={{ margin: 0 }}>{specs.length}/4 selected</span>
        </div>
      </div>
    </div>
  );
}
