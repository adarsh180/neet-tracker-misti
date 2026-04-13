"use client";

import { useEffect, useState, useCallback, type ComponentType } from "react";
import { format, subDays, eachDayOfInterval, isSameDay } from "date-fns";
import { Save, TrendingUp, Brain, Zap, Heart, CalendarDays, Sparkles } from "lucide-react";

interface MoodEntry {
  id: string;
  date: string;
  mood: string;
  energy: number;
  focus: number;
  stress: number;
  note: string | null;
}

const MOODS = [
  { key: "AMAZING", emoji: "🌟", label: "Amazing", color: "hsl(38,90%,62%)" },
  { key: "GOOD", emoji: "😊", label: "Good", color: "hsl(142,65%,52%)" },
  { key: "OKAY", emoji: "😐", label: "Okay", color: "hsl(200,60%,58%)" },
  { key: "LOW", emoji: "😔", label: "Low", color: "hsl(38,60%,52%)" },
  { key: "TERRIBLE", emoji: "😰", label: "Terrible", color: "hsl(0,64%,58%)" },
];

const MOOD_BG: Record<string, string> = {
  AMAZING: "hsla(38,90%,62%,0.14)",
  GOOD: "hsla(142,65%,52%,0.12)",
  OKAY: "hsla(200,60%,58%,0.12)",
  LOW: "hsla(38,60%,52%,0.10)",
  TERRIBLE: "hsla(0,64%,58%,0.10)",
};

const MOOD_BORDER: Record<string, string> = {
  AMAZING: "hsla(38,90%,62%,0.30)",
  GOOD: "hsla(142,65%,52%,0.28)",
  OKAY: "hsla(200,60%,58%,0.28)",
  LOW: "hsla(38,60%,52%,0.25)",
  TERRIBLE: "hsla(0,64%,58%,0.25)",
};

function SliderInput({
  label,
  value,
  onChange,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon: ComponentType<{ size: number; color?: string }>;
  color: string;
}) {
  return (
    <div className="mood-slider">
      <div className="mood-slider-top">
        <div className="mood-slider-label-wrap">
          <div className="mood-slider-icon">
            <Icon size={14} color={color} />
          </div>
          <span className="mood-slider-label">{label}</span>
        </div>
        <span className="mood-slider-value" style={{ color }}>
          {value}
        </span>
      </div>

      <div className="mood-slider-track">
        <div className="mood-slider-fill" style={{ width: `${value * 10}%`, background: color }} />
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          className="mood-range"
          onChange={(e) => onChange(parseInt(e.target.value))}
        />
      </div>

      <div className="mood-slider-labels">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

export default function MoodPage() {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [form, setForm] = useState({ mood: "", energy: 6, focus: 6, stress: 4, note: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchEntries = useCallback(async () => {
    const res = await fetch("/api/mood?days=30");
    if (res.ok) setEntries(await res.json());
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    const found = entries.find((e) => e.date.split("T")[0] === selectedDate);
    if (found) {
      setForm({
        mood: found.mood,
        energy: found.energy,
        focus: found.focus,
        stress: found.stress,
        note: found.note || "",
      });
    } else {
      setForm({ mood: "", energy: 6, focus: 6, stress: 4, note: "" });
    }
  }, [selectedDate, entries]);

  const handleSave = async () => {
    if (!form.mood) return;
    setSaving(true);
    await fetch("/api/mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selectedDate, ...form }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    fetchEntries();
  };

  const last30 = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() });
  const getEntry = (d: Date) => entries.find((e) => isSameDay(new Date(e.date), d));
  const getMoodObj = (key: string) => MOODS.find((m) => m.key === key);

  const recent = entries.slice(0, 7);
  const avgEnergy = recent.length ? Math.round(recent.reduce((s, e) => s + e.energy, 0) / recent.length) : 0;
  const avgFocus = recent.length ? Math.round(recent.reduce((s, e) => s + e.focus, 0) / recent.length) : 0;
  const avgStress = recent.length ? Math.round(recent.reduce((s, e) => s + e.stress, 0) / recent.length) : 0;

  const currentMoodObj = getMoodObj(form.mood);

  return (
    <div className="mood-page">
      <div className="mood-bg">
        <div className="mood-orb mood-orb-1" />
        <div className="mood-orb mood-orb-2" />
        <div className="mood-orb mood-orb-3" />
        <div className="mood-grid" />
        <div className="mood-vignette" />
      </div>

      <div className="mood-shell animate-fade-in">
        <div className="page-header mood-header">
          <div className="mood-heading">
            <div className="mood-badge">
              <Sparkles size={14} />
              Daily emotional tracking
            </div>
            <h1 className="page-title gradient-text mood-title">Mood Tracker</h1>
            <p className="page-subtitle mood-subtitle">
              Track your daily emotional state and mental energy for study optimisation
            </p>
          </div>

          <div className="mood-date-wrap">
            <div className="mood-date-label">
              <CalendarDays size={14} />
              Select date
            </div>
            <input
              type="date"
              className="input mood-date"
              value={selectedDate}
              max={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </div>

        {recent.length > 0 && (
          <div className="mood-stats grid grid-3 gap-4 mb-6 stagger">
            {[
              { label: "Avg Energy", value: avgEnergy, icon: Zap, color: "var(--gold)" },
              { label: "Avg Focus", value: avgFocus, icon: Brain, color: "var(--lotus-bright)" },
              {
                label: "Avg Stress",
                value: avgStress,
                icon: TrendingUp,
                color: avgStress >= 7 ? "var(--danger)" : "var(--success)",
              },
            ].map((s) => (
              <div key={s.label} className="glass-card mood-stat-card">
                <div className="mood-stat-top">
                  <div
                    className="stat-icon mood-stat-icon"
                    style={{
                      background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${s.color} 25%, transparent)`,
                    }}
                  >
                    <s.icon size={17} style={{ color: s.color }} />
                  </div>
                  <div className="stat-label">{s.label}</div>
                </div>
                <div className="stat-value mood-stat-value" style={{ color: s.color }}>
                  {s.value}
                  <span style={{ fontSize: 16, color: "var(--text-muted)" }}>/10</span>
                </div>
                <div className="stat-sub">Last 7 days</div>
              </div>
            ))}
          </div>
        )}

        <div className="mood-layout">
          <div className="mood-left">
            <div className="glass-card mood-card mood-card-main">
              <div className="mood-card-head">
                <div>
                  <h2 className="mood-section-title">How are you feeling?</h2>
                  <p className="page-subtitle mood-section-subtitle">
                    {format(new Date(selectedDate + "T12:00:00"), "EEEE, d MMMM yyyy")}
                  </p>
                </div>
              </div>

              <div className="mood-pills">
                {MOODS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setForm((f) => ({ ...f, mood: m.key }))}
                    className={`mood-btn ${form.mood === m.key ? "active" : ""}`}
                    style={
                      {
                        "--mood-color": m.color,
                        "--mood-bg": MOOD_BG[m.key],
                        "--mood-border": MOOD_BORDER[m.key],
                      } as React.CSSProperties
                    }
                    type="button"
                  >
                    <span className="mood-btn-emoji">{m.emoji}</span>
                    <span className="mood-btn-label">{m.label}</span>
                  </button>
                ))}
              </div>

              {currentMoodObj && (
                <div
                  className="mood-display animate-scale-in"
                  style={{
                    background: MOOD_BG[form.mood],
                    border: `1px solid ${MOOD_BORDER[form.mood]}`,
                  }}
                >
                  <span className="mood-display-emoji">{currentMoodObj.emoji}</span>
                  <div className="mood-display-copy">
                    <div className="mood-display-title" style={{ color: currentMoodObj.color }}>
                      {currentMoodObj.label}
                    </div>
                    <div className="mood-display-sub">
                      {form.mood === "AMAZING" && "Keep this energy! Study hard today."}
                      {form.mood === "GOOD" && "Great state for learning new topics."}
                      {form.mood === "OKAY" && "Use this time for revision."}
                      {form.mood === "LOW" && "Take a short break, then get back."}
                      {form.mood === "TERRIBLE" && "Rest is part of the journey. Be kind to yourself."}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="glass-card mood-card">
              <h3 className="mood-card-title">Energy & Mental State</h3>
              <div className="mood-slider-stack">
                <SliderInput
                  label="Energy Level"
                  value={form.energy}
                  onChange={(v) => setForm((f) => ({ ...f, energy: v }))}
                  icon={Zap}
                  color="var(--gold)"
                />
                <SliderInput
                  label="Focus Level"
                  value={form.focus}
                  onChange={(v) => setForm((f) => ({ ...f, focus: v }))}
                  icon={Brain}
                  color="var(--lotus-bright)"
                />
                <SliderInput
                  label="Stress Level (1=calm, 10=very stressed)"
                  value={form.stress}
                  onChange={(v) => setForm((f) => ({ ...f, stress: v }))}
                  icon={Heart}
                  color={form.stress >= 7 ? "var(--danger)" : "var(--success)"}
                />
              </div>
            </div>

            <div className="glass-card mood-card">
              <h3 className="mood-card-title">Today's Note (optional)</h3>
              <textarea
                className="input mood-note"
                placeholder="How are you feeling today? What's on your mind?"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>

            <button
              className="btn btn-primary btn-lg mood-save"
              onClick={handleSave}
              disabled={!form.mood || saving}
              type="button"
            >
              {saved ? "✓ Saved!" : saving ? "Saving..." : <><Save size={16} /> Save Mood Log</>}
            </button>
          </div>

          <div className="mood-right">
            <div className="glass-card mood-card mood-side-card">
              <div className="mood-side-head">
                <h3 className="mood-card-title">30-Day Mood Calendar</h3>
                <span className="mood-side-tag">Tap any day</span>
              </div>

              <div className="mood-calendar">
                {last30.map((day) => {
                  const entry = getEntry(day);
                  const moodObj = entry ? getMoodObj(entry.mood) : null;
                  const isSelected = format(day, "yyyy-MM-dd") === selectedDate;

                  return (
                    <button
                      key={day.toISOString()}
                      className={`mood-cal-day ${isSelected ? "selected" : ""} ${entry ? "has-entry" : ""}`}
                      onClick={() => setSelectedDate(format(day, "yyyy-MM-dd"))}
                      data-tip={`${format(day, "d MMM")}${entry ? ` · ${moodObj?.label}` : ""}`}
                      style={{
                        background: entry ? MOOD_BG[entry.mood] : "var(--glass-ultra)",
                        border: `1px solid ${entry ? MOOD_BORDER[entry.mood] : "var(--glass-border)"}`,
                      }}
                      type="button"
                    >
                      {moodObj ? (
                        <span className="mood-cal-emoji">{moodObj.emoji}</span>
                      ) : (
                        <span className="mood-cal-date">{format(day, "d")}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="glass-card mood-card mood-side-card">
              <div className="mood-side-head">
                <h3 className="mood-card-title">Recent Entries</h3>
                <span className="mood-side-tag">{entries.slice(0, 7).length} items</span>
              </div>

              <div className="mood-entry-list">
                {entries.slice(0, 7).length === 0 ? (
                  <p className="mood-empty">No mood entries yet. Log today's mood!</p>
                ) : (
                  entries.slice(0, 7).map((entry) => {
                    const moodObj = getMoodObj(entry.mood);

                    return (
                      <div
                        key={entry.id}
                        className="mood-entry-row"
                        style={{
                          background: MOOD_BG[entry.mood],
                          border: `1px solid ${MOOD_BORDER[entry.mood]}`,
                        }}
                        onClick={() => setSelectedDate(entry.date.split("T")[0])}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="mood-entry-emoji">{moodObj?.emoji}</span>
                        <div className="mood-entry-copy">
                          <div className="mood-entry-label" style={{ color: moodObj?.color }}>
                            {moodObj?.label}
                          </div>
                          <div className="mood-entry-sub">
                            {format(new Date(entry.date), "d MMM")} · ⚡{entry.energy} 🧠{entry.focus} 💢
                            {entry.stress}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .mood-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(circle at 10% 10%, rgba(212, 168, 83, 0.08), transparent 22%),
            radial-gradient(circle at 90% 0%, rgba(91, 156, 245, 0.08), transparent 18%),
            radial-gradient(circle at 50% 100%, rgba(232, 114, 138, 0.08), transparent 25%),
            #07070a;
          color: #fff;
        }

        .mood-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .mood-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(60px);
          opacity: 0.55;
        }

        .mood-orb-1 {
          width: 320px;
          height: 320px;
          top: -120px;
          left: -90px;
          background: radial-gradient(circle, rgba(212, 168, 83, 0.16), transparent 70%);
        }

        .mood-orb-2 {
          width: 300px;
          height: 300px;
          top: 120px;
          right: -80px;
          background: radial-gradient(circle, rgba(91, 156, 245, 0.14), transparent 70%);
        }

        .mood-orb-3 {
          width: 380px;
          height: 380px;
          bottom: -160px;
          left: 28%;
          background: radial-gradient(circle, rgba(232, 114, 138, 0.12), transparent 70%);
        }

        .mood-grid {
          position: absolute;
          inset: 0;
          opacity: 0.18;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.48), transparent 78%);
        }

        .mood-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.24) 78%);
        }

        .mood-shell {
          position: relative;
          z-index: 1;
          max-width: 1320px;
          margin: 0 auto;
          padding: 42px 24px 96px;
        }

        .mood-header {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }

        .mood-heading {
          flex: 1;
          min-width: 280px;
          animation: heroIn 620ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .mood-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 214, 138, 0.92);
          background: rgba(212, 168, 83, 0.08);
          border: 1px solid rgba(212, 168, 83, 0.14);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .mood-title {
          margin: 0;
          font-size: clamp(38px, 5.8vw, 68px);
          line-height: 0.96;
          letter-spacing: -0.05em;
          font-weight: 780;
          text-wrap: balance;
        }

        .mood-subtitle {
          max-width: 720px;
          margin-top: 14px;
          font-size: 15px;
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.54);
        }

        .mood-date-wrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 260px;
          padding: 16px;
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 18px 42px rgba(0, 0, 0, 0.18),
            0 1px 0 rgba(255, 255, 255, 0.06) inset;
          backdrop-filter: blur(18px) saturate(160%);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
        }

        .mood-date-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.38);
        }

        .mood-date {
          width: 100%;
          min-width: 220px;
        }

        .mood-stats {
          margin-bottom: 18px;
        }

        .mood-stat-card {
          padding: 20px 22px;
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 18px 42px rgba(0, 0, 0, 0.18),
            0 1px 0 rgba(255, 255, 255, 0.06) inset;
          backdrop-filter: blur(18px) saturate(160%);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
        }

        .mood-stat-top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 6px;
        }

        .mood-stat-icon {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: grid;
          place-items: center;
        }

        .mood-stat-value {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1;
          margin-top: 2px;
          margin-bottom: 6px;
        }

        .mood-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.95fr);
          gap: 22px;
          align-items: start;
        }

        .mood-left,
        .mood-right {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .mood-card {
          padding: 26px;
          border-radius: 28px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(14, 14, 18, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 28px 80px rgba(0, 0, 0, 0.45),
            0 1px 0 rgba(255, 255, 255, 0.06) inset;
          backdrop-filter: blur(28px) saturate(175%);
          -webkit-backdrop-filter: blur(28px) saturate(175%);
        }

        .mood-card-main {
          padding-bottom: 24px;
        }

        .mood-card-head {
          margin-bottom: 18px;
        }

        .mood-section-title,
        .mood-card-title {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
          font-weight: 760;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.95);
        }

        .mood-section-subtitle {
          margin-top: 8px;
          margin-bottom: 0;
        }

        .mood-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .mood-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 7px;
          padding: 14px 16px;
          min-width: 88px;
          border-radius: 18px;
          border: 1px solid var(--glass-border);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03)),
            var(--glass-ultra);
          cursor: pointer;
          transition:
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 220ms ease,
            box-shadow 220ms ease,
            background 220ms ease;
        }

        .mood-btn:hover {
          background: var(--mood-bg);
          border-color: var(--mood-border);
          transform: translateY(-3px);
          box-shadow: 0 18px 34px rgba(0, 0, 0, 0.18);
        }

        .mood-btn.active {
          background: var(--mood-bg);
          border-color: var(--mood-border);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--mood-color) 24%, transparent) inset,
            0 14px 28px rgba(0, 0, 0, 0.18),
            0 0 20px color-mix(in srgb, var(--mood-color) 20%, transparent);
          transform: translateY(-2px);
        }

        .mood-btn-emoji {
          font-size: 28px;
          line-height: 1;
        }

        .mood-btn-label {
          font-size: 12px;
          font-weight: 650;
          color: var(--text-secondary);
        }

        .mood-btn.active .mood-btn-label {
          color: var(--mood-color);
        }

        .mood-display {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 18px 20px;
          margin-top: 18px;
          border-radius: 22px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .mood-display-emoji {
          font-size: 44px;
          line-height: 1;
          flex-shrink: 0;
        }

        .mood-display-copy {
          min-width: 0;
        }

        .mood-display-title {
          font-size: 20px;
          font-weight: 760;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }

        .mood-display-sub {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-top: 4px;
        }

        .mood-slider-stack {
          display: flex;
          flex-direction: column;
          gap: 22px;
          margin-top: 18px;
        }

        .mood-slider {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .mood-slider-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .mood-slider-label-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .mood-slider-icon {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }

        .mood-slider-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          line-height: 1.3;
        }

        .mood-slider-value {
          font-size: 18px;
          font-weight: 800;
          line-height: 1;
        }

        .mood-slider-track {
          position: relative;
          height: 8px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 999px;
          overflow: hidden;
        }

        .mood-slider-fill {
          position: absolute;
          inset: 0 auto 0 0;
          height: 100%;
          border-radius: 999px;
          transition: width 0.2s ease;
          box-shadow: 0 0 24px rgba(255, 255, 255, 0.14);
        }

        .mood-range {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          margin: 0;
        }

        .mood-slider-labels {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: var(--text-muted);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .mood-note {
          min-height: 108px;
          resize: vertical;
        }

        .mood-save {
          align-self: flex-start;
          margin-top: 2px;
        }

        .mood-side-card {
          padding: 24px;
        }

        .mood-side-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .mood-side-tag {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.45);
          padding: 8px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .mood-calendar {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 8px;
        }

        .mood-cal-day {
          aspect-ratio: 1;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition:
            transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 200ms ease,
            border-color 200ms ease,
            filter 200ms ease;
          padding: 0;
          position: relative;
          overflow: hidden;
        }

        .mood-cal-day:hover {
          transform: translateY(-2px) scale(1.08);
          filter: brightness(1.05);
        }

        .mood-cal-day.selected {
          box-shadow:
            0 0 0 2px var(--gold),
            0 0 20px var(--gold-dim);
          transform: scale(1.08);
        }

        .mood-cal-day.has-entry::after {
          content: "";
          position: absolute;
          inset: auto 6px 6px auto;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.7);
          opacity: 0.6;
        }

        .mood-cal-emoji {
          font-size: 16px;
          line-height: 1;
        }

        .mood-cal-date {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 700;
        }

        .mood-entry-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .mood-empty {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.65;
          margin: 0;
        }

        .mood-entry-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 13px;
          border-radius: 16px;
          cursor: pointer;
          transition:
            transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
            filter 180ms ease,
            box-shadow 180ms ease;
        }

        .mood-entry-row:hover {
          transform: translateY(-2px);
          filter: brightness(1.08);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.16);
        }

        .mood-entry-emoji {
          font-size: 22px;
          line-height: 1;
          flex-shrink: 0;
        }

        .mood-entry-copy {
          flex: 1;
          min-width: 0;
        }

        .mood-entry-label {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.15;
        }

        .mood-entry-sub {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.5;
          margin-top: 2px;
        }

        @keyframes heroIn {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 1100px) {
          .mood-layout {
            grid-template-columns: 1fr;
          }

          .mood-right {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 820px) {
          .mood-right {
            grid-template-columns: 1fr;
          }

          .mood-header {
            align-items: stretch;
          }

          .mood-date-wrap {
            width: 100%;
          }
        }

        @media (max-width: 640px) {
          .mood-shell {
            padding: 26px 16px 84px;
          }

          .mood-card,
          .mood-side-card {
            padding: 18px;
            border-radius: 22px;
          }

          .mood-title {
            font-size: clamp(34px, 12vw, 50px);
          }

          .mood-stats {
            gap: 12px;
          }

          .mood-pills {
            gap: 10px;
          }

          .mood-btn {
            min-width: calc(50% - 5px);
            flex: 1;
          }

          .mood-calendar {
            gap: 6px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mood-heading,
          .mood-btn,
          .mood-display,
          .mood-card,
          .mood-stat-card,
          .mood-cal-day,
          .mood-entry-row,
          .mood-save {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}