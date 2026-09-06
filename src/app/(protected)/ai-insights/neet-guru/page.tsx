"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Plus,
  MessageSquare,
  X,
  Square,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Wand2,
  ChevronRight,
  Paperclip,
  FileText,
  ImageIcon,
  ChartNoAxesCombined,
  CalendarDays,
  BookOpen,
  Layers,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { useReducedMotion } from "framer-motion";
import { readChatEvents } from "@/lib/chat-stream";
import styles from "./guru.module.css";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { NeetGuruVisualExplainer } from "@/components/neet-guru-visual-explainer";
import { parseNeetGuruMessage } from "@/lib/neet-guru-visual";
import "katex/dist/katex.min.css";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: UploadedFile[];
  delivery?: "unconfirmed" | "interrupted";
}

interface UploadedFile {
  name: string;
  type: string; // mime type
  base64?: string;
  preview?: string; // for images
}

const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

interface Conversation {
  id: string;
  title: string;
  mode: string;
  updatedAt: string;
}

const SUGGESTIONS = [
  { title: "Find my next focus", text: "Help me find my next study focus using my saved records. Clearly identify missing evidence.", icon: ChartNoAxesCombined },
  { title: "Plan a lighter day", text: "Suggest a manageable study plan from my saved progress. Ask about my available time before planning.", icon: CalendarDays },
  { title: "Understand a concept", text: "Help me understand a NEET concept. First ask which topic I am working on.", icon: BookOpen },
  { title: "Review a mistake", text: "Help me work through a question I got wrong. Ask me for the question and my reasoning.", icon: Layers },
];

function formatMessageContent(text: string) {
  let processed = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  if (processed.includes("<think>")) {
    processed = processed.substring(0, processed.indexOf("<think>"));
  }
  return processed
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeMessage(raw: Partial<Message> & { attachmentsJson?: unknown }): Message {
  const attachments = Array.isArray(raw.attachmentsJson)
    ? (raw.attachmentsJson as Array<{ name: string; mimeType: string; base64?: string; fileUrl?: string }>).map((file) => ({
        name: file.name,
        type: file.mimeType,
        base64: file.base64,
        preview: file.mimeType.startsWith("image/")
          ? (file.fileUrl || (file.base64 ? `data:${file.mimeType};base64,${file.base64}` : undefined))
          : undefined,
      }))
    : [];

  return {
    id: raw.id || crypto.randomUUID(),
    role: (raw.role as "user" | "assistant") || "assistant",
    content: raw.content || "",
    createdAt: raw.createdAt || new Date().toISOString(),
    attachments,
  };
}

function NeetGuruLogo() {
  return <svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M17 12a26 26 0 0 1 34 32M47 52A26 26 0 0 1 13 20" strokeLinecap="round" />
    <path d="M32 12v10m0 20v10M12 32h10m20 0h10" opacity=".4" />
    <circle cx="32" cy="32" r="10" /><circle cx="32" cy="32" r="3" fill="currentColor" stroke="none" />
    <circle cx="17" cy="12" r="3" /><circle cx="47" cy="52" r="3" />
  </svg>;
}

export default function NEETGuruPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");
  const [activeModel, setActiveModel] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const epochRef = useRef(0);
  const loadingRef = useRef(false);
  const deleteLocks = useRef(new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);
  const reducedMotion = useReducedMotion();
  const [deletingConvIds, setDeletingConvIds] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderMarkdown = useCallback(
    (content: string) => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          table: ({ node, ...props }) => {
            void node;
            return (
              <div className="ng-table-wrap">
                <table {...props} />
              </div>
            );
          },
          hr: ({ node, ...props }) => {
            void node;
            return <hr className="ng-markdown-rule" {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    ),
    []
  );

  const renderAssistantContent = useCallback(
    (content: string, appendCursor?: boolean) => {
      const parsed = parseNeetGuruMessage(content);
      const cleanContent = formatMessageContent(parsed.markdown);

      return (
        <>
          {cleanContent ? renderMarkdown(cleanContent + (appendCursor && !parsed.visual ? " ▌" : "")) : null}
          {parsed.visual ? <NeetGuruVisualExplainer visual={parsed.visual} /> : null}
        </>
      );
    },
    [renderMarkdown]
  );

  const fetchConversations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/ai/conversations", { cache: "no-store" });
      if (!res.ok) throw new Error("Chat history could not be refreshed. Existing chats are still here.");
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("Chat history was incomplete.");
      setConversations(rows);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load chat history."); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    void fetchConversations();
    return () => { epochRef.current += 1; abortRef.current?.abort(); };
  }, [fetchConversations]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 920px)");
    const syncSidebar = () => {
      setSidebarOpen(!mq.matches);
    };

    syncSidebar();
    mq.addEventListener("change", syncSidebar);
    return () => mq.removeEventListener("change", syncSidebar);
  }, []);

  useEffect(() => {
    if (!autoScroll.current || !scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reducedMotion || streaming ? "instant" : "smooth" });
  }, [messages, streamingText, streaming, reducedMotion]);

  const canLeaveChat = () => {
    if ((input.trim() || uploadedFiles.length || streaming) && !window.confirm("Leave this conversation? Unsent text and attachments will be cleared. An active reply will stop displaying here.")) return false;
    epochRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false); setStreamingText(""); setLoadingChat(false);
    return true;
  };

  const loadConversation = async (id: string) => {
    if (fileLoading || loadingRef.current || id === activeConvId || !canLeaveChat()) return;
    const epoch = epochRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingChat(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error("This conversation could not be opened. Your previous chat is still here.");
      const chat = await res.json();
      if (chat.id !== id || !Array.isArray(chat.messages)) throw new Error("This conversation response was incomplete.");
      if (epochRef.current !== epoch) return;
      setMessages(chat.messages.map(normalizeMessage)); setActiveConvId(id);
      setInput(""); setUploadedFiles([]); setActiveModel(""); autoScroll.current = true;
      if (window.matchMedia("(max-width: 920px)").matches) setSidebarOpen(false);
    } catch (err) {
      if (epochRef.current === epoch && !controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not open this conversation.");
    } finally { if (epochRef.current === epoch) { setLoadingChat(false); abortRef.current = null; } }
  };

  const startNew = () => {
    if (fileLoading || !canLeaveChat()) return;
    setActiveConvId(null); setMessages([]); setInput(""); setError(""); setNotice(""); setUploadedFiles([]); setActiveModel("");
    autoScroll.current = true;
    if (window.matchMedia("(max-width: 920px)").matches) setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const loadUploadedFiles = useCallback(async (files: File[]) => {
    if (!files.length || loadingRef.current || streaming || loadingChat) return false;
    const epoch = epochRef.current;

    const availableSlots = MAX_ATTACHMENTS - uploadedFiles.length;
    if (availableSlots <= 0) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files at a time.`);
      return false;
    }

    const selectedFiles = files.slice(0, availableSlots);
    const invalidFile = selectedFiles.find((file) => !ALLOWED_UPLOAD_TYPES.includes(file.type));
    if (invalidFile) {
      setError("Only images (JPG, PNG, WebP, GIF) and PDFs are supported.");
      return false;
    }

    const oversizedFile = selectedFiles.find((file) => file.size > MAX_UPLOAD_SIZE);
    if (oversizedFile) {
      setError(`"${oversizedFile.name}" is too large. Maximum size is 20MB.`);
      return false;
    }

    loadingRef.current = true;
    setFileLoading(true);
    setError("");

    try {
      const nextFiles = await Promise.all(
        selectedFiles.map(
          (file) =>
            new Promise<UploadedFile>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(",")[1];
                resolve({
                  name: file.name || `pasted-${Date.now()}.${file.type.split("/")[1] || "bin"}`,
                  type: file.type,
                  base64,
                  preview: file.type.startsWith("image/") ? `data:${file.type};base64,${base64}` : undefined,
                });
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            })
        )
      );

      if (epochRef.current !== epoch) return false;
      setUploadedFiles((current) => [...current, ...nextFiles].slice(0, MAX_ATTACHMENTS));
      return true;
    } catch {
      setError("Failed to read file. Please try again.");
      return false;
    } finally {
      loadingRef.current = false;
      setFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [uploadedFiles.length, streaming, loadingChat]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await loadUploadedFiles(files);
  };

  const deleteConv = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteLocks.current.has(id) || streaming || loadingChat || fileLoading) return;
    if (!window.confirm("Delete this saved conversation and its messages? This cannot be undone.")) return;
    deleteLocks.current.add(id);
    setDeletingConvIds(current => [...current, id]); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
      const receipt = await res.json();
      if (res.status === 202) { setNotice("Deletion queued, not yet confirmed. The conversation stays visible."); return; }
      if (!res.ok || receipt.success !== true) throw new Error("Could not confirm deletion. Your conversation stays visible.");
      setConversations(current => current.filter(conv => conv.id !== id));
      if (activeConvId === id) { epochRef.current += 1; setActiveConvId(null); setMessages([]); }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete this conversation."); }
    finally { deleteLocks.current.delete(id); setDeletingConvIds(current => current.filter(convId => convId !== id)); }
  };

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if ((!msg && uploadedFiles.length === 0) || abortRef.current || loadingRef.current || streaming || loadingChat) return;
    const filesToSend = [...uploadedFiles];
    const epoch = ++epochRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setInput(""); setError(""); setNotice(""); setStreaming(true); setStreamingText(""); setUploadedFiles([]);
    autoScroll.current = true;
    if (inputRef.current) inputRef.current.style.height = "auto";
    const tempId = crypto.randomUUID();
    const tempMsg: Message = { id: tempId, role: "user", content: msg || `[Attached ${filesToSend.length} files]`, createdAt: new Date().toISOString(), attachments: filesToSend, delivery: "unconfirmed" };
    setMessages(previous => [...previous, tempMsg]);
    let fullText = "";
    let newConvId = activeConvId;
    let completed = false;
    const stillCurrent = () => epochRef.current === epoch && !controller.signal.aborted;
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId, message: msg || "Please analyze all attached files carefully.", mode: "neet-guru",
          files: filesToSend.filter(file => file.base64).map(file => ({ base64: file.base64, mimeType: file.type, name: file.name })),
        }), signal: controller.signal,
      });
      if (res.status === 202) throw new Error("Your request is queued, not answered yet. Check chat history after reconnecting before sending it again.");
      if (!res.ok) throw new Error("The reply could not be started. Your draft is restored; check history before retrying.");
      if (!res.body || !res.headers.get("content-type")?.includes("text/event-stream")) throw new Error("The server did not return a chat stream. Your draft is restored.");
      for await (const event of readChatEvents(res.body)) {
        if (!stillCurrent()) break;
        if (event.conversationId) newConvId = event.conversationId;
        if (event.text) { fullText += event.text; setStreamingText(fullText); }
        if (event.model) setActiveModel(event.model.split("/").pop()?.replace(":free", "") || "");
        if (event.done) {
          if (!newConvId || !fullText.trim()) throw new Error("The complete reply could not be confirmed.");
          completed = true;
          setMessages(previous => [...previous.map(message => message.id === tempId ? { ...message, delivery: undefined } : message), { id: crypto.randomUUID(), role: "assistant", content: fullText, createdAt: new Date().toISOString() }]);
          setActiveConvId(newConvId);
          void fetchConversations();
          break;
        }
      }
      if (!completed && stillCurrent()) throw new Error("The reply ended before completion. Any partial reply is kept below; check history before retrying.");
    } catch (err) {
      if (!stillCurrent()) return;
      setError(err instanceof Error ? err.message : "The reply was interrupted.");
      setInput(msg); setUploadedFiles(filesToSend);
      if (newConvId) setActiveConvId(newConvId);
      if (fullText) setMessages(previous => [...previous, { id: crypto.randomUUID(), role: "assistant", content: fullText, createdAt: new Date().toISOString(), delivery: "interrupted" }]);
    } finally {
      if (epochRef.current === epoch) { setStreaming(false); setStreamingText(""); abortRef.current = null; }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleComposerPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;

    e.preventDefault();
    await loadUploadedFiles(
      files.map(
        (file) => new File([file], file.name || `pasted-image-${Date.now()}.png`, { type: file.type || "image/png" })
      )
    );
  };

  const removeUploadedFile = (index: number) => {
    setUploadedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (streaming) return;
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (streaming) return;
    await loadUploadedFiles(Array.from(e.dataTransfer.files || []));
  };

  const cancelStreaming = () => {
    epochRef.current += 1;
    abortRef.current?.abort(); abortRef.current = null;
    setStreaming(false); setStreamingText("");
    setNotice("Stopped displaying this reply. The server may still finish saving it; check history before retrying.");
    if (streamingText) setMessages(previous => [...previous, { id: crypto.randomUUID(), role: "assistant", content: streamingText, createdAt: new Date().toISOString(), delivery: "interrupted" }]);
  };

  const guruConvs = conversations.filter((c) => c.mode === "neet-guru");

  return (
    <>
      <div className={`${styles.page} ${sidebarOpen ? styles.sidebarOpen : ""}`} data-studio-native>

        {sidebarOpen && <button className="ng-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close conversation history" />}

        <aside id="guru-history" aria-label="Conversation history" className={`ng-sidebar ${sidebarOpen ? "" : "ng-sidebar-closed"}`} inert={!sidebarOpen}>
          <div className="ng-sidebar-inner">
            <div className="ng-sidebar-header">
              <div className="ng-sidebar-brand">
                <div className="ng-brand-mark">
                  <NeetGuruLogo />
                </div>
                <div>
                  <div className="ng-brand-title">NEET-GURU</div>
                  <div className="ng-brand-subtitle">Study conversations</div>
                </div>
              </div>

              <div className="ng-sidebar-actions">
                <button className="ng-icon-btn" onClick={startNew} disabled={fileLoading} title="New chat" aria-label="New chat">
                  <Plus size={18} />
                </button>
                <button className="ng-icon-btn toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Close history" aria-label="Close history">
                  <PanelLeftClose size={18} />
                </button>
              </div>
            </div>

            <div className="ng-history-heading"><span>Saved conversations</span><button className="ng-icon-btn" onClick={() => void fetchConversations()} disabled={historyLoading} aria-label="Refresh chat history"><MessageSquare size={16} /></button></div>
            <div className="ng-sidebar-content">
              {historyLoading && !guruConvs.length ? <p className="ng-history-loading" role="status">Loading saved chats…</p> : guruConvs.length === 0 ? (
                <div className="ng-empty-state-sidebar">
                  <div className="ng-empty-icon">
                    <Wand2 size={18} />
                  </div>
                  <div className="ng-empty-title">No history found</div>
                  <div className="ng-empty-copy">Your saved conversations will appear here.</div>
                </div>
              ) : (
                <div className="ng-history-list">
                  {guruConvs.map((conv) => (
                    <div key={conv.id} className={`ng-history-item ${activeConvId === conv.id ? "active" : ""}`}>
                      <button className="ng-history-open" aria-current={activeConvId === conv.id ? "true" : undefined} disabled={deletingConvIds.includes(conv.id) || loadingChat || fileLoading} onClick={() => void loadConversation(conv.id)}>
                        <MessageSquare size={15} /><span className="ng-history-title">{conv.title || "Untitled conversation"}</span>
                      </button>
                      <button className="ng-history-del" onClick={e => void deleteConv(conv.id, e)} disabled={deletingConvIds.includes(conv.id) || streaming || loadingChat || fileLoading} aria-label={`Delete chat: ${conv.title || "Untitled conversation"}`}><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ng-sidebar-footer"><BookOpen size={15} /><span>One question at a time.</span></div>
          </div>
        </aside>

        <section className="ng-main" aria-label="NEET-GURU study conversation">
          <div className="ng-topbar">
            <button className="ng-icon-btn" onClick={() => setSidebarOpen(value => !value)} aria-expanded={sidebarOpen} aria-controls="guru-history" aria-label="Toggle conversation history"><PanelLeftOpen size={19} /></button>
            <h1>NEET-GURU</h1><span className="ng-topbar-state" role="status">{loadingChat ? "Opening chat…" : streaming ? "Replying…" : "Study companion"}</span>
            <button className="ng-icon-btn" onClick={startNew} disabled={fileLoading} aria-label="New chat"><Plus size={19} /></button>
          </div>
          <div className="ng-chat-scroll-area" ref={scrollRef} onScroll={e => { const node = e.currentTarget; autoScroll.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120; }}>
            <div className="ng-chat-container">
              {messages.length === 0 && !streaming && !loadingChat && (
                <div className="ng-welcome">
                  <div className="ng-avatar-large">
                    <NeetGuruLogo />
                  </div>
                  <div className="ng-welcome-copy">
                    <div className="ng-kicker">
                      <Sparkles size={13} /> A little clarity, a next step
                    </div>
                    <h2 className="ng-welcome-title">Let’s make it click.</h2>
                    <p className="ng-welcome-subtitle">Bring a tricky concept, a question, or your next study decision.</p>
                  </div>

                  <div className="ng-suggestions-grid">
                    {SUGGESTIONS.map((s, idx) => (
                      <button key={idx} className="ng-suggestion-card" onClick={() => { setInput(s.text); inputRef.current?.focus(); }}>
                        <div className="ng-suggestion-top">
                          <div className="ng-suggestion-icon"><s.icon size={21} strokeWidth={1.5} /></div>
                          <ChevronRight size={16} className="ng-suggestion-arrow" />
                        </div>
                        <div className="ng-suggestion-text">{s.title}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.length > 0 && (
                <div className="ng-message-list">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`ng-message-row ${msg.role}`}>
                      {msg.role === "assistant" && (
                        <div className="ng-avatar-small">
                          <NeetGuruLogo />
                        </div>
                      )}

                      <div className="ng-message-content">
                        <div className={`ng-message-shell ${msg.role}`}>
                          <div className="ng-message-meta">
                            <span className="ng-message-role">{msg.role === "user" ? "You" : "NEET-GURU"}</span>
                            {msg.delivery && <span className="ng-delivery">{msg.delivery === "interrupted" ? "Partial · saving unconfirmed" : "Saving unconfirmed"}</span>}
                            <span className="ng-message-time">{format(new Date(msg.createdAt), "hh:mm a")}</span>
                          </div>
                          <div className="ng-message-text markdown-body">
                            {msg.role === "user" ? (
                              <div className="ng-user-message-body">
                                {msg.attachments && msg.attachments.length > 0 && (
                                  <div className="ng-message-attachments">
                                    {msg.attachments.map((attachment, index) => (
                                      <div key={`${msg.id}-${attachment.name}-${index}`} className="ng-attachment-chip">
                                        {attachment.preview ? (
                                          <img src={attachment.preview} className="ng-attachment-thumb" alt={attachment.name} />
                                        ) : (
                                          <div className="ng-attachment-icon">
                                            {attachment.type.startsWith("image/") ? <ImageIcon size={14} /> : <FileText size={14} />}
                                          </div>
                                        )}
                                        <span>{attachment.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {!msg.content.startsWith("[Attached") && <span>{msg.content}</span>}
                              </div>
                            ) : (
                              renderAssistantContent(msg.content)
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {streaming && (
                <div className="ng-message-row assistant">
                  <div className="ng-avatar-small">
                    <NeetGuruLogo />
                  </div>
                  <div className="ng-message-content">
                    <div className="ng-message-shell assistant live-shell">
                      <div className="ng-message-meta">
                        <span className="ng-message-role">NEET-GURU</span>
                        <span className="ng-message-time">live</span>
                      </div>
                      {(!streamingText || !formatMessageContent(streamingText)) ? (
                        <div className="ng-thinking">
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : (
                        <div className="ng-message-text markdown-body">
                          {renderAssistantContent(streamingText, true)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="ng-error-banner" role="alert">
                  {error}
                </div>
              )}

              {notice && <p className="ng-notice" role="status">{notice}</p>}
              <div ref={bottomRef} style={{ height: "40px", flexShrink: 0 }} />
            </div>
          </div>

          <div className="ng-input-zone">

            {/* File preview strip */}
            {uploadedFiles.length > 0 && (
              <div className="ng-file-preview-strip">
                <div className="ng-file-strip-grid">
                  {uploadedFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="ng-file-chip">
                      {file.preview ? (
                        <img src={file.preview} className="ng-file-thumb" alt={file.name} />
                      ) : (
                        <div className="ng-file-icon-wrap"><FileText size={18} /></div>
                      )}
                      <div className="ng-file-chip-info">
                        <span className="ng-file-chip-name">{file.name}</span>
                        <span className="ng-file-chip-type">{file.type.startsWith("image/") ? "Image" : "PDF"} · ready to send</span>
                      </div>
                      <button className="ng-file-chip-remove" onClick={() => removeUploadedFile(index)} title="Remove file" aria-label={`Remove ${file.name}`}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`ng-input-container ${dragActive ? "drag-active" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />

              {/* Paperclip button */}
              <button
                className={`ng-attach-btn ${fileLoading ? "loading" : ""} ${uploadedFiles.length > 0 ? "has-file" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming || fileLoading || loadingChat}
                title="Attach images or PDFs" aria-label="Attach images or PDFs"
              >
                {fileLoading ? <div className="ng-attach-spinner" /> : <Paperclip size={18} />}
              </button>
              <textarea
                ref={inputRef}
                className="ng-textarea"
                placeholder="Ask a question, or add a page from your notes…" aria-label="Message NEET-GURU"
                value={input}
                disabled={streaming || loadingChat}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                }}
                onKeyDown={handleKeyDown}
                onPaste={handleComposerPaste}
              />
              <div className="ng-input-actions">
                {streaming ? (
                  <button className="ng-action-btn stop" onClick={cancelStreaming} title="Stop generating" aria-label="Stop generating">
                    <Square size={16} fill="currentColor" strokeWidth={0} />
                  </button>
                ) : (
                  <button
                    className={`ng-action-btn send ${input.trim() || uploadedFiles.length > 0 ? "active" : ""}`}
                    onClick={() => sendMessage()}
                    disabled={loadingChat || fileLoading || (!input.trim() && uploadedFiles.length === 0)}
                    title="Send message" aria-label="Send message"
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="ng-input-footer">
              AI replies can be wrong. Verify with your textbook. This chat uses the existing online AI service.
              {activeModel && <span className="ng-model-indicator">{activeModel}</span>}
            </div>
          </div>
        </section>
      </div>


    </>
  );
}
