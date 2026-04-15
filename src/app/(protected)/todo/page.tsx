"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Brain, Calendar, CheckCircle2, Clock3, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TaskPriority, TaskStatus } from "@prisma/client";

type SubjectLite = { id: string; name: string; slug: string; color: string; emoji: string };
type TimelineLite = { id: string; label: string; detail: string | null; createdAt: string };
type AgentRunLite = { id: string; trigger: "START" | "FINISH" | "SKIP" | "MANUAL"; response: string; model: string | null; createdAt: string };
type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: "MANUAL" | "AI";
  plannedMinutes: number | null;
  dueDate: string | null;
  aiAssistEnabled: boolean;
  lastAgentSummary: string | null;
  subject: Omit<SubjectLite, "emoji"> | null;
  timelineEvents: TimelineLite[];
  agentRuns: AgentRunLite[];
};

const COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE", "SKIPPED"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "Ready",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  SKIPPED: "Skipped",
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
const AGENT_ACTIONS = [
  { key: "START", label: "Start + AI" },
  { key: "FINISH", label: "Finish + AI" },
  { key: "SKIP", label: "Skip + AI" },
  { key: "MANUAL", label: "Explain" },
] as const;

function shortDate(value: string | null) {
  return value ? value.slice(0, 10) : "Flexible";
}

function fullDate(value: string | null) {
  if (!value) return "No activity";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function parseSections(content: string) {
  const normalized = (content || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [{ title: "Response", body: "No response yet." }];
  const matches = [...normalized.matchAll(/^##\s+(.+)$/gm)];
  if (!matches.length) return [{ title: "Response", body: normalized }];

  return matches.map((match, index) => {
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    return { title, body: normalized.slice(start, end).trim() };
  }).filter((section) => section.body);
}

export default function TodoPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [agentBusy, setAgentBusy] = useState<null | { taskId: string; action: string }>(null);
  const [agentResponse, setAgentResponse] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as TaskPriority,
    subjectId: "",
    dueDate: "",
    plannedMinutes: "",
    aiAssistEnabled: true,
  });

  const loadData = useCallback(async (options?: { silent?: boolean; preserveError?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    if (!options?.preserveError) {
      setError("");
    }
    try {
      const [taskRes, subjectRes] = await Promise.all([fetch("/api/tasks"), fetch("/api/subjects")]);
      if (!taskRes.ok || !subjectRes.ok) throw new Error("Unable to load the todo page.");
      const [taskJson, subjectJson] = await Promise.all([taskRes.json(), subjectRes.json()]);
      setTasks(taskJson);
      setSubjects(subjectJson);
      setSelectedTaskId((current) => {
        if (!taskJson.length) return null;
        if (!current) return taskJson[0]?.id ?? null;
        return taskJson.some((task: TaskItem) => task.id === current) ? current : taskJson[0]?.id ?? null;
      });
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : "Unable to load the todo page.");
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden || aiBusy || creating || !!agentBusy || panelOpen) return;
      void loadData({ silent: true, preserveError: true });
    }, 60000);

    return () => window.clearInterval(interval);
  }, [agentBusy, aiBusy, creating, loadData, panelOpen]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [tasks, selectedTaskId]);
  const sections = useMemo(() => parseSections(agentResponse || selectedTask?.agentRuns[0]?.response || ""), [agentResponse, selectedTask]);
  const selectedTaskHasReason = Boolean(selectedTask?.description?.includes("Why this exists:"));
  const stats = useMemo(() => ({
    ready: tasks.filter((task) => task.status === "TODO").length,
    progress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    done: tasks.filter((task) => task.status === "DONE").length,
    skipped: tasks.filter((task) => task.status === "SKIPPED").length,
  }), [tasks]);

  async function runUnifiedAi() {
    if (!aiInput.trim()) return;
    setAiBusy(true);
    setError("");
    try {
      const res = await fetch("/api/todo-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: aiInput }),
      });
      if (!res.ok) throw new Error("AI could not complete that instruction.");
      const payload = await res.json();
      setAiSummary(payload.summary || "Completed.");
      setAiInput("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI could not complete that instruction.");
    } finally {
      setAiBusy(false);
    }
  }

  async function clearAiHistory() {
    setAiBusy(true);
    setError("");
    try {
      const res = await fetch("/api/todo-agent", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not clear AI history.");
      setAgentResponse("");
      setAgentModel("");
      setAiSummary("AI history cleared.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear AI history.");
    } finally {
      setAiBusy(false);
    }
  }

  async function createTask() {
    if (!form.title.trim()) return;
    setCreating(true);
    setError("");
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
      setPanelOpen(false);
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

  async function runTaskAgent(task: TaskItem, action: (typeof AGENT_ACTIONS)[number]["key"]) {
    setAgentBusy({ taskId: task.id, action });
    setError("");
    const statusMap: Partial<Record<(typeof AGENT_ACTIONS)[number]["key"], TaskStatus>> = {
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

  async function removeAiReason(task: TaskItem) {
    const cleanedDescription = task.description?.split("\n\nWhy this exists:")[0]?.trim() || null;
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, description: cleanedDescription } : item)));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeAiReason: true }),
      });
      if (!res.ok) throw new Error("Could not remove AI reason.");
      const updated = await res.json();
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove AI reason.");
      await loadData();
    }
  }

  if (loading) {
    return <div style={{ padding: 32, color: "var(--text-secondary)" }}>Loading todo page...</div>;
  }

  return (
    <div className="todo-page">
      {error && <div className="todo-error">{error}</div>}

      <section className="top-shell">
        <div className="hero glass-card">
          <div className="eyebrow"><Sparkles size={13} /> Todo Copilot</div>
          <h1>One prompt. Full control.</h1>
          <p>Ask AI to add a chapter, add a topic, or build a topic-wise todo list. Manual tasks still live in the same board.</p>
          <textarea
            className="input hero-input"
            rows={4}
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="Examples: add electrochemistry chapter to chemistry, add a topic redox titration in chemistry class 12, create a chapter-wise todo list for weak physics"
          />
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={runUnifiedAi} disabled={aiBusy}>
              {aiBusy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              Run AI
            </button>
            <button className="btn btn-glass" onClick={() => setPanelOpen((open) => !open)}>
              <Plus size={16} />
              Manual Task
            </button>
            <button className="btn btn-glass" onClick={clearAiHistory} disabled={aiBusy}>
              Clear AI History
            </button>
            <button className="btn btn-glass" onClick={() => void loadData()}>Refresh</button>
          </div>
          {aiSummary && <div className="ai-summary"><CheckCircle2 size={14} /> {aiSummary}</div>}
        </div>

        <div className="stats-rail glass-card">
          {[
            ["Ready", stats.ready],
            ["In Progress", stats.progress],
            ["Done", stats.done],
            ["Skipped", stats.skipped],
          ].map(([label, value]) => (
            <div key={String(label)} className="stat-row">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card manual-panel"
          >
            <div className="manual-head">
              <div>
                <div className="eyebrow">Manual Add</div>
                <h2>Quick task</h2>
              </div>
            </div>

            <div className="manual-grid">
              <input className="input" placeholder="Task title" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} />
              <select className="input select" value={form.priority} onChange={(e) => setForm((c) => ({ ...c, priority: e.target.value as TaskPriority }))}>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input className="input" placeholder="Short note" value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} />
              <select className="input select" value={form.subjectId} onChange={(e) => setForm((c) => ({ ...c, subjectId: e.target.value }))}>
                <option value="">No subject</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
              <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm((c) => ({ ...c, dueDate: e.target.value }))} />
              <input className="input" type="number" placeholder="Minutes" value={form.plannedMinutes} onChange={(e) => setForm((c) => ({ ...c, plannedMinutes: e.target.value }))} />
            </div>

            <div className="manual-actions">
              <label className="toggle-row">
                <input type="checkbox" checked={form.aiAssistEnabled} onChange={(e) => setForm((c) => ({ ...c, aiAssistEnabled: e.target.checked }))} />
                <span>AI ready</span>
              </label>
              <button className="btn btn-primary" onClick={createTask} disabled={creating}>
                {creating ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                Save Task
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="workspace">
        <div className="board-grid">
          {COLUMNS.map((status) => (
            <section key={status} className="glass-card column">
              <div className="column-head">
                <h3>{STATUS_LABELS[status]}</h3>
                <span>{tasks.filter((task) => task.status === status).length}</span>
              </div>

              <div className="task-stack">
                {tasks.filter((task) => task.status === status).map((task) => (
                  <button
                    key={task.id}
                    className={`task-card ${selectedTaskId === task.id ? "active" : ""}`}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <div className="task-head">
                      <span className="badge badge-glass">{PRIORITY_LABELS[task.priority]}</span>
                      {task.source === "AI" && <span className="badge badge-lotus">AI</span>}
                    </div>
                    <strong>{task.title}</strong>
                    {task.description && <p>{task.description}</p>}
                    <div className="task-meta">
                      {task.subject && <span style={{ color: task.subject.color }}>{task.subject.name}</span>}
                      <span><Clock3 size={12} /> {task.plannedMinutes ?? 0}m</span>
                      <span><Calendar size={12} /> {shortDate(task.dueDate)}</span>
                    </div>
                  </button>
                ))}
                {tasks.filter((task) => task.status === status).length === 0 && <div className="empty">Empty</div>}
              </div>
            </section>
          ))}
        </div>

        <aside className="side-panel">
          {selectedTask ? (
            <>
              <section className="glass-card detail-card">
                <div className="detail-head">
                  <div>
                    <div className="eyebrow"><Brain size={13} /> Task</div>
                    <h2>{selectedTask.title}</h2>
                  </div>
                  <button className={`chip ${selectedTask.aiAssistEnabled ? "on" : ""}`} onClick={() => toggleAiReady(selectedTask)}>
                    <Sparkles size={12} />
                    {selectedTask.aiAssistEnabled ? "AI ready" : "AI asleep"}
                  </button>
                </div>

                <div className="chip-row">
                  {AGENT_ACTIONS.map((action) => (
                    <button
                      key={action.key}
                      className="chip"
                      disabled={!selectedTask.aiAssistEnabled || !!agentBusy}
                      onClick={() => runTaskAgent(selectedTask, action.key)}
                    >
                      {agentBusy?.taskId === selectedTask.id && agentBusy.action === action.key ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
                      {action.label}
                    </button>
                  ))}
                </div>

                <div className="chip-row">
                  {COLUMNS.map((status) => (
                    <button key={status} className={`chip ${selectedTask.status === status ? "on" : ""}`} onClick={() => transitionTask(selectedTask, status)}>
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>

                <div className="hero-actions">
                  {selectedTaskHasReason && (
                    <button className="btn btn-glass" onClick={() => removeAiReason(selectedTask)}>
                      Remove AI Reason
                    </button>
                  )}
                  <button className="btn btn-ghost delete-btn" onClick={() => removeTask(selectedTask)}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </section>

              <section className="glass-card detail-card">
                <div className="detail-head">
                  <h3>AI Response</h3>
                  <span className="mini">{agentModel}</span>
                </div>

                <div className="markdown-stack">
                  {sections.map((section) => (
                    <div key={section.title} className="markdown-card">
                      <div className="markdown-head">{section.title}</div>
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="glass-card detail-card">
                <h3>Timeline</h3>
                <div className="timeline-stack">
                  {selectedTask.timelineEvents.map((event) => (
                    <div key={event.id} className="timeline-item">
                      <div className="dot" />
                      <div>
                        <div className="timeline-label">{event.label}</div>
                        {event.detail && <div className="mini">{event.detail}</div>}
                        <div className="mini">{fullDate(event.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                  {selectedTask.timelineEvents.length === 0 && <div className="empty">No recent events</div>}
                </div>
              </section>
            </>
          ) : (
            <section className="glass-card detail-card empty">Select a task.</section>
          )}
        </aside>
      </section>

      <style jsx>{`
        .todo-page {
          min-height: 100vh;
          padding: 28px;
          display: grid;
          gap: 18px;
          background:
            radial-gradient(circle at top left, rgba(251,191,36,.08), transparent 24%),
            radial-gradient(circle at top right, rgba(59,130,246,.09), transparent 24%),
            linear-gradient(180deg, #07080d 0%, #040509 100%);
        }
        .glass-card {
          background: linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 28px;
          box-shadow: 0 24px 80px rgba(0,0,0,.32);
          backdrop-filter: blur(22px);
        }
        .top-shell, .workspace { display: grid; gap: 18px; }
        .top-shell { grid-template-columns: minmax(0, 1.45fr) 300px; }
        .hero, .stats-rail, .manual-panel, .column, .detail-card { padding: 22px; }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        h1, h2, h3 { margin: 10px 0 8px; letter-spacing: -.03em; }
        h1 { font-size: clamp(34px, 5vw, 58px); max-width: 540px; }
        p, .mini, .task-card p, .task-meta, .stat-row span { color: var(--text-secondary); }
        .hero-input {
          min-height: 110px;
          margin-top: 14px;
          border-radius: 22px;
          background: rgba(6,8,14,.76);
        }
        .hero-actions, .manual-actions, .chip-row, .task-stack, .markdown-stack, .timeline-stack { display: flex; gap: 10px; flex-wrap: wrap; }
        .hero-actions, .manual-actions, .chip-row { margin-top: 14px; }
        .ai-summary {
          margin-top: 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(52,211,153,.08);
          border: 1px solid rgba(52,211,153,.18);
          color: #b7f7d8;
        }
        .stats-rail { display: grid; gap: 12px; align-content: start; }
        .stat-row {
          padding: 16px 18px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.07);
          background: rgba(255,255,255,.03);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .stat-row strong { font-size: 28px; line-height: 1; }
        .manual-panel { display: grid; gap: 16px; }
        .manual-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .toggle-row { display: inline-flex; align-items: center; gap: 10px; color: var(--text-secondary); }
        .workspace { grid-template-columns: minmax(0, 1.45fr) 420px; align-items: start; }
        .board-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .column { min-height: 600px; }
        .column-head, .task-head, .detail-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .column-head span {
          color: var(--text-muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .1em;
          font-weight: 700;
        }
        .task-stack, .markdown-stack, .timeline-stack { flex-direction: column; }
        .task-card {
          width: 100%;
          text-align: left;
          padding: 16px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.07);
          background: rgba(255,255,255,.03);
          transition: .2s ease;
        }
        .task-card:hover, .task-card.active, .chip:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,.06);
        }
        .task-card.active, .chip.on {
          border-color: rgba(251,191,36,.22);
          background: rgba(251,191,36,.11);
        }
        .task-card strong { display: block; font-size: 16px; }
        .task-card p { margin: 10px 0 0; font-size: 13px; line-height: 1.65; }
        .task-meta {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 12px;
          font-size: 12px;
        }
        .task-meta span { display: inline-flex; gap: 5px; align-items: center; }
        .side-panel { display: grid; gap: 16px; }
        .detail-card { display: grid; gap: 14px; }
        .chip {
          border: 1px solid rgba(255,255,255,.09);
          background: rgba(255,255,255,.04);
          color: var(--text-primary);
          border-radius: 16px;
          padding: 10px 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: .2s ease;
        }
        .markdown-card {
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.07);
          background: rgba(255,255,255,.03);
        }
        .markdown-head {
          padding: 12px 14px;
          background: linear-gradient(90deg, rgba(251,191,36,.12), rgba(255,255,255,.02));
          border-bottom: 1px solid rgba(255,255,255,.06);
          color: #ffe7a8;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .markdown-body { padding: 14px; color: rgba(245,238,230,.88); line-height: 1.8; }
        .markdown-body :global(p) { margin: 0 0 12px; }
        .markdown-body :global(ul) { margin: 0; padding-left: 20px; }
        .timeline-item {
          display: grid;
          grid-template-columns: 12px 1fr;
          gap: 12px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--gold);
          box-shadow: 0 0 12px var(--gold-glow);
          margin-top: 7px;
        }
        .timeline-label { font-weight: 700; }
        .delete-btn { width: fit-content; }
        .empty {
          min-height: 72px;
          display: grid;
          place-items: center;
          color: var(--text-muted);
          text-align: center;
        }
        .todo-error {
          padding: 14px 16px;
          border-radius: 18px;
          color: #ffb4bf;
          background: rgba(239,68,68,.08);
          border: 1px solid rgba(239,68,68,.18);
        }
        .spin { animation: spin .8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1320px) {
          .workspace { grid-template-columns: 1fr; }
          .board-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 1100px) {
          .top-shell, .manual-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 760px) {
          .todo-page { padding: 18px 14px 60px; }
          .board-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
