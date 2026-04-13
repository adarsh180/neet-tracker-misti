"use client";

import { useEffect, useState, useCallback, type CSSProperties } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from "recharts";
import {
  Plus,
  Trash2,
  TrendingUp,
  Award,
  Target,
  CheckCircle,
  X,
  BarChart2,
  Sparkles,
  ChevronDown,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";

interface TestRecord {
  id: string;
  testType: string;
  testName: string;
  score: number;
  maxScore: number;
  percentage: number;
  rank: number | null;
  totalStudents: number | null;
  institute: string | null;
  takenAt: string;
  notes: string | null;
  subject: { name: string; color: string } | null;
}

interface SubjectMini {
  id: string;
  name: string;
  slug: string;
}

const TEST_TYPES = ["FULL_LENGTH", "SECTIONAL", "AITS", "UNIT_TEST"];
const TEST_TYPE_LABELS: Record<string, string> = {
  FULL_LENGTH: "Full Length",
  SECTIONAL: "Sectional",
  AITS: "AITS",
  UNIT_TEST: "Unit Test",
};
const TEST_COLORS: Record<string, string> = {
  FULL_LENGTH: "#d4a853",
  SECTIONAL: "#4f9cf9",
  AITS: "#a855f7",
  UNIT_TEST: "#22c55e",
};

/* Recharts custom tooltip */
function ChartTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{String(d.name || "")}</div>
      <div className="chart-tip-score">
        {Number(d.percentage || 0).toFixed(1)}% · {String(d.score || 0)}/{String(d.maxScore || "")}
      </div>
      <div className="chart-tip-meta">
        {String(d.date || "")} · {String(d.typeLabel || "")}
      </div>
    </div>
  );
}

export default function TestsPage() {
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("ALL");
  const [form, setForm] = useState({
    testName: "",
    testType: "FULL_LENGTH",
    subjectId: "",
    score: "",
    maxScore: "720",
    rank: "",
    totalStudents: "",
    institute: "",
    takenAt: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [tR, sR] = await Promise.all([fetch("/api/tests"), fetch("/api/subjects")]);
    if (tR.ok) setTests(await tR.json());
    if (sR.ok) setSubjects(await sR.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, subjectId: form.subjectId || null }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({
      testName: "",
      testType: "FULL_LENGTH",
      subjectId: "",
      score: "",
      maxScore: "720",
      rank: "",
      totalStudents: "",
      institute: "",
      takenAt: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
    fetchData();
  };

  const deleteTest = async (id: string) => {
    if (!confirm("Delete this test record?")) return;
    setTests((p) => p.filter((t) => t.id !== id));
    await fetch("/api/tests", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const filtered = filterType === "ALL" ? tests : tests.filter((t) => t.testType === filterType);

  const sorted = [...tests].sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime());
  const lineData = sorted.map((t) => ({
    date: format(new Date(t.takenAt), "d MMM"),
    percentage: t.percentage,
    score: t.score,
    maxScore: t.maxScore,
    name: t.testName,
    type: t.testType,
    typeLabel: TEST_TYPE_LABELS[t.testType],
  }));
  const scatterData = sorted.map((t, i) => ({
    x: i + 1,
    y: t.percentage,
    z: t.score,
    name: t.testName,
    color: TEST_COLORS[t.testType] || "#d4a853",
    type: t.testType,
    typeLabel: TEST_TYPE_LABELS[t.testType],
    score: t.score,
    maxScore: t.maxScore,
    date: format(new Date(t.takenAt), "d MMM"),
    percentage: t.percentage,
  }));

  const avgPct =
    tests.length > 0 ? Math.round((tests.reduce((s, t) => s + t.percentage, 0) / tests.length) * 10) / 10 : 0;
  const bestPct = tests.length > 0 ? Math.max(...tests.map((t) => t.percentage)) : 0;
  const trendUp = sorted.length >= 3 && sorted[sorted.length - 1].percentage > sorted[sorted.length - 3].percentage;

  const STATS = [
    { label: "Total Tests", value: tests.length, unit: "taken", icon: BarChart2, color: "var(--gold)" },
    { label: "Average", value: `${avgPct}%`, unit: "score", icon: TrendingUp, color: "var(--rose-bright)" },
    { label: "Personal Best", value: `${bestPct.toFixed(1)}%`, unit: "highest", icon: Award, color: "var(--lotus-bright)" },
    {
      label: "AIIMS Status",
      value: avgPct >= 97 ? "Delhi ✓" : avgPct >= 91 ? "Risk. ≈ Gap" : "Below Cut.",
      unit: avgPct >= 97 ? "On track" : "Gap remains",
      icon: Target,
      color: avgPct >= 97 ? "var(--success)" : avgPct >= 91 ? "var(--warning)" : "var(--danger)",
    },
  ];

  return (
    <div className="tests-page animate-fade-in">
      <div className="tests-bg">
        <div className="tests-orb tests-orb-1" />
        <div className="tests-orb tests-orb-2" />
        <div className="tests-orb tests-orb-3" />
        <div className="tests-grid" />
        <div className="tests-vignette" />
      </div>

      <main className="tests-shell">
        <div className="page-header tests-header">
          <div className="tests-heading">
            <div className="tests-badge">
              <Sparkles size={14} />
              Performance intelligence
            </div>
            <h1 className="page-title gradient-text tests-title">Test Performance</h1>
            <p className="page-subtitle tests-subtitle">
              Track every mock, AITS &amp; sectional — with line &amp; scatter analysis against AIIMS cutoffs
            </p>
          </div>

          <div className="tests-header-actions">
            <div className="tests-mini-stat">
              <span className="tests-mini-stat-label">Latest average</span>
              <span className="tests-mini-stat-value">{avgPct}%</span>
            </div>

            <button className={`btn btn-primary btn-sm tests-record-btn ${showForm ? "open" : ""}`} onClick={() => setShowForm(!showForm)}>
              {showForm ? (
                <>
                  <X size={14} /> Close
                </>
              ) : (
                <>
                  <Plus size={14} /> Record Test
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-4 gap-4 mb-6 stagger tests-stats-grid">
          {STATS.map((s) => (
            <div key={s.label} className="glass-card tests-stat-card">
              <div className="tests-stat-top">
                <div
                  className="stat-icon tests-stat-icon"
                  style={{
                    background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${s.color} 22%, transparent)`,
                  }}
                >
                  <s.icon size={17} style={{ color: s.color }} />
                </div>
                <div className="stat-label">{s.label}</div>
              </div>
              <div className="stat-value tests-stat-value" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="stat-sub">{s.unit}</div>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="glass-card animate-scale-in tests-form-card">
            <div className="tests-form-head">
              <div>
                <h3 className="tests-section-title">Record New Test</h3>
                <p className="tests-section-subtitle">Add a new mock, sectional, AITS or unit test entry</p>
              </div>
              <div className="tests-form-chip">
                <CheckCircle size={14} />
                Structured entry
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="tests-form-grid">
                <div className="tests-span-2">
                  <label className="test-form-lbl">Test Name *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Allen AITS-3"
                    value={form.testName}
                    onChange={(e) => setForm((f) => ({ ...f, testName: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="test-form-lbl">Test Type</label>
                  <select
                    className="input select"
                    value={form.testType}
                    onChange={(e) => setForm((f) => ({ ...f, testType: e.target.value }))}
                  >
                    {TEST_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TEST_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="test-form-lbl">Subject (optional)</label>
                  <select
                    className="input select"
                    value={form.subjectId}
                    onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
                  >
                    <option value="">All Subjects</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="test-form-lbl">Score *</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="540"
                    value={form.score}
                    onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="test-form-lbl">Max Score</label>
                  <input
                    type="number"
                    className="input"
                    value={form.maxScore}
                    onChange={(e) => setForm((f) => ({ ...f, maxScore: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="test-form-lbl">Date *</label>
                  <input
                    type="date"
                    className="input"
                    value={form.takenAt}
                    onChange={(e) => setForm((f) => ({ ...f, takenAt: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="test-form-lbl">Your Rank</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="Optional"
                    value={form.rank}
                    onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="test-form-lbl">Total Students</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="Optional"
                    value={form.totalStudents}
                    onChange={(e) => setForm((f) => ({ ...f, totalStudents: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="test-form-lbl">Institute</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Allen, Aakash..."
                    value={form.institute}
                    onChange={(e) => setForm((f) => ({ ...f, institute: e.target.value }))}
                  />
                </div>
              </div>

              <div className="tests-notes-row">
                <label className="test-form-lbl">Notes</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Weak areas, remarks..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="tests-form-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? "Saving..." : (
                    <>
                      <CheckCircle size={14} /> Save Test
                    </>
                  )}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {lineData.length > 0 && (
          <div className="tests-charts-grid">
            <div className="glass-card tests-chart-card">
              <div className="tests-card-head">
                <div className="tests-card-title-wrap">
                  <div className="tests-card-icon">
                    <TrendingUp size={15} />
                  </div>
                  <div>
                    <h3 className="tests-section-title">Score Progression</h3>
                    <p className="tests-section-subtitle">Trend over time with AIIMS cutoffs</p>
                  </div>
                </div>
                {trendUp && <span className="badge badge-success tests-trend-chip">↑ Improving</span>}
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={lineData} key={`chart-${lineData.length}`}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d4a853" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#d4a853" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#d4a853" />
                      <stop offset="100%" stopColor="#c2606e" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip content={<ChartTip />} />
                  <ReferenceLine
                    y={97}
                    stroke="hsla(38,72%,58%,0.4)"
                    strokeDasharray="6 3"
                    label={{ value: "AIIMS Delhi 97%", fill: "hsla(38,72%,58%,0.6)", fontSize: 10 }}
                  />
                  <ReferenceLine
                    y={91}
                    stroke="hsla(285,38%,54%,0.4)"
                    strokeDasharray="6 3"
                    label={{ value: "AIIMS Rish. 91%", fill: "hsla(285,38%,54%,0.6)", fontSize: 10 }}
                  />
                  <Area
                    type="natural"
                    dataKey="percentage"
                    stroke="url(#lineGradient)"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#areaGradient)"
                    dot={{ fill: "#d4a853", r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 8, fill: "#fff", stroke: "#d4a853", strokeWidth: 3 }}
                    isAnimationActive={true}
                    animationDuration={1600}
                    animationEasing="ease-out"
                    style={{ filter: "url(#glow)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {tests.length >= 3 && (
              <div className="glass-card tests-chart-card">
                <div className="tests-card-head">
                  <div className="tests-card-title-wrap">
                    <div className="tests-card-icon tests-card-icon-alt">
                      <Target size={15} />
                    </div>
                    <div>
                      <h3 className="tests-section-title">Test Distribution</h3>
                      <p className="tests-section-subtitle">Percent spread by attempt number</p>
                    </div>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Test #"
                      tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      label={{
                        value: "Test Number →",
                        fill: "rgba(255,255,255,0.25)",
                        fontSize: 10,
                        position: "insideBottomRight",
                        offset: -5,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Score %"
                      tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <ZAxis type="number" dataKey="z" range={[60, 240]} />
                    <Tooltip content={<ChartTip />} />
                    <ReferenceLine y={97} stroke="hsla(38,72%,58%,0.35)" strokeDasharray="6 3" />
                    <ReferenceLine y={91} stroke="hsla(285,38%,54%,0.35)" strokeDasharray="6 3" />
                    <Scatter data={scatterData}>
                      {scatterData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.color}
                          fillOpacity={0.88}
                          stroke={entry.color}
                          strokeOpacity={0.55}
                          strokeWidth={1}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>

                <div className="tests-legend">
                  {Object.entries(TEST_COLORS).map(([type, color]) => (
                    <div key={type} className="tests-legend-item">
                      <div className="tests-legend-dot" style={{ background: color }} />
                      <span>{TEST_TYPE_LABELS[type]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="tests-filter-row">
          <div className="tests-filter-label">
            <BarChart2 size={14} />
            <span>Filter records</span>
          </div>
          <div className="test-filters">
            {["ALL", ...TEST_TYPES].map((t) => (
              <button
                key={t}
                className={`test-filter-pill ${filterType === t ? "active" : ""}`}
                onClick={() => setFilterType(t)}
                type="button"
              >
                {t === "ALL" ? `All (${tests.length})` : `${TEST_TYPE_LABELS[t]} (${tests.filter((x) => x.testType === t).length})`}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="tests-loading-stack">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton tests-skeleton" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card tests-empty">
            <div className="tests-empty-icon">📋</div>
            <h3 className="tests-empty-title">
              {tests.length === 0 ? "No test records yet" : "No tests in this category"}
            </h3>
            <p className="tests-empty-subtitle">Record your first mock test to start tracking progress.</p>
          </div>
        ) : (
          <div className="test-list">
            {filtered.map((test, idx) => {
              const pctColor =
                test.percentage >= 97
                  ? "var(--success)"
                  : test.percentage >= 91
                  ? "var(--gold)"
                  : test.percentage >= 75
                  ? "var(--warning)"
                  : "var(--danger)";

              return (
                <div key={test.id} className="test-card animate-fade-in" style={{ animationDelay: `${idx * 40}ms` }}>
                  <div className="test-card-left">
                    <div
                      className="test-card-strip"
                      style={{ background: TEST_COLORS[test.testType] || "var(--gold)" }}
                    />
                    <div className="test-card-copy">
                      <div className="test-card-title-row">
                        <div className="test-card-name">{test.testName}</div>
                        <span
                          className="badge test-type-badge"
                          style={{
                            background: `${TEST_COLORS[test.testType]}18`,
                            border: `1px solid ${TEST_COLORS[test.testType]}33`,
                            color: TEST_COLORS[test.testType],
                          }}
                        >
                          {TEST_TYPE_LABELS[test.testType]}
                        </span>
                      </div>

                      <div className="test-card-meta">
                        {test.institute && <span>{test.institute}</span>}
                        {test.subject && <span>· {test.subject.name}</span>}
                        <span>· {format(new Date(test.takenAt), "d MMM yyyy")}</span>
                      </div>

                      {test.notes && <div className="test-card-notes">{test.notes}</div>}
                    </div>
                  </div>

                  <div className="test-card-right">
                    <div className="test-score-block">
                      <div className="test-score" style={{ color: pctColor }}>
                        {test.percentage.toFixed(1)}%
                      </div>
                      <div className="test-score-meta">
                        {test.score}/{test.maxScore}
                        {test.rank && <> · Rank {test.rank}{test.totalStudents && `/${test.totalStudents}`}</>}
                      </div>
                      <div className="progress-track tests-progress">
                        <div className="progress-fill" style={{ width: `${test.percentage}%`, background: pctColor }} />
                      </div>
                    </div>

                    <button className="test-del-btn" onClick={() => deleteTest(test.id)} data-tip="Delete" type="button">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(html) {
          scroll-behavior: smooth;
        }

        :global(body) {
          background:
            radial-gradient(circle at top left, rgba(212, 168, 83, 0.08), transparent 28%),
            radial-gradient(circle at top right, rgba(91, 156, 245, 0.08), transparent 25%),
            radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.07), transparent 24%),
            #07070a;
        }

        .tests-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: #fff;
          background:
            radial-gradient(circle at 20% 15%, rgba(212, 168, 83, 0.08), transparent 20%),
            radial-gradient(circle at 85% 0%, rgba(91, 156, 245, 0.08), transparent 18%),
            linear-gradient(180deg, #09090c 0%, #060607 100%);
        }

        .tests-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .tests-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(62px);
          opacity: 0.58;
        }

        .tests-orb-1 {
          width: 360px;
          height: 360px;
          left: -110px;
          top: -100px;
          background: radial-gradient(circle, rgba(212, 168, 83, 0.16), transparent 68%);
        }

        .tests-orb-2 {
          width: 320px;
          height: 320px;
          right: -100px;
          top: 110px;
          background: radial-gradient(circle, rgba(91, 156, 245, 0.14), transparent 68%);
        }

        .tests-orb-3 {
          width: 420px;
          height: 420px;
          left: 25%;
          bottom: -180px;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.11), transparent 68%);
        }

        .tests-grid {
          position: absolute;
          inset: 0;
          opacity: 0.18;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.5), transparent 78%);
        }

        .tests-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.24) 78%);
        }

        .tests-shell {
          position: relative;
          z-index: 1;
          max-width: 1400px;
          margin: 0 auto;
          padding: 40px 24px 96px;
        }

        .tests-header {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }

        .tests-heading {
          flex: 1;
          min-width: 280px;
          animation: heroIn 620ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .tests-badge {
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

        .tests-title {
          margin: 0;
          font-size: clamp(38px, 5.8vw, 68px);
          line-height: 0.96;
          letter-spacing: -0.05em;
          font-weight: 780;
          text-wrap: balance;
        }

        .tests-subtitle {
          max-width: 760px;
          margin-top: 14px;
          font-size: 15px;
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.54);
        }

        .tests-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .tests-mini-stat {
          padding: 14px 16px;
          border-radius: 20px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 18px 42px rgba(0, 0, 0, 0.18),
            0 1px 0 rgba(255, 255, 255, 0.06) inset;
          backdrop-filter: blur(18px) saturate(160%);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
          min-width: 144px;
        }

        .tests-mini-stat-label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.42);
          margin-bottom: 4px;
        }

        .tests-mini-stat-value {
          display: block;
          font-size: 24px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: rgba(255, 255, 255, 0.95);
        }

        .tests-record-btn.open {
          background: rgba(212, 168, 83, 0.12);
          border-color: rgba(212, 168, 83, 0.24);
          color: #d4a853;
        }

        .tests-stats-grid {
          margin-bottom: 18px;
        }

        .tests-stat-card {
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

        .tests-stat-top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .tests-stat-icon {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: grid;
          place-items: center;
        }

        .tests-stat-value {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1;
          margin-top: 2px;
          margin-bottom: 6px;
        }

        .tests-form-card,
        .tests-chart-card {
          padding: 26px;
          border-radius: 30px;
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

        .tests-form-card {
          margin-bottom: 24px;
        }

        .tests-form-head,
        .tests-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        .tests-section-title {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
          font-weight: 760;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.96);
        }

        .tests-section-subtitle {
          margin: 6px 0 0;
          font-size: 13px;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.5);
        }

        .tests-form-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.66);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }

        .tests-form-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .tests-span-2 {
          grid-column: span 2;
        }

        .tests-notes-row {
          margin-top: 14px;
        }

        .tests-form-actions {
          display: flex;
          gap: 10px;
          margin-top: 18px;
          flex-wrap: wrap;
        }

        .test-form-lbl {
          display: block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--text-muted);
          margin-bottom: 6px;
        }

        .tests-charts-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
          gap: 20px;
          margin-bottom: 24px;
        }

        .tests-card-title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .tests-card-icon {
          width: 40px;
          height: 40px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          background: color-mix(in srgb, var(--gold) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--gold) 24%, transparent);
          color: var(--gold);
          flex-shrink: 0;
        }

        .tests-card-icon-alt {
          background: color-mix(in srgb, var(--lotus-bright) 12%, transparent);
          border-color: color-mix(in srgb, var(--lotus-bright) 24%, transparent);
          color: var(--lotus-bright);
        }

        .tests-trend-chip {
          padding: 6px 10px;
          font-size: 10px;
          letter-spacing: 0.06em;
        }

        .tests-legend {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .tests-legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--text-muted);
        }

        .tests-legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .tests-filter-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 14px;
        }

        .tests-filter-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.42);
        }

        .test-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .test-filter-pill {
          padding: 8px 14px;
          border-radius: 999px;
          background: var(--glass-ultra);
          border: 1px solid var(--glass-border);
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .test-filter-pill:hover {
          background: var(--glass-thin);
          color: var(--text-primary);
          transform: translateY(-1px);
        }

        .test-filter-pill.active {
          background: color-mix(in srgb, var(--gold) 12%, transparent);
          border-color: color-mix(in srgb, var(--gold) 28%, transparent);
          color: var(--gold);
          font-weight: 700;
          box-shadow: 0 0 18px var(--gold-dim);
        }

        .tests-loading-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .tests-skeleton {
          height: 86px;
          border-radius: 24px;
        }

        .tests-empty {
          padding: 56px;
          text-align: center;
          border-radius: 30px;
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

        .tests-empty-icon {
          font-size: 42px;
          margin-bottom: 14px;
        }

        .tests-empty-title {
          font-size: 18px;
          font-weight: 760;
          color: var(--text-primary);
          margin-bottom: 6px;
        }

        .tests-empty-subtitle {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .test-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .test-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 20px;
          background:
            linear-gradient(145deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.025));
          border: 1px solid var(--glass-border);
          border-radius: 22px;
          transition: all 0.22s ease;
          backdrop-filter: blur(16px) saturate(150%);
          -webkit-backdrop-filter: blur(16px) saturate(150%);
        }

        .test-card:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.065);
          border-color: var(--glass-border-mid);
          box-shadow: 0 18px 34px rgba(0, 0, 0, 0.22);
        }

        .test-card-left {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          flex: 1;
          min-width: 0;
        }

        .test-card-strip {
          width: 6px;
          height: 40px;
          border-radius: 999px;
          flex-shrink: 0;
          align-self: center;
          box-shadow: 0 0 20px rgba(255, 255, 255, 0.08);
        }

        .test-card-copy {
          flex: 1;
          min-width: 0;
        }

        .test-card-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .test-card-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .test-type-badge {
          padding: 4px 8px;
          font-size: 10px;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }

        .test-card-meta {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 5px;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          line-height: 1.45;
        }

        .test-card-notes {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 6px;
          font-style: italic;
          line-height: 1.5;
        }

        .test-card-right {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }

        .test-score-block {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .test-score {
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        .test-score-meta {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.4;
          text-align: right;
        }

        .tests-progress {
          width: 72px;
          height: 4px;
        }

        .test-del-btn {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.26);
          padding: 0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.18s ease;
        }

        .test-del-btn:hover {
          color: var(--danger);
          background: rgba(255, 255, 255, 0.06);
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.12);
        }

        .chart-tip {
          background: rgba(10, 10, 14, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 12px 16px;
          font-size: 13px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .chart-tip-title {
          font-weight: 780;
          color: hsl(38, 28%, 92%);
          margin-bottom: 4px;
        }

        .chart-tip-score {
          color: var(--gold-bright);
        }

        .chart-tip-meta {
          color: rgba(255, 255, 255, 0.45);
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

        @media (max-width: 1120px) {
          .tests-charts-grid {
            grid-template-columns: 1fr;
          }

          .tests-form-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tests-span-2 {
            grid-column: span 2;
          }
        }

        @media (max-width: 860px) {
          .grid[style*="gridTemplateColumns"][style*="1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }

          .test-card {
            flex-direction: column;
            align-items: stretch;
          }

          .test-card-right {
            justify-content: space-between;
          }

          .test-score-block {
            align-items: flex-start;
          }

          .test-score-meta {
            text-align: left;
          }
        }

        @media (max-width: 760px) {
          .tests-shell {
            padding: 26px 16px 84px;
          }

          .tests-form-grid {
            grid-template-columns: 1fr;
          }

          .tests-span-2 {
            grid-column: auto;
          }

          .tests-title {
            font-size: clamp(34px, 12vw, 52px);
          }

          .tests-form-card,
          .tests-chart-card,
          .tests-stat-card,
          .tests-empty {
            border-radius: 24px;
          }

          .test-card-title-row {
            align-items: flex-start;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tests-heading,
          .tests-stat-card,
          .tests-form-card,
          .tests-chart-card,
          .test-card,
          .test-filter-pill,
          .test-del-btn,
          .tests-record-btn {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}