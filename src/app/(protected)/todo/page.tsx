"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Brain, Calendar, CheckCircle2, Clock3, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TaskPriority, TaskStatus } from "@prisma/client";
import styles from "./todo.module.css";

type SubjectLite = { id: string; name: string; slug: string; color: string; emoji: string };
type TimelineLite = { id: string; label: string; detail: string | null; createdAt: string };
type AgentRunLite = { id: string; trigger: "START" | "FINISH" | "SKIP" | "MANUAL"; response: string; model: string | null; createdAt: string };
type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: "MANUAL" | "AI" | "VOICE_ASSISTANT";
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
  if (!normalized) return [];
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
  const reducedMotion = useReducedMotion();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectLite[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taskBusy, setTaskBusy] = useState(false);
  const mutationRef = useRef(false);
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
    if (!window.confirm("Clear assistant history? Your tasks will stay on the board.")) return;
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
    if (!form.title.trim() || mutationRef.current) return;
    if (form.plannedMinutes && (!Number.isInteger(Number(form.plannedMinutes)) || Number(form.plannedMinutes) < 1)) { setError("Planned minutes must be a positive whole number."); return; }
    mutationRef.current = true;
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
      if (res.status === 202) setAiSummary("Task queued on this device. It will appear on the board after it syncs.");
      else startTransition(() => {
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
      mutationRef.current = false;
    }
  }

  async function transitionTask(task: TaskItem, status: TaskStatus) {
    return mutateTask(task, `/api/tasks/${task.id}/transition`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
  }

  async function runTaskAgent(task: TaskItem, action: (typeof AGENT_ACTIONS)[number]["key"]) {
    setAgentBusy({ taskId: task.id, action });
    setError("");
    const statusMap: Partial<Record<(typeof AGENT_ACTIONS)[number]["key"], TaskStatus>> = {
      START: "IN_PROGRESS",
      FINISH: "DONE",
      SKIP: "SKIPPED",
    };
    try {
      if (statusMap[action] && !(await transitionTask(task, statusMap[action]!))) return;
      const res = await fetch(`/api/tasks/${task.id}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: action }),
      });
      if (!res.ok) throw new Error("Copilot launch failed.");
      if (res.status === 202) { setAiSummary("Assistant request queued. Reconnect to finish it."); return; }
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
    await mutateTask(task, `/api/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiAssistEnabled: !task.aiAssistEnabled }),
    });
  }

  async function removeTask(task: TaskItem) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    await mutateTask(task, `/api/tasks/${task.id}`, { method: "DELETE" });
  }

  async function removeAiReason(task: TaskItem) {
    await mutateTask(task, `/api/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeAiReason: true }),
    });
  }

  async function mutateTask(task: TaskItem, url: string, init: RequestInit): Promise<boolean> {
    if (mutationRef.current) return false;
    mutationRef.current = true;
    setTaskBusy(true);
    setError("");
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error("Your task could not be updated. The saved version is still on the board.");
      if (res.status === 202) {
        setAiSummary("Change queued on this device, not saved to the server yet. The board will refresh after syncing.");
        return false;
      }
      if (init.method === "DELETE") {
        setTasks((current) => current.filter((item) => item.id !== task.id));
        setSelectedTaskId((current) => current === task.id ? null : current);
      } else {
        const updated = await res.json() as TaskItem;
        setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the task.");
      return false;
    } finally {
      mutationRef.current = false;
      setTaskBusy(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 32, color: "var(--text-secondary)" }}>Loading todo page...</div>;
  }

  return (
    <div className={`todo-page ${styles.board}`} data-studio-native>
      {error && <div className="todo-error" role="alert">{error}</div>}

      <header className="studio-heading">
        <div><span className="studio-eyebrow">One step at a time</span><h1>Make space for progress.</h1><p>Your manual tasks and voice plans, together in one place.</p></div>
        <button className="btn btn-primary" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen} aria-controls="new-task-panel"><Plus size={16} /> Add a task</button>
      </header>
      <section className="top-shell">
        <details className="hero glass-card">
          <summary><Sparkles size={16} /> Plan with a request <span>Optional assistant</span></summary>
          <textarea
            className="input hero-input"
            rows={3}
            aria-label="Task planning request"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="For example: plan a revision session for electrochemistry tomorrow."
          />
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={runUnifiedAi} disabled={aiBusy || !aiInput.trim()}>
              {aiBusy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              Send request
            </button>
            <button className="btn btn-glass" onClick={clearAiHistory} disabled={aiBusy}>
              Clear AI History
            </button>
            <button className="btn btn-glass" onClick={() => void loadData()}>Refresh</button>
          </div>
        </details>

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

      {aiSummary && <div className="ai-summary" role="status"><CheckCircle2 size={14} /> {aiSummary}</div>}
      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.section
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
            className="glass-card manual-panel"
            id="new-task-panel"
          >
            <div className="manual-head">
              <div>
                <div className="eyebrow">Manual Add</div>
                <h2>Quick task</h2>
                <p>A clear next step is enough. Add details only if they help.</p>
              </div>
            </div>

            <div className="manual-grid">
              <label className="manual-field manual-field-wide">
                <span>Task title</span>
                <input className="input" placeholder="Finish optics numericals and revise formula traps" value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} />
              </label>
              <label className="manual-field">
                <span>Priority</span>
                <select className="input select" value={form.priority} onChange={(e) => setForm((c) => ({ ...c, priority: e.target.value as TaskPriority }))}>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="manual-field">
                <span>Subject</span>
                <select className="input select" value={form.subjectId} onChange={(e) => setForm((c) => ({ ...c, subjectId: e.target.value }))}>
                  <option value="">No subject</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
              <label className="manual-field">
                <span>Due date</span>
                <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm((c) => ({ ...c, dueDate: e.target.value }))} />
              </label>
              <label className="manual-field">
                <span>Planned minutes</span>
                <input className="input" type="number" min="1" step="1" placeholder="90" value={form.plannedMinutes} onChange={(e) => setForm((c) => ({ ...c, plannedMinutes: e.target.value }))} />
              </label>
              <label className="manual-field manual-field-wide">
                <span>Task note</span>
                <textarea className="input manual-textarea" rows={4} placeholder="Add the exact block, chapter, question target, or revision angle." value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} />
              </label>
            </div>

            <div className="manual-actions">
              <label className="toggle-row">
                <input type="checkbox" checked={form.aiAssistEnabled} onChange={(e) => setForm((c) => ({ ...c, aiAssistEnabled: e.target.checked }))} />
                <span>AI ready</span>
              </label>
              <button className="btn btn-primary" onClick={createTask} disabled={creating || !form.title.trim()}>
                {creating ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                Save Task
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="workspace">
        <div className="board-grid" id="task-board" tabIndex={-1} aria-label="Task board">
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
                    aria-pressed={selectedTaskId === task.id}
                    aria-controls="task-detail"
                    onClick={() => {
                      setSelectedTaskId(task.id); setAgentResponse(""); setAgentModel("");
                      if (window.matchMedia("(max-width: 1000px)").matches) window.requestAnimationFrame(() => {
                        const detail = document.getElementById("task-detail");
                        detail?.focus({ preventScroll: true });
                        detail?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
                      });
                    }}
                  >
                    <div className="task-head">
                      <span className="badge badge-glass">{PRIORITY_LABELS[task.priority]}</span>
                      {task.source === "AI" && <span className="badge badge-lotus">AI</span>}
                      {task.source === "VOICE_ASSISTANT" && <span className="badge badge-lotus">Voice plan</span>}
                    </div>
                    <strong>{task.title}</strong>
                    {task.description && <p>{task.description}</p>}
                    <div className="task-meta">
                      {task.subject && <span style={{ color: task.subject.color }}>{task.subject.name}</span>}
                      {task.plannedMinutes != null && <span><Clock3 size={12} /> {task.plannedMinutes}m</span>}
                      <span><Calendar size={12} /> {shortDate(task.dueDate)}</span>
                    </div>
                  </button>
                ))}
                {tasks.filter((task) => task.status === status).length === 0 && <div className="empty">Empty</div>}
              </div>
            </section>
          ))}
        </div>

        <aside className="side-panel" id="task-detail" tabIndex={-1} aria-label="Selected task details">
          {selectedTask ? (
            <>
              <section className="glass-card detail-card">
                <button className="btn back-to-board" onClick={() => {
                  const board = document.getElementById("task-board");
                  board?.focus({ preventScroll: true });
                  board?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
                }}>Back to tasks</button>
                <div className="detail-head">
                  <div>
                    <div className="eyebrow"><Brain size={13} /> Task</div>
                    <h2>{selectedTask.title}</h2>
                  </div>
                  <button className={`chip ${selectedTask.aiAssistEnabled ? "on" : ""}`} disabled={taskBusy || !!agentBusy} onClick={() => toggleAiReady(selectedTask)}>
                    <Sparkles size={12} />
                    {selectedTask.aiAssistEnabled ? "AI ready" : "AI asleep"}
                  </button>
                </div>

                {selectedTask.description && <p className="task-description">{selectedTask.description}</p>}
                <div className="chip-row">
                  {AGENT_ACTIONS.map((action) => (
                    <button
                      key={action.key}
                      className="chip"
                      disabled={!selectedTask.aiAssistEnabled || !!agentBusy || taskBusy}
                      onClick={() => runTaskAgent(selectedTask, action.key)}
                    >
                      {agentBusy?.taskId === selectedTask.id && agentBusy.action === action.key ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
                      {action.label}
                    </button>
                  ))}
                </div>

                <div className="chip-row">
                  {COLUMNS.map((status) => (
                    <button key={status} className={`chip ${selectedTask.status === status ? "on" : ""}`} disabled={taskBusy || !!agentBusy} aria-pressed={selectedTask.status === status} onClick={() => transitionTask(selectedTask, status)}>
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>

                <div className="hero-actions">
                  {selectedTaskHasReason && (
                    <button className="btn btn-glass" disabled={taskBusy || !!agentBusy} onClick={() => removeAiReason(selectedTask)}>
                      Remove AI Reason
                    </button>
                  )}
                  <button className="btn btn-ghost delete-btn" disabled={taskBusy || !!agentBusy} onClick={() => removeTask(selectedTask)}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </section>

              {sections.length > 0 && <section className="glass-card detail-card">
                <div className="detail-head">
                  <h3>Assistant notes</h3>
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
              </section>}

              <details className="glass-card detail-card">
                <summary>Task history</summary>
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
              </details>
            </>
          ) : (
            <section className="glass-card detail-card empty">Select a task.</section>
          )}
        </aside>
      </section>


    </div>
  );
}
