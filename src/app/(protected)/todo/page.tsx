"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Calendar, CheckCircle2, Clock3, Loader2, Plus, Radar, Sparkles, Target, Trash2, Wand2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MissionKind, MissionSessionStatus, TaskPriority, TaskStatus } from "@prisma/client";

type SubjectLite = { id: string; name: string; slug: string; color: string; emoji: string };
type TimelineLite = { id: string; label: string; detail: string | null; createdAt: string };
type AgentRunLite = { id: string; trigger: "START" | "FINISH" | "SKIP" | "MANUAL"; response: string; model: string | null; createdAt: string };
type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  plannedMinutes: number | null;
  dueDate: string | null;
  aiAssistEnabled: boolean;
  lastAgentSummary: string | null;
  subject: Omit<SubjectLite, "emoji"> | null;
  timelineEvents: TimelineLite[];
  agentRuns: AgentRunLite[];
};
type MissionTaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: "MANUAL" | "AI";
  subject: Omit<SubjectLite, "emoji"> | null;
};
type MissionSessionItem = {
  id: string;
  kind: MissionKind;
  status: MissionSessionStatus;
  title: string;
  goal: string | null;
  summary: string | null;
  responseMarkdown: string;
  model: string | null;
  createdAt: string;
  tasks: MissionTaskItem[];
  subject: Omit<SubjectLite, "emoji"> | null;
};

type CopilotSection = {
  title: string;
  body: string;
};

const COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE", "SKIPPED"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "Queue",
  IN_PROGRESS: "Doing",
  DONE: "Done",
  SKIPPED: "Skipped",
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
const ACTIONS = [
  { key: "START", label: "Start + AI" },
  { key: "FINISH", label: "Finish + AI" },
  { key: "SKIP", label: "Skip + AI" },
  { key: "MANUAL", label: "Launch Copilot" },
] as const;
const MISSION_ACTIONS: { key: MissionKind; label: string; blurb: string }[] = [
  { key: "MISSION_PLANNER", label: "Mission Planner", blurb: "Create a short NEET execution mission from live performance data." },
  { key: "AUTO_TODO", label: "Auto Todo Suggestions", blurb: "Suggest tasks from neglected areas, backlog, revisions, and weak chapters." },
  { key: "TEST_RECOVERY", label: "Post-Test Recovery", blurb: "Turn recent test weakness into corrective tasks and a recovery lane." },
  { key: "REVISION_PULSE", label: "Revision Pulse", blurb: "Surface what is due, fading, or overdue for revision." },
  { key: "DAILY_COMMAND", label: "Daily Command", blurb: "Create a compact command card for today only." },
  { key: "PATTERN_DETECTOR", label: "Pattern Detector", blurb: "Detect postponement, inconsistency, and execution leaks from her data." },
];

function shortDate(value: string | null) {
  if (!value) return "Flexible";
  return value.slice(0, 10);
}

function fullDate(value: string | null) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatCopilotContent(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseCopilotSections(content: string): CopilotSection[] {
  const normalized = formatCopilotContent(content);
  if (!normalized) return [];

  const headingRegex = /^##\s+(.+)$/gm;
  const matches = [...normalized.matchAll(headingRegex)];

  if (matches.length === 0) {
    return [{ title: "Copilot Response", body: normalized }];
  }

  return matches.map((match, index) => {
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    const body = normalized.slice(start, end).trim();
    return { title, body };
  }).filter((section) => section.body);
}

export default function TodoPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [missions, setMissions] = useState<MissionSessionItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [agentResponse, setAgentResponse] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [agentBusy, setAgentBusy] = useState<null | { taskId: string; action: string }>(null);
  const [missionBusy, setMissionBusy] = useState<null | MissionKind>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [missionGoal, setMissionGoal] = useState("");
  const [createMissionTasks, setCreateMissionTasks] = useState(true);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as TaskPriority,
    subjectId: "",
    dueDate: "",
    plannedMinutes: "",
    aiAssistEnabled: true,
  });
  const [showAgentGuide, setShowAgentGuide] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [taskRes, subjectRes, missionRes] = await Promise.all([fetch("/api/tasks"), fetch("/api/subjects"), fetch("/api/missions")]);
      if (!taskRes.ok || !subjectRes.ok || !missionRes.ok) throw new Error("Unable to load the task workspace.");
      const [taskJson, subjectJson, missionJson] = await Promise.all([taskRes.json(), subjectRes.json(), missionRes.json()]);
      setTasks(taskJson);
      setMissions(missionJson);
      setSubjects(subjectJson);
      setSelectedTaskId((current) => current ?? taskJson[0]?.id ?? null);
      setSelectedMissionId((current) => current ?? missionJson[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the task workspace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const focus = new URL(window.location.href).searchParams.get("focus");
      if (focus === "copilot") setShowAgentGuide(true);
    }
  }, []);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const selectedMission = useMemo(() => missions.find((mission) => mission.id === selectedMissionId) ?? null, [missions, selectedMissionId]);
  const renderedCopilotResponse = useMemo(
    () => formatCopilotContent(agentResponse || selectedTask?.agentRuns[0]?.response || "Launch the copilot only when you want the AI lane to engage."),
    [agentResponse, selectedTask]
  );
  const copilotSections = useMemo(() => parseCopilotSections(renderedCopilotResponse), [renderedCopilotResponse]);
  const missionSections = useMemo(
    () => parseCopilotSections(selectedMission?.responseMarkdown || "## Mission output\nLaunch a mission feature only when you want a planning run."),
    [selectedMission]
  );

  async function createTask() {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          priority: form.priority,
          subjectId: form.subjectId || null,
          dueDate: form.dueDate || null,
          plannedMinutes: form.plannedMinutes ? Number(form.plannedMinutes) : null,
          aiAssistEnabled: form.aiAssistEnabled,
        }),
      });
      if (!res.ok) throw new Error("Could not create the task.");
      const created = await res.json();
      startTransition(() => {
        setTasks((current) => [created, ...current]);
        setSelectedTaskId(created.id);
      });
      setForm({
        title: "",
        description: "",
        priority: "MEDIUM",
        subjectId: "",
        dueDate: "",
        plannedMinutes: "",
        aiAssistEnabled: true,
      });
      setEditorOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task.");
    } finally {
      setCreating(false);
    }
  }

  async function transitionTask(task: TaskItem, status: TaskStatus) {
    const previous = tasks;
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, status } : item)));
    const res = await fetch(`/api/tasks/${task.id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setTasks(previous);
      setError("Task update failed.");
      return;
    }
    const updated = await res.json();
    setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
  }

  async function runAgent(task: TaskItem, action: (typeof ACTIONS)[number]["key"]) {
    setAgentBusy({ taskId: task.id, action });
    const statusMap: Partial<Record<(typeof ACTIONS)[number]["key"], TaskStatus>> = {
      START: "IN_PROGRESS",
      FINISH: "DONE",
      SKIP: "SKIPPED",
    };
    if (statusMap[action]) await transitionTask(task, statusMap[action]!);
    try {
      const res = await fetch(`/api/tasks/${task.id}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: action }),
      });
      if (!res.ok) throw new Error("Copilot launch failed.");
      const payload = await res.json();
      setAgentResponse(payload.response);
      setAgentModel(payload.model ?? "");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copilot launch failed.");
    } finally {
      setAgentBusy(null);
    }
  }

  async function runMission(kind: MissionKind) {
    setMissionBusy(kind);
    setError("");
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          goal: missionGoal.trim() || undefined,
          createTasks: createMissionTasks,
        }),
      });
      if (!res.ok) throw new Error("Mission launch failed.");
      const created = await res.json();
      startTransition(() => {
        setMissions((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setSelectedMissionId(created.id);
      });
      if (createMissionTasks) {
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission launch failed.");
    } finally {
      setMissionBusy(null);
    }
  }

  async function updateMissionStatus(id: string, status: MissionSessionStatus) {
    try {
      const res = await fetch(`/api/missions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Mission update failed.");
      const updated = await res.json();
      setMissions((current) => current.map((item) => (item.id === id ? { ...item, ...updated } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mission update failed.");
    }
  }

  async function toggleAiReady(task: TaskItem) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiAssistEnabled: !task.aiAssistEnabled }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
  }

  async function removeTask(task: TaskItem) {
    const fallback = tasks.find((item) => item.id !== task.id)?.id ?? null;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    if (selectedTaskId === task.id) setSelectedTaskId(fallback);
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) setError("Could not delete that task.");
  }

  return (
    <div className="todo-page">
      <div className="page-content" style={{ maxWidth: 1700, position: "relative", zIndex: 1 }}>
        <section className="todo-hero glass-card">
          <div className="todo-hero-main">
            <div className="todo-kicker"><Sparkles size={14} /> Optional Task Copilot</div>
            <h1 className="todo-title">Todo Command Deck</h1>
            <p className="todo-subtitle">
              Tasks stay fast and manual by default. AI only wakes up when you explicitly launch it for
              start, finish, skip, or manual task coaching.
            </p>
            <div className="todo-hero-actions">
              <button className="btn btn-primary" onClick={() => setEditorOpen((open) => !open)}><Plus size={16} /> Add Task</button>
              <button className="btn btn-glass" onClick={() => setShowAgentGuide((value) => !value)}><Wand2 size={16} /> How Agent Works</button>
              <button className="btn btn-glass" onClick={loadData}>Refresh</button>
            </div>
          </div>
          <div className="todo-hero-side">
            <div className="todo-hero-side-card">
              <span className="todo-hero-side-label">Agent mode</span>
              <strong>Manual only</strong>
              <p>The AI stays asleep until you explicitly trigger it from a selected task.</p>
            </div>
            <div className="todo-hero-side-card">
              <span className="todo-hero-side-label">Best use</span>
              <strong>Task-by-task execution</strong>
              <p>Use it for launch briefs, completion analysis, skip recovery, or manual data-backed help.</p>
            </div>
          </div>
        </section>

        <section className="todo-summary">
          {[
            ["Queued", tasks.filter((task) => task.status === "TODO").length],
            ["Doing", tasks.filter((task) => task.status === "IN_PROGRESS").length],
            ["Done", tasks.filter((task) => task.status === "DONE").length],
            ["AI-ready", tasks.filter((task) => task.aiAssistEnabled).length],
          ].map(([label, value]) => (
            <div key={String(label)} className="todo-metric glass-card">
              <div className="todo-metric-value">{value}</div>
              <div className="todo-metric-label">{label}</div>
            </div>
          ))}
        </section>

        <section className="todo-mission-shell glass-card">
          <div className="todo-mission-main">
            <div className="todo-kicker"><Target size={14} /> Manual Mission Layer</div>
            <div className="todo-mission-headline">
              <div>
                <h2>Launch planning only when you want it</h2>
                <p className="todo-subtitle">
                  These planning features stay fully dormant until the user taps one. They read the live tracker,
                  explain why they chose each move, and only create tasks when you allow it.
                </p>
              </div>
              <div className="todo-mission-badges">
                <span className="badge badge-lotus">Opt-in only</span>
                <span className="badge badge-gold">Data-backed</span>
              </div>
            </div>

            <label className="todo-field todo-field-wide">
              <span>Mission goal or instruction</span>
              <textarea
                className="input todo-clean-input todo-clean-textarea"
                rows={3}
                value={missionGoal}
                onChange={(e) => setMissionGoal(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !missionBusy) {
                    e.preventDefault();
                    void runMission("MISSION_PLANNER");
                  }
                }}
                placeholder="Example: Build the smartest 3-day NEET recovery mission for weak physics and overdue revision."
              />
            </label>

            <div className="todo-mission-input-actions">
              <button
                className="btn btn-primary"
                onClick={() => runMission("MISSION_PLANNER")}
                disabled={!!missionBusy}
              >
                {missionBusy === "MISSION_PLANNER" ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                Run Mission Planner
              </button>
              <span className="todo-mission-input-hint">Use `Ctrl/Cmd + Enter` to launch the planner from this box.</span>
            </div>

            <label className="todo-checkbox">
              <input type="checkbox" checked={createMissionTasks} onChange={(e) => setCreateMissionTasks(e.target.checked)} />
              <span>When launched, allow the mission to add suggested tasks into the Todo Deck. Leave off to only review the plan.</span>
            </label>

            <div className="todo-mission-grid">
              {MISSION_ACTIONS.map((mission) => (
                <button
                  key={mission.key}
                  className={`todo-mission-card ${missionBusy === mission.key ? "busy" : ""}`}
                  onClick={() => runMission(mission.key)}
                  disabled={!!missionBusy}
                >
                  <div className="todo-mission-card-top">
                    <div className="todo-mission-card-icon">
                      {mission.key === "MISSION_PLANNER" || mission.key === "DAILY_COMMAND" ? <Target size={16} /> : <Radar size={16} />}
                    </div>
                    {missionBusy === mission.key ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                  </div>
                  <strong>{mission.label}</strong>
                  <span>{mission.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="todo-mission-side">
            <div className="todo-mission-side-card">
              <div className="todo-hero-side-label">Recent missions</div>
              <strong>{missions.length ? `${missions.length} runs saved` : "No mission runs yet"}</strong>
              <p>Every launch is stored so the user can revisit the analysis later without keeping the agent live.</p>
            </div>

            <div className="todo-mission-history">
              {missions.length ? missions.slice(0, 6).map((mission) => (
                <button
                  key={mission.id}
                  className={`todo-mission-history-item ${selectedMissionId === mission.id ? "active" : ""}`}
                  onClick={() => setSelectedMissionId(mission.id)}
                >
                  <div className="todo-mission-history-row">
                    <strong>{mission.title}</strong>
                    <span className="badge badge-glass">{mission.status.replace("_", " ")}</span>
                  </div>
                  <span>{fullDate(mission.createdAt)}</span>
                  {mission.summary && <p>{mission.summary}</p>}
                </button>
              )) : (
                <div className="todo-empty">No mission history yet. Launch one only when the user asks for a planning run.</div>
              )}
            </div>
          </div>
        </section>

        {selectedMission && (
          <section className="todo-mission-output glass-card">
            <div className="todo-panel-head">
              <div>
                <div className="todo-side-kicker">Selected mission</div>
                <h2>{selectedMission.title}</h2>
              </div>
              <div className="todo-mission-actions">
                <button className="btn btn-glass btn-xs" onClick={() => updateMissionStatus(selectedMission.id, "APPLIED")}>Mark Applied</button>
                <button className="btn btn-glass btn-xs" onClick={() => updateMissionStatus(selectedMission.id, "ARCHIVED")}>Archive</button>
              </div>
            </div>

            <div className="todo-mission-meta">
              <span className="badge badge-lotus">{selectedMission.kind.replaceAll("_", " ")}</span>
              <span className="badge badge-glass">{selectedMission.status.replace("_", " ")}</span>
              {selectedMission.subject && <span className="badge badge-glass">{selectedMission.subject.name}</span>}
              {selectedMission.model && <span className="badge badge-glass">{selectedMission.model}</span>}
            </div>

            {selectedMission.goal && <p className="todo-side-copy">{selectedMission.goal}</p>}

            <div className="todo-mission-panels">
              <div className="todo-copilot-grid">
                {missionSections.map((section) => (
                  <section key={`${selectedMission.id}-${section.title}`} className="todo-copilot-card">
                    <div className="todo-copilot-card-head">{section.title}</div>
                    <div className="todo-panel-copy todo-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ node, ...props }) => { void node; return <h1 className="todo-md-h1" {...props} />; },
                          h2: ({ node, ...props }) => { void node; return <h2 className="todo-md-h2" {...props} />; },
                          h3: ({ node, ...props }) => { void node; return <h3 className="todo-md-h3" {...props} />; },
                          p: ({ node, ...props }) => { void node; return <p className="todo-md-p" {...props} />; },
                          ul: ({ node, ...props }) => { void node; return <ul className="todo-md-ul" {...props} />; },
                          ol: ({ node, ...props }) => { void node; return <ol className="todo-md-ol" {...props} />; },
                          li: ({ node, ...props }) => { void node; return <li className="todo-md-li" {...props} />; },
                          strong: ({ node, ...props }) => { void node; return <strong className="todo-md-strong" {...props} />; },
                          hr: ({ node, ...props }) => { void node; return <hr className="todo-md-hr" {...props} />; },
                          code: ({ node, className, children, ...props }) => {
                            void node;
                            return <code className={`${className ? `todo-md-code ${className}` : "todo-md-inline-code"}`} {...props}>{children}</code>;
                          },
                          pre: ({ node, ...props }) => { void node; return <pre className="todo-md-pre" {...props} />; },
                          blockquote: ({ node, ...props }) => { void node; return <blockquote className="todo-md-blockquote" {...props} />; },
                        }}
                      >
                        {section.body}
                      </ReactMarkdown>
                    </div>
                  </section>
                ))}
              </div>

              <div className="todo-panel">
                <div className="todo-panel-head">
                  <h3><Sparkles size={15} /> Suggested tasks</h3>
                  <span>{selectedMission.tasks.length} saved</span>
                </div>
                <div className="todo-mission-task-list">
                  {selectedMission.tasks.length ? selectedMission.tasks.map((task) => (
                    <button key={task.id} className="todo-mission-task-item" onClick={() => setSelectedTaskId(task.id)}>
                      <div className="todo-mission-history-row">
                        <strong>{task.title}</strong>
                        <span className="badge badge-gold">{PRIORITY_LABELS[task.priority]}</span>
                      </div>
                      <div className="todo-card-meta">
                        <span className="badge badge-glass">{STATUS_LABELS[task.status]}</span>
                        <span className="badge badge-glass">{task.source === "AI" ? "AI suggested" : "Manual"}</span>
                        {task.subject && <span style={{ color: task.subject.color }}>{task.subject.name}</span>}
                      </div>
                    </button>
                  )) : (
                    <div className="todo-empty">This run was review-only. Turn on task creation before launching if you want it to feed the Todo Deck.</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <AnimatePresence>
          {(showAgentGuide || editorOpen) && (
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`todo-top-tools ${showAgentGuide && editorOpen ? "dual" : "single"}`}>
              {showAgentGuide && (
                <div className="todo-guide glass-card">
                  <div className="todo-editor-head">
                    <div>
                      <h2>How to use the agent here</h2>
                      <p>This agent is manual-only. Nothing auto-launches on page load or while you work.</p>
                    </div>
                    <button className="btn btn-icon btn-square" onClick={() => setShowAgentGuide(false)}><X size={16} /></button>
                  </div>
                  <div className="todo-guide-grid">
                    <div className="todo-guide-card">
                      <div className="todo-guide-step">1</div>
                      <strong>Create or pick a task</strong>
                      <span>The task becomes the working context. Add subject, due date, and planned minutes if you want better guidance.</span>
                    </div>
                    <div className="todo-guide-card">
                      <div className="todo-guide-step">2</div>
                      <strong>Keep AI optional</strong>
                      <span>Use the AI ready toggle if that task can use copilot help. This does not launch anything by itself.</span>
                    </div>
                    <div className="todo-guide-card">
                      <div className="todo-guide-step">3</div>
                      <strong>Choose the exact moment</strong>
                      <span>Start + AI, Finish + AI, Skip + AI, or Launch Copilot each trigger a different type of guidance.</span>
                    </div>
                    <div className="todo-guide-card">
                      <div className="todo-guide-step">4</div>
                      <strong>Read why it chose that</strong>
                      <span>The copilot output is data-backed from her logs, tests, revisions, SRS, subject neglect, and error patterns.</span>
                    </div>
                  </div>
                </div>
              )}

              {editorOpen && (
                <div className="todo-editor glass-card">
              <div className="todo-editor-head">
                <div>
                  <h2>Quick capture</h2>
                  <p>Clean manual task entry. Add detail only where it improves the agent precision.</p>
                </div>
                <button className="btn btn-icon btn-square" onClick={() => setEditorOpen(false)}><X size={16} /></button>
              </div>

              <div className="todo-editor-grid">
                <label className="todo-field todo-field-wide">
                  <span>Title</span>
                  <input className="input todo-clean-input" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="Revise electrochemistry numericals" />
                </label>
                <label className="todo-field todo-field-wide">
                  <span>Description or success condition</span>
                  <textarea className="input todo-clean-input todo-clean-textarea" rows={3} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} placeholder="Scope, target, weak area, or what completion should look like" />
                </label>
                <label className="todo-field">
                  <span>Priority</span>
                  <select className="input select todo-clean-input" value={form.priority} onChange={(e) => setForm((c) => ({ ...c, priority: e.target.value as TaskPriority }))}>
                    {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((priority) => (
                      <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>
                    ))}
                  </select>
                </label>
                <label className="todo-field">
                  <span>Subject</span>
                  <select className="input select todo-clean-input" value={form.subjectId} onChange={(e) => setForm((c) => ({ ...c, subjectId: e.target.value }))}>
                    <option value="">None</option>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
                <label className="todo-field">
                  <span>Due date</span>
                  <input className="input todo-clean-input" type="date" value={form.dueDate} onChange={(e) => setForm((c) => ({ ...c, dueDate: e.target.value }))} />
                </label>
                <label className="todo-field">
                  <span>Planned minutes</span>
                  <input className="input todo-clean-input" type="number" min="0" value={form.plannedMinutes} onChange={(e) => setForm((c) => ({ ...c, plannedMinutes: e.target.value }))} placeholder="90" />
                </label>
              </div>

              <div className="todo-form-tips">
                <div className="todo-tip"><CheckCircle2 size={14} /> Add a subject if you want subject-specific recommendations.</div>
                <div className="todo-tip"><CheckCircle2 size={14} /> Add planned minutes so the workload can be compared to her real pace.</div>
                <div className="todo-tip"><CheckCircle2 size={14} /> Describe the weak chapter if you want tighter data-backed guidance.</div>
              </div>

              <label className="todo-checkbox">
                <input type="checkbox" checked={form.aiAssistEnabled} onChange={(e) => setForm((c) => ({ ...c, aiAssistEnabled: e.target.checked }))} />
                <span>This task is AI-ready, but copilot stays dormant until you launch it.</span>
              </label>

              <div className="todo-editor-actions">
                <button className="btn btn-glass" onClick={() => setEditorOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={creating || !form.title.trim()} onClick={createTask}>
                  {creating ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                  Create Task
                </button>
              </div>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {error && <div className="todo-error">{error}</div>}

        <div className="todo-layout">
          <section className="todo-board">
            {loading ? (
              <div className="glass-card todo-loading"><Loader2 size={18} className="spin" /> Loading workspace...</div>
            ) : (
              COLUMNS.map((status) => (
                <div key={status} className="glass-card todo-column">
                  <div className="todo-column-head">
                    <h2>{STATUS_LABELS[status]}</h2>
                    <span>{tasks.filter((task) => task.status === status).length}</span>
                  </div>
                  <div className="todo-column-list">
                    <AnimatePresence>
                      {tasks.filter((task) => task.status === status).map((task) => (
                        <motion.div key={task.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className={`todo-card-item ${selectedTaskId === task.id ? "active" : ""}`} onClick={() => setSelectedTaskId(task.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedTaskId(task.id); }}>
                          <div className="todo-card-row">
                            <span className="badge badge-gold">{PRIORITY_LABELS[task.priority]}</span>
                            {task.aiAssistEnabled && <span className="badge badge-lotus">AI-ready</span>}
                          </div>
                          <div className="todo-card-title">{task.title}</div>
                          {task.description && <div className="todo-card-copy">{task.description}</div>}
                          <div className="todo-card-meta">
                            {task.subject && <span style={{ color: task.subject.color }}>{task.subject.name}</span>}
                            {task.plannedMinutes ? <span><Clock3 size={12} /> {task.plannedMinutes} min</span> : null}
                            {task.dueDate ? <span><Calendar size={12} /> {shortDate(task.dueDate)}</span> : null}
                          </div>
                          {task.lastAgentSummary && <div className="todo-card-summary">{task.lastAgentSummary}</div>}
                          <div className="todo-card-actions">
                            {task.status !== "IN_PROGRESS" && <button className="btn btn-glass btn-xs" onClick={(e) => { e.stopPropagation(); transitionTask(task, "IN_PROGRESS"); }}>Start</button>}
                            {task.status !== "DONE" && <button className="btn btn-glass btn-xs" onClick={(e) => { e.stopPropagation(); transitionTask(task, "DONE"); }}>Finish</button>}
                            {task.status !== "SKIPPED" && <button className="btn btn-danger btn-xs" onClick={(e) => { e.stopPropagation(); transitionTask(task, "SKIPPED"); }}>Skip</button>}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {tasks.filter((task) => task.status === status).length === 0 && <div className="todo-empty">Nothing here yet.</div>}
                  </div>
                </div>
              ))
            )}
          </section>

          <aside className="glass-card todo-side">
            {selectedTask ? (
              <>
                <div className="todo-side-head">
                  <div>
                    <div className="todo-side-kicker">Selected task</div>
                    <h2>{selectedTask.title}</h2>
                  </div>
                  <button className="btn btn-icon btn-square" onClick={() => removeTask(selectedTask)}><Trash2 size={16} /></button>
                </div>

                <div className="todo-side-row">
                  <span className="badge badge-gold">{PRIORITY_LABELS[selectedTask.priority]}</span>
                  <span className="badge badge-physics">{STATUS_LABELS[selectedTask.status]}</span>
                  <button className={`todo-ai-ready ${selectedTask.aiAssistEnabled ? "on" : ""}`} onClick={() => toggleAiReady(selectedTask)}>
                    <Sparkles size={12} /> {selectedTask.aiAssistEnabled ? "AI ready" : "AI asleep"}
                  </button>
                </div>

                <div className="todo-usage-strip">
                  <div className="todo-usage-item"><strong>Start + AI</strong><span>launch brief and first move</span></div>
                  <div className="todo-usage-item"><strong>Finish + AI</strong><span>completion analysis and next step</span></div>
                  <div className="todo-usage-item"><strong>Skip + AI</strong><span>recovery advice without guesswork</span></div>
                  <div className="todo-usage-item"><strong>Launch Copilot</strong><span>manual data-backed help anytime</span></div>
                </div>

                {selectedTask.description && <p className="todo-side-copy">{selectedTask.description}</p>}

                <div className="todo-stat-grid">
                  <div className="todo-stat"><span>Due</span><strong>{shortDate(selectedTask.dueDate)}</strong></div>
                  <div className="todo-stat"><span>Planned</span><strong>{selectedTask.plannedMinutes ? `${selectedTask.plannedMinutes} min` : "Open"}</strong></div>
                  <div className="todo-stat"><span>Latest event</span><strong>{fullDate(selectedTask.timelineEvents[0]?.createdAt ?? null)}</strong></div>
                </div>

                <div className="todo-agent-grid">
                  {ACTIONS.map((action) => (
                    <button key={action.key} className="todo-agent-btn" onClick={() => runAgent(selectedTask, action.key)} disabled={!!agentBusy}>
                      {agentBusy?.taskId === selectedTask.id && agentBusy.action === action.key ? <Loader2 size={15} className="spin" /> : <Brain size={15} />}
                      {action.label}
                    </button>
                  ))}
                </div>

                <div className="todo-panel">
                  <div className="todo-panel-head">
                    <h3><Brain size={15} /> Copilot output</h3>
                    {agentModel && <span>{agentModel}</span>}
                  </div>
                  <div className="todo-copilot-grid">
                    {copilotSections.map((section) => (
                      <section key={section.title} className="todo-copilot-card">
                        <div className="todo-copilot-card-head">{section.title}</div>
                        <div className="todo-panel-copy todo-markdown">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ node, ...props }) => { void node; return <h1 className="todo-md-h1" {...props} />; },
                              h2: ({ node, ...props }) => { void node; return <h2 className="todo-md-h2" {...props} />; },
                              h3: ({ node, ...props }) => { void node; return <h3 className="todo-md-h3" {...props} />; },
                              p: ({ node, ...props }) => { void node; return <p className="todo-md-p" {...props} />; },
                              ul: ({ node, ...props }) => { void node; return <ul className="todo-md-ul" {...props} />; },
                              ol: ({ node, ...props }) => { void node; return <ol className="todo-md-ol" {...props} />; },
                              li: ({ node, ...props }) => { void node; return <li className="todo-md-li" {...props} />; },
                              strong: ({ node, ...props }) => { void node; return <strong className="todo-md-strong" {...props} />; },
                              hr: ({ node, ...props }) => { void node; return <hr className="todo-md-hr" {...props} />; },
                              code: ({ node, className, children, ...props }) => {
                                void node;
                                return <code className={`${className ? `todo-md-code ${className}` : "todo-md-inline-code"}`} {...props}>{children}</code>;
                              },
                              pre: ({ node, ...props }) => { void node; return <pre className="todo-md-pre" {...props} />; },
                              blockquote: ({ node, ...props }) => { void node; return <blockquote className="todo-md-blockquote" {...props} />; },
                            }}
                          >
                            {section.body}
                          </ReactMarkdown>
                        </div>
                      </section>
                    ))}
                  </div>
                </div>

                <div className="todo-panel">
                  <div className="todo-panel-head"><h3>Timeline</h3></div>
                  <div className="todo-timeline">
                    {selectedTask.timelineEvents.map((event) => (
                      <div key={event.id} className="todo-timeline-item">
                        <div className="todo-dot" />
                        <div>
                          <div className="todo-timeline-label">{event.label}</div>
                          {event.detail && <div className="todo-timeline-detail">{event.detail}</div>}
                          <div className="todo-timeline-time">{fullDate(event.createdAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="todo-empty-side"><Brain size={18} /> Select a task to open the optional AI lane.</div>
            )}
          </aside>
        </div>
      </div>

      <style jsx>{`
        .todo-page { min-height: 100vh; position: relative; }
        .todo-hero, .todo-editor, .todo-guide, .todo-metric, .todo-column, .todo-side, .todo-loading, .todo-mission-shell, .todo-mission-output { padding: 22px; }
        .todo-hero { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.7fr); gap: 18px; align-items: stretch; margin-bottom: 18px; }
        .todo-hero-main { display: flex; flex-direction: column; justify-content: space-between; gap: 16px; min-width: 0; }
        .todo-hero-side { display: grid; grid-template-columns: 1fr; gap: 12px; }
        .todo-hero-side-card { padding: 16px 18px; border-radius: 20px; background: rgba(255,255,255,0.035); border: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 8px; }
        .todo-hero-side-card strong { font-size: 16px; }
        .todo-hero-side-card p { margin: 0; color: var(--text-secondary); line-height: 1.6; font-size: 13px; }
        .todo-hero-side-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .14em; font-weight: 800; }
        .todo-kicker, .todo-side-kicker { display: inline-flex; gap: 8px; align-items: center; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--text-muted); }
        .todo-title { font-size: clamp(34px, 5vw, 54px); margin: 12px 0 10px; }
        .todo-subtitle, .todo-side-copy, .todo-panel-copy, .todo-card-copy, .todo-card-summary { color: var(--text-secondary); line-height: 1.7; }
        .todo-hero-actions, .todo-summary, .todo-layout, .todo-card-row, .todo-card-actions, .todo-side-row, .todo-agent-grid, .todo-stat-grid, .todo-editor-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .todo-top-tools { display: grid; gap: 18px; margin-bottom: 18px; }
        .todo-top-tools.single { grid-template-columns: 1fr; }
        .todo-top-tools.dual { grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr); align-items: start; }
        .todo-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 18px; }
        .todo-mission-shell { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr); gap: 18px; margin-bottom: 18px; }
        .todo-mission-main, .todo-mission-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .todo-mission-headline { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
        .todo-mission-badges, .todo-mission-meta, .todo-mission-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .todo-mission-input-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .todo-mission-input-hint { color: var(--text-muted); font-size: 12px; line-height: 1.5; }
        .todo-mission-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .todo-mission-card {
          text-align: left;
          padding: 18px;
          border-radius: 20px;
          border: 1px solid var(--glass-border);
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
          color: var(--text-primary);
          cursor: pointer;
          transition: var(--t-smooth);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .todo-mission-card:hover { transform: translateY(-2px); border-color: hsla(38,72%,58%,0.26); }
        .todo-mission-card.busy { cursor: wait; opacity: .76; }
        .todo-mission-card-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .todo-mission-card-icon {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          color: var(--gold-bright);
          background: rgba(212,168,83,0.12);
          border: 1px solid rgba(212,168,83,0.18);
        }
        .todo-mission-card strong { font-size: 15px; }
        .todo-mission-card span { color: var(--text-secondary); line-height: 1.65; font-size: 13px; }
        .todo-mission-side-card {
          padding: 16px 18px;
          border-radius: 20px;
          border: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.03);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .todo-mission-side-card p, .todo-mission-history-item p { margin: 0; color: var(--text-secondary); line-height: 1.65; }
        .todo-mission-history { display: flex; flex-direction: column; gap: 10px; }
        .todo-mission-history-item, .todo-mission-task-item {
          width: 100%;
          text-align: left;
          padding: 15px 16px;
          border-radius: 18px;
          border: 1px solid var(--glass-border);
          background: rgba(255,255,255,0.03);
          color: inherit;
          cursor: pointer;
          transition: var(--t-smooth);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .todo-mission-history-item:hover, .todo-mission-history-item.active, .todo-mission-task-item:hover {
          transform: translateY(-1px);
          border-color: hsla(38,72%,58%,0.24);
          background: rgba(255,255,255,0.05);
        }
        .todo-mission-history-row { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
        .todo-mission-history-item > span { color: var(--text-muted); font-size: 12px; }
        .todo-mission-output { margin-bottom: 18px; display: flex; flex-direction: column; gap: 16px; }
        .todo-mission-panels { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr); gap: 16px; }
        .todo-mission-task-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
        .todo-metric-value { font-size: 30px; font-weight: 800; line-height: 1; }
        .todo-metric-label { margin-top: 8px; color: var(--text-muted); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .todo-editor, .todo-guide { display: flex; flex-direction: column; gap: 16px; height: 100%; }
        .todo-editor-head, .todo-side-head, .todo-panel-head, .todo-column-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
        .todo-editor-head h2, .todo-side-head h2, .todo-column-head h2 { margin: 0 0 6px; }
        .todo-editor-head p { margin: 0; color: var(--text-muted); }
        .todo-editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .todo-guide-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .todo-guide-card { padding: 18px; border-radius: 20px; background: rgba(255,255,255,0.035); border: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 10px; }
        .todo-guide-card strong { font-size: 15px; }
        .todo-guide-card span { color: var(--text-secondary); line-height: 1.7; font-size: 14px; }
        .todo-guide-step { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; background: var(--gold-dim); color: var(--gold-bright); font-size: 12px; font-weight: 800; }
        .todo-field { display: flex; flex-direction: column; gap: 8px; }
        .todo-field span { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .12em; font-weight: 800; }
        .todo-field-wide { grid-column: 1 / -1; }
        .todo-checkbox { display: flex; gap: 10px; align-items: center; color: var(--text-secondary); }
        .todo-clean-input { min-height: 48px; border-radius: 16px; background: rgba(6,6,10,0.58); border-color: rgba(255,255,255,0.1); color: var(--text-primary); box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }
        .todo-clean-input:hover { background: rgba(8,8,12,0.72); }
        .todo-clean-input:focus { background: rgba(10,10,16,0.85); }
        .todo-clean-textarea { min-height: 112px; padding-top: 14px; }
        .todo-form-tips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .todo-tip { display: flex; gap: 8px; align-items: flex-start; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); color: var(--text-secondary); line-height: 1.6; font-size: 13px; }
        .todo-layout { display: grid; grid-template-columns: minmax(0, 1.45fr) 420px; align-items: start; }
        .todo-board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; flex: 1; }
        .todo-column { min-height: 620px; }
        .todo-column-head span { color: var(--text-muted); font-size: 13px; font-weight: 700; }
        .todo-column-list { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
        .todo-card-item { width: 100%; text-align: left; padding: 16px; border-radius: 20px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.03); color: inherit; cursor: pointer; transition: var(--t-smooth); }
        .todo-card-item:hover, .todo-card-item.active { transform: translateY(-2px); border-color: hsla(38,72%,58%,0.24); background: rgba(255,255,255,0.05); }
        .todo-card-title { margin-top: 12px; font-size: 18px; font-weight: 700; }
        .todo-card-copy { margin-top: 8px; }
        .todo-card-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; color: var(--text-muted); font-size: 12px; }
        .todo-card-meta span { display: inline-flex; gap: 5px; align-items: center; }
        .todo-card-summary { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); }
        .todo-card-actions { margin-top: 14px; }
        .todo-empty, .todo-empty-side { min-height: 96px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; }
        .todo-side { position: sticky; top: 24px; display: flex; flex-direction: column; gap: 16px; }
        .todo-ai-ready { display: inline-flex; gap: 6px; align-items: center; border-radius: 999px; padding: 7px 11px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.04); color: var(--text-secondary); font-size: 11px; font-weight: 700; cursor: pointer; }
        .todo-ai-ready.on { background: var(--gold-dim); color: var(--gold-bright); border-color: hsla(38,72%,58%,0.22); }
        .todo-usage-strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .todo-usage-item { padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 4px; }
        .todo-usage-item strong { font-size: 13px; }
        .todo-usage-item span { color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
        .todo-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .todo-stat { padding: 14px; border-radius: 18px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); }
        .todo-stat span { display: block; font-size: 11px; color: var(--text-muted); font-weight: 800; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 8px; }
        .todo-agent-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .todo-agent-btn { display: inline-flex; gap: 8px; align-items: center; justify-content: center; border: 1px solid var(--glass-border-mid); background: rgba(255,255,255,0.05); color: var(--text-primary); border-radius: 16px; padding: 12px; font-weight: 700; cursor: pointer; transition: var(--t-smooth); }
        .todo-agent-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.08); }
        .todo-agent-btn:disabled { opacity: .65; cursor: wait; }
        .todo-panel { padding: 16px; border-radius: 20px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); }
        .todo-panel-head h3 { display: inline-flex; gap: 8px; align-items: center; margin: 0; font-size: 16px; }
        .todo-panel-head span { color: var(--text-muted); font-size: 12px; }
        :global(.todo-page .badge-glass) { background: rgba(255,255,255,0.07); color: var(--text-secondary); border-color: rgba(255,255,255,0.09); }
        .todo-copilot-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .todo-copilot-card {
          border-radius: 18px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          overflow: hidden;
        }
        .todo-copilot-card-head {
          padding: 12px 16px;
          background: linear-gradient(90deg, rgba(212,168,83,0.12), rgba(255,255,255,0.02));
          border-bottom: 1px solid rgba(255,255,255,0.06);
          color: #fff8df;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .todo-markdown {
          padding: 16px 16px 6px;
          color: rgba(245, 238, 230, 0.92);
          font-size: 14.5px;
          line-height: 1.85;
        }
        .todo-md-h1,
        .todo-md-h2,
        .todo-md-h3 {
          margin: 0 0 12px;
          color: #fff;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .todo-md-h1 {
          font-size: 24px;
          margin-top: 2px;
        }
        .todo-md-h2 { font-size: 18px; margin-top: 20px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.07); }
        .todo-md-h3 {
          font-size: 15px;
          margin-top: 16px;
          color: var(--gold-bright);
        }
        .todo-md-p {
          margin: 0 0 14px;
          color: rgba(245, 238, 230, 0.86);
        }
        .todo-md-strong {
          color: #fff;
          font-weight: 800;
        }
        .todo-md-ul,
        .todo-md-ol {
          margin: 0 0 16px;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 10px;
        }
        .todo-md-li {
          position: relative;
          padding: 10px 12px 10px 18px;
          border-radius: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.05);
          color: rgba(245, 238, 230, 0.88);
        }
        .todo-md-li::before {
          content: "";
          position: absolute;
          left: 10px;
          top: 16px;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: var(--gold);
          box-shadow: 0 0 10px var(--gold-glow);
        }
        .todo-md-hr {
          border: none;
          height: 1px;
          margin: 18px 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent);
        }
        .todo-md-inline-code {
          display: inline-block;
          padding: 1px 7px;
          border-radius: 8px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.08);
          color: #fff4cc;
          font-size: 0.94em;
        }
        .todo-md-pre {
          margin: 0 0 16px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(0,0,0,0.34);
          border: 1px solid rgba(255,255,255,0.08);
          overflow-x: auto;
        }
        .todo-md-code {
          color: rgba(245, 238, 230, 0.9);
          font-size: 13px;
          line-height: 1.7;
        }
        .todo-md-blockquote {
          margin: 0 0 16px;
          padding: 12px 14px;
          border-left: 3px solid var(--gold);
          border-radius: 0 14px 14px 0;
          background: rgba(212,168,83,0.08);
          color: rgba(245, 238, 230, 0.82);
        }
        .todo-timeline { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; }
        .todo-timeline-item { display: grid; grid-template-columns: 12px 1fr; gap: 12px; }
        .todo-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 12px var(--gold-glow); margin-top: 7px; }
        .todo-timeline-label { font-weight: 700; }
        .todo-timeline-detail, .todo-timeline-time { color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
        .todo-timeline-time { margin-top: 4px; }
        .todo-error { margin-bottom: 18px; padding: 14px 16px; border-radius: 18px; color: var(--danger); background: hsla(0,72%,62%,0.08); border: 1px solid hsla(0,72%,62%,0.18); }
        .todo-loading { display: inline-flex; align-items: center; gap: 10px; }
        :global(.todo-page select.input option) { background: #0d0d14; color: #f5efe6; }
        .spin { animation: spin .8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1320px) { .todo-layout, .todo-mission-panels { grid-template-columns: 1fr; } .todo-side { position: static; } }
        @media (max-width: 1180px) { .todo-hero, .todo-top-tools.dual, .todo-mission-shell { grid-template-columns: 1fr; } .todo-mission-headline { flex-direction: column; } }
        @media (max-width: 1100px) { .todo-board, .todo-summary, .todo-mission-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .todo-form-tips { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 760px) { .todo-hero, .todo-editor-grid, .todo-board, .todo-summary, .todo-agent-grid, .todo-stat-grid, .todo-guide-grid, .todo-form-tips, .todo-usage-strip, .todo-mission-grid { grid-template-columns: 1fr; } .todo-layout { display: block; } .todo-side { margin-top: 12px; } .todo-hero-actions { width: 100%; } }
      `}</style>
    </div>
  );
}
