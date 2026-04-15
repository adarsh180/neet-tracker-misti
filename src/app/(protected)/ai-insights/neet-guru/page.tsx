"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  X,
  Square,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Wand2,
  ChevronRight,
  Gauge,
  Paperclip,
  FileText,
  ImageIcon,
} from "lucide-react";
import { format } from "date-fns";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: UploadedFile[];
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
  { text: "Analyse my current performance brutally honestly", icon: "📊" },
  { text: "Build this week's study schedule from my data", icon: "📅" },
  { text: "How far am I from AIIMS Delhi right now?", icon: "🎯" },
  { text: "Give me 5 NEET MCQs on Cell Division", icon: "📝" },
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
  return (
    <svg viewBox="0 0 100 100" className="ng-logo" aria-hidden="true" focusable="false" style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="logoPrimary" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#9ed7ff" />
        </linearGradient>
        <linearGradient id="logoGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.9)" />
          <stop offset="100%" stopColor="rgba(158, 215, 255, 0.2)" />
        </linearGradient>
        <filter id="glowF">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Central neural core */}
      <circle cx="50" cy="50" r="12" fill="none" stroke="url(#logoPrimary)" strokeWidth="2.5" />
      <circle cx="50" cy="50" r="4" fill="#ffffff" filter="url(#glowF)"/>

      {/* Outer geometry (lotus/brain nodes) */}
      <path d="M50 18 C30 18, 18 30, 18 50 C18 70, 30 82, 50 82 C70 82, 82 70, 82 50 C82 30, 70 18, 50 18 Z" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3 6" />
      
      {/* Orbital pathways */}
      <path d="M50 24 C34 24, 24 34, 24 50 C24 66, 34 76, 50 76 C66 76, 76 66, 76 50 C76 34, 66 24, 50 24" fill="none" stroke="url(#logoGlow)" strokeWidth="2" strokeDasharray="80" strokeDashoffset="0">
        <animate attributeName="stroke-dashoffset" values="160;0" dur="8s" repeatCount="indefinite" />
      </path>

      {/* Connection lines */}
      <path d="M50 12 L50 38 M50 62 L50 88 M12 50 L38 50 M62 50 L88 50" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24 24 L42 42 M76 76 L58 58 M24 76 L42 58 M76 24 L58 42" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeLinecap="round" />

      {/* Nodes */}
      <circle cx="50" cy="12" r="3" fill="#9ed7ff" />
      <circle cx="50" cy="88" r="3" fill="#9ed7ff" />
      <circle cx="12" cy="50" r="3" fill="#9ed7ff" />
      <circle cx="88" cy="50" r="3" fill="#9ed7ff" />
    </svg>
  );
}

export default function NEETGuruPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState("");
  const [activeModel, setActiveModel] = useState("NEET-GURU");
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

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/ai/conversations");
    if (res.ok) setConversations(await res.json());
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, streaming]);

  const loadConversation = async (id: string) => {
    setActiveConvId(id);
    setError("");
    const res = await fetch(`/api/ai/conversations/${id}`);
    if (res.ok) {
      const c = await res.json();
      setMessages((c.messages || []).map(normalizeMessage));
    }
  };

  const startNew = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setError("");
    setUploadedFiles([]);
  };

  const loadUploadedFiles = useCallback(async (files: File[]) => {
    if (!files.length) return false;

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

      setUploadedFiles((current) => [...current, ...nextFiles]);
      return true;
    } catch {
      setError("Failed to read file. Please try again.");
      return false;
    } finally {
      setFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [uploadedFiles.length]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await loadUploadedFiles(files);
  };

  const deleteConv = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeConvId === id) startNew();
    setConversations((p) => p.filter((c) => c.id !== id));
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    fetchConversations();
  };

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if ((!msg && uploadedFiles.length === 0) || streaming) return;
    const filesToSend = uploadedFiles;
    setInput("");
    setError("");
    setStreaming(true);
    setStreamingText("");
    setUploadedFiles([]);
    if (inputRef.current) inputRef.current.style.height = "auto";

    const tempMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: msg || (filesToSend.length ? `[Attached ${filesToSend.length} file${filesToSend.length > 1 ? "s" : ""}]` : ""),
      createdAt: new Date().toISOString(),
      attachments: filesToSend,
    };
    setMessages((p) => [...p, tempMsg]);

    abortRef.current = new AbortController();
    let fullText = "";
    let newConvId = activeConvId;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          message: msg || "Please analyze all attached files carefully.",
          mode: "neet-guru",
          files: filesToSend
            .filter((file) => file.base64)
            .map((file) => ({ base64: file.base64 as string, mimeType: file.type, name: file.name })),
        }),
        signal: abortRef.current.signal,
      });

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const data = JSON.parse(raw);
            if (data.error) throw new Error(data.error);
            if (data.text) {
              fullText += data.text;
              setStreamingText(fullText);
            }
            if (data.conversationId) newConvId = data.conversationId;
            if (data.model) setActiveModel(data.model.split("/").pop()?.replace(":free", "") || "AI");
            if (data.done) {
              setMessages((p) => [
                ...p,
                {
                  id: Date.now().toString() + "-ai",
                  role: "assistant",
                  content: fullText,
                  createdAt: new Date().toISOString(),
                },
              ]);
              if (newConvId) setActiveConvId(newConvId);
              fetchConversations();
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
              setError(parseErr.message);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(String(err));
    } finally {
      setStreaming(false);
      setStreamingText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
    if (abortRef.current) {
      abortRef.current.abort();
      setStreaming(false);
      if (streamingText) {
        setMessages((p) => [
          ...p,
          {
            id: Date.now().toString() + "-ai-aborted",
            role: "assistant",
            content: streamingText,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      setStreamingText("");
    }
  };

  const guruConvs = conversations.filter((c) => c.mode === "neet-guru");

  return (
    <>
      <div className={`ng-shell ${sidebarOpen ? "ng-shell-sidebar-open" : "ng-shell-sidebar-closed"}`}>
        <div className="ng-ambient ng-ambient-a" />
        <div className="ng-ambient ng-ambient-b" />
        <div className="ng-grid" />
        <div className="ng-vignette" />

        {sidebarOpen && <div className="ng-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

        <aside className={`ng-sidebar ${sidebarOpen ? "" : "ng-sidebar-closed"}`}>
          <div className="ng-sidebar-inner">
            <div className="ng-sidebar-header">
              <div className="ng-sidebar-brand">
                <div className="ng-brand-mark">
                  <NeetGuruLogo />
                </div>
                <div>
                  <div className="ng-brand-title">NEET-GURU</div>
                  <div className="ng-brand-subtitle">Personal AI mentor</div>
                </div>
              </div>

              <div className="ng-sidebar-actions">
                <button className="ng-icon-btn" onClick={startNew} title="New chat">
                  <Plus size={18} />
                </button>
                <button className="ng-icon-btn toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Collapse sidebar">
                  <PanelLeftClose size={18} />
                </button>
              </div>
            </div>

            <div className="ng-sidebar-panel">
              <div className="ng-sidebar-card">
                <div className="ng-sidebar-card-label">
                  <MessageSquare size={14} /> Conversations
                </div>
                <div className="ng-sidebar-card-value">{guruConvs.length}</div>
              </div>
              <div className="ng-sidebar-card">
                <div className="ng-sidebar-card-label">
                  <Sparkles size={14} /> Live Model
                </div>
                <div className="ng-sidebar-card-value">{activeModel}</div>
              </div>
            </div>

            <div className="ng-sidebar-content">
              {guruConvs.length === 0 ? (
                <div className="ng-empty-state-sidebar">
                  <div className="ng-empty-icon">
                    <Wand2 size={18} />
                  </div>
                  <div className="ng-empty-title">No history found</div>
                  <div className="ng-empty-copy">Start a chat to build your guidance vault.</div>
                </div>
              ) : (
                <div className="ng-history-list">
                  {guruConvs.map((conv) => (
                    <div
                      key={conv.id}
                      role="button"
                      tabIndex={0}
                      className={`ng-history-item ${activeConvId === conv.id ? "active" : ""}`}
                      onClick={() => loadConversation(conv.id)}
                      onKeyDown={(e) => e.key === "Enter" && loadConversation(conv.id)}
                    >
                      <span className="ng-history-dot" />
                      <span className="ng-history-title">{conv.title?.slice(0, 48) || "Untitled conversation"}</span>
                      <button className="ng-history-del" onClick={(e) => deleteConv(conv.id, e)} title="Delete chat">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ng-sidebar-footer">
              <div className="ng-footer-chip">
                <Settings2 size={13} /> Strict mentor mode
              </div>
              <div className="ng-footer-chip">
                <Gauge size={13} /> Adaptive responses
              </div>
            </div>
          </div>
        </aside>

        <main className="ng-main">
          {!sidebarOpen && (
            <div className="ng-topbar">
              <button className="ng-icon-btn toggle-btn" onClick={() => setSidebarOpen(true)} title="Open sidebar">
                <PanelLeftOpen size={18} />
              </button>
              <button className="ng-icon-btn" onClick={startNew} title="New chat">
                <Plus size={18} />
              </button>
            </div>
          )}

          <div className="ng-chat-scroll-area">
            <div className="ng-chat-container">
              {messages.length === 0 && !streaming && (
                <div className="ng-welcome">
                  <div className="ng-hero-orb" />
                  <div className="ng-avatar-large">
                    <NeetGuruLogo />
                  </div>
                  <div className="ng-welcome-copy">
                    <div className="ng-kicker">
                      <Sparkles size={13} /> AIIMS prep mentor
                    </div>
                    <h1 className="ng-welcome-title">How can I help you today?</h1>
                    <p className="ng-welcome-subtitle">Your dedicated AI mentor for ruthless clarity, planning, and revision.</p>
                  </div>

                  <div className="ng-suggestions-grid">
                    {SUGGESTIONS.map((s, idx) => (
                      <button key={idx} className="ng-suggestion-card" onClick={() => sendMessage(s.text)}>
                        <div className="ng-suggestion-top">
                          <div className="ng-suggestion-icon">{s.icon}</div>
                          <ChevronRight size={16} className="ng-suggestion-arrow" />
                        </div>
                        <div className="ng-suggestion-text">{s.text}</div>
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
                              renderMarkdown(formatMessageContent(msg.content))
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
                          {renderMarkdown(formatMessageContent(streamingText) + " ▌")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="ng-error-banner">
                  <strong>Connection Error:</strong> {error}
                </div>
              )}

              <div ref={bottomRef} style={{ height: "40px", flexShrink: 0 }} />
            </div>
          </div>

          <div className="ng-input-zone">
            <div className="ng-input-glow" />

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
                      <button className="ng-file-chip-remove" onClick={() => removeUploadedFile(index)} title="Remove file">
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
              <div className="ng-input-left-accent" />

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
                disabled={streaming || fileLoading}
                title="Attach images or PDFs"
              >
                {fileLoading ? <div className="ng-attach-spinner" /> : <Paperclip size={18} />}
              </button>
              <textarea
                ref={inputRef}
                className="ng-textarea"
                placeholder="Message NEET-GURU, paste images, or drop files..."
                value={input}
                disabled={streaming}
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
                  <button className="ng-action-btn stop" onClick={cancelStreaming} title="Stop generating">
                    <Square size={16} fill="currentColor" strokeWidth={0} />
                  </button>
                ) : (
                  <button
                    className={`ng-action-btn send ${input.trim() || uploadedFiles.length > 0 ? "active" : ""}`}
                    onClick={() => sendMessage()}
                    disabled={!input.trim() && uploadedFiles.length === 0}
                    title="Send message"
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="ng-input-footer">
              Paste screenshots, drop files, or attach multiple images for direct analysis. NEET-GURU can make mistakes, so check important medical facts.
              <span className="ng-model-indicator">• {activeModel}</span>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(html) {
          scroll-behavior: smooth;
        }

        :global(body) {
          margin: 0;
          background: #050507;
        }

        .ng-shell {
          --sidebar-width: 300px;
          --chat-max-width: 980px;
          --chat-side-padding: 28px;
          --input-max-width: 920px;
          --bg: #060608;
          --panel: rgba(255, 255, 255, 0.04);
          --panel-strong: rgba(255, 255, 255, 0.06);
          --border: rgba(255, 255, 255, 0.08);
          --border-strong: rgba(255, 255, 255, 0.14);
          --text: #f5f7fa;
          --muted: rgba(245, 247, 250, 0.58);
          --muted-2: rgba(245, 247, 250, 0.42);
          --accent: #ffffff;
          --accent-soft: rgba(255, 255, 255, 0.12);
          --shadow: 0 30px 90px rgba(0, 0, 0, 0.38);
          position: relative;
          display: flex;
          height: 100vh;
          width: 100%;
          overflow: hidden;
          background:
            radial-gradient(circle at 10% 10%, rgba(255, 255, 255, 0.06), transparent 30%),
            radial-gradient(circle at 90% 15%, rgba(192, 132, 252, 0.10), transparent 25%),
            radial-gradient(circle at 50% 100%, rgba(59, 130, 246, 0.08), transparent 28%),
            linear-gradient(180deg, #07070a 0%, #050507 100%);
          color: var(--text);
          font-family: var(--font-sans, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        }

        .ng-shell.ng-shell-sidebar-open {
          --chat-max-width: 900px;
        }

        .ng-shell.ng-shell-sidebar-closed {
          --chat-max-width: 1120px;
        }

        .ng-ambient {
          position: absolute;
          border-radius: 999px;
          filter: blur(90px);
          opacity: 0.42;
          pointer-events: none;
          animation: float 12s ease-in-out infinite;
        }

        .ng-ambient-a {
          width: 420px;
          height: 420px;
          left: -140px;
          top: -120px;
          background: rgba(255, 255, 255, 0.08);
        }

        .ng-ambient-b {
          width: 360px;
          height: 360px;
          right: -110px;
          bottom: 8%;
          background: rgba(192, 132, 252, 0.12);
          animation-delay: -4s;
        }

        .ng-grid {
          position: absolute;
          inset: 0;
          opacity: 0.14;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(ellipse at top, rgba(0, 0, 0, 1) 0%, transparent 84%);
          -webkit-mask-image: radial-gradient(ellipse at top, rgba(0, 0, 0, 1) 0%, transparent 84%);
          pointer-events: none;
        }

        .ng-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, transparent 36%, #050507 100%);
          pointer-events: none;
        }

        .ng-sidebar {
          width: var(--sidebar-width);
          flex-shrink: 0;
          position: relative;
          z-index: 2;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.02));
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(26px) saturate(180%);
          -webkit-backdrop-filter: blur(26px) saturate(180%);
          transition: width 0.28s cubic-bezier(0.2, 0, 0, 1), transform 0.28s cubic-bezier(0.2, 0, 0, 1);
          overflow: hidden;
        }

        .ng-sidebar-closed {
          width: 0;
          border-right-color: transparent;
        }

        .ng-sidebar-inner {
          width: var(--sidebar-width);
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 16px;
          gap: 14px;
        }

        .ng-sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .ng-sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .ng-brand-mark {
          width: 42px;
          height: 42px;
          border-radius: 16px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.06), 0 12px 28px rgba(0, 0, 0, 0.18);
          overflow: hidden;
        }

        .ng-sigil {
          width: 34px;
          height: 34px;
          display: block;
        }

        .ng-brand-title {
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #fff;
        }

        .ng-brand-subtitle {
          font-size: 12px;
          color: var(--muted-2);
          margin-top: 2px;
        }

        .ng-sidebar-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .ng-icon-btn {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.78);
          cursor: pointer;
          transition: transform 0.22s ease, background 0.22s ease, border-color 0.22s ease, color 0.22s ease;
        }

        .ng-icon-btn:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.14);
          color: #fff;
        }

        .ng-sidebar-panel {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .ng-sidebar-card {
          padding: 14px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .ng-sidebar-card-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--muted-2);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-weight: 800;
        }

        .ng-sidebar-card-value {
          margin-top: 10px;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: #fff;
          line-height: 1;
        }

        .ng-sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding-right: 4px;
          scrollbar-width: none;
        }

        .ng-sidebar-content::-webkit-scrollbar {
          width: 0;
          height: 0;
        }

        .ng-empty-state-sidebar {
          min-height: 240px;
          display: grid;
          place-items: center;
          text-align: center;
          border-radius: 24px;
          border: 1px dashed rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.025);
          padding: 24px;
        }

        .ng-empty-icon {
          width: 52px;
          height: 52px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          margin-bottom: 14px;
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .ng-empty-title {
          font-size: 15px;
          font-weight: 800;
          color: #fff;
        }

        .ng-empty-copy {
          margin-top: 6px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.6;
        }

        .ng-history-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ng-history-item {
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
          padding: 12px 12px;
          border-radius: 18px;
          cursor: pointer;
          color: #ececec;
          transition: background 0.22s ease, transform 0.22s ease, border-color 0.22s ease;
          border: 1px solid transparent;
          outline: none;
          background: rgba(255, 255, 255, 0.02);
        }

        .ng-history-item:hover {
          background: rgba(255, 255, 255, 0.06);
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.08);
        }

        .ng-history-item:focus-visible {
          border-color: rgba(255, 255, 255, 0.18);
        }

        .ng-history-item.active {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
          border-color: rgba(255, 255, 255, 0.12);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.06);
        }

        .ng-history-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(135deg, #ffffff, #8bd3ff);
          box-shadow: 0 0 16px rgba(255, 255, 255, 0.25);
          flex-shrink: 0;
        }

        .ng-history-title {
          font-size: 13.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          user-select: none;
          color: rgba(255, 255, 255, 0.92);
        }

        .ng-history-del {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #a0a0a0;
          opacity: 0;
          padding: 4px;
          display: flex;
          transition: opacity 0.2s, color 0.2s, transform 0.2s;
        }

        .ng-history-item:hover .ng-history-del {
          opacity: 1;
        }

        .ng-history-del:hover {
          color: #ff6b6b;
          transform: scale(1.04);
        }

        .ng-sidebar-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .ng-footer-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.7);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .ng-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .ng-topbar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 64px;
          padding: 14px 18px;
          display: flex;
          gap: 8px;
          z-index: 10;
          background: linear-gradient(180deg, rgba(6, 6, 8, 0.96), rgba(6, 6, 8, 0.45), transparent);
          justify-content: space-between;
        }

        .ng-chat-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding: 0 var(--chat-side-padding);
          scroll-behavior: smooth;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        }

        .ng-chat-container {
          width: min(100%, var(--chat-max-width));
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          min-height: 100%;
          padding-top: 36px;
          padding-bottom: 260px;
        }

        .ng-welcome {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin-top: 4vh;
          animation: fadeIn 0.4s ease-out;
          position: relative;
          text-align: center;
        }

        .ng-hero-orb {
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          filter: blur(80px);
          background: rgba(255, 255, 255, 0.06);
          top: -40px;
          z-index: -1;
          animation: float 14s ease-in-out infinite;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        .ng-avatar-large {
          width: 86px;
          height: 86px;
          border-radius: 30px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 18px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }

        .ng-avatar-large .ng-sigil {
          width: 64px;
          height: 64px;
        }

        .ng-avatar-small {
          width: 38px;
          height: 38px;
          border-radius: 99px; /* Complete circle for a cleaner logo */
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.04));
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          flex-shrink: 0;
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.22);
          overflow: hidden;
        }

        .ng-avatar-small .ng-sigil {
          width: 28px;
          height: 28px;
        }

        .ng-welcome-copy {
          margin-bottom: 34px;
        }

        .ng-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.84);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .ng-welcome-title {
          font-size: clamp(32px, 5vw, 50px);
          font-weight: 900;
          margin: 0;
          letter-spacing: -0.06em;
          line-height: 1.05;
          color: #fff;
        }

        .ng-welcome-subtitle {
          font-size: 16px;
          color: var(--muted);
          margin: 12px 0 0;
          line-height: 1.7;
        }

        .ng-suggestions-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          width: 100%;
          max-width: 820px;
        }

        .ng-suggestion-card {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.025));
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 22px;
          padding: 18px 18px 16px;
          text-align: left;
          cursor: pointer;
          transition: transform 0.22s ease, background 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 96px;
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);
        }

        .ng-suggestion-card:hover {
          transform: translateY(-2px);
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.035));
          border-color: rgba(255, 255, 255, 0.14);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
        }

        .ng-suggestion-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .ng-suggestion-icon {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          font-size: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .ng-suggestion-arrow {
          color: rgba(255, 255, 255, 0.35);
          transition: transform 0.22s ease, color 0.22s ease;
        }

        .ng-suggestion-card:hover .ng-suggestion-arrow {
          transform: translateX(2px);
          color: rgba(255, 255, 255, 0.72);
        }

        .ng-suggestion-text {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.92);
          line-height: 1.55;
          font-weight: 500;
        }

        .ng-message-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding-top: 20px;
        }

        .ng-message-row {
          display: flex;
          width: 100%;
          gap: 14px;
        }

        .ng-message-row.user {
          justify-content: flex-end;
        }

        .ng-message-row.assistant {
          justify-content: flex-start;
          align-items: flex-start;
        }

        .ng-message-content {
          max-width: min(100%, 760px);
          min-width: 0;
        }

        .ng-message-row.assistant .ng-message-content {
          max-width: 100%;
          flex: 1;
        }

        .ng-message-row.user .ng-message-content {
          max-width: min(72%, 720px);
        }

        .ng-message-shell {
          padding: 14px 0;
          position: relative;
        }

        .ng-message-shell.user {
          padding: 14px 18px;
          border-radius: 24px;
          background: #2f2f2f;
          border-bottom-right-radius: 6px;
          color: #ececec;
          border: 1px solid rgba(255, 255, 255, 0.08); /* Optional styling for user bubble */
        }

        .ng-message-shell.assistant {
          background: transparent;
          border: none;
          box-shadow: none;
          padding-right: 8px;
        }

        .live-shell {
          animation: pulseGlow 2.2s ease-in-out infinite;
        }

        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.04), 0 0 0 rgba(255, 255, 255, 0);
          }
          50% {
            box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.04), 0 0 22px rgba(255, 255, 255, 0.05);
          }
        }

        .ng-message-meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.44);
          font-weight: 800;
          position: relative;
          z-index: 1;
        }

        .ng-message-role {
          color: rgba(255, 255, 255, 0.82);
        }

        .ng-message-time {
          color: rgba(255, 255, 255, 0.38);
        }

        .ng-message-text {
          white-space: pre-wrap;
          word-break: break-word;
          position: relative;
          z-index: 1;
          font-size: 15px;
          line-height: 1.8;
        }

        .markdown-body :global(p) {
          margin-bottom: 12px;
          line-height: 1.75;
        }

        .markdown-body :global(p:last-child) {
          margin-bottom: 0;
        }

        .markdown-body :global(h1),
        .markdown-body :global(h2),
        .markdown-body :global(h3),
        .markdown-body :global(h4) {
          margin-top: 22px;
          margin-bottom: 10px;
          font-weight: 900;
          color: #fff;
          letter-spacing: -0.03em;
        }

        .markdown-body :global(strong) {
          font-weight: 800;
          color: #fff;
        }

        .markdown-body :global(ul),
        .markdown-body :global(ol) {
          margin-bottom: 16px;
          padding-left: 24px;
        }

        .markdown-body :global(li) {
          margin-bottom: 8px;
          line-height: 1.7;
          padding-left: 4px;
        }

        .markdown-body :global(blockquote) {
          margin: 16px 0;
          padding: 14px 16px;
          border-left: 3px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.03);
          border-radius: 14px;
          color: rgba(255, 255, 255, 0.82);
        }

        .markdown-body :global(code) {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 2px 6px;
          font-size: 0.95em;
        }

        .markdown-body :global(pre) {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 16px;
          overflow: auto;
          margin: 18px 0;
        }

        .markdown-body :global(pre code) {
          background: transparent;
          border: none;
          padding: 0;
        }

        .ng-table-wrap {
          width: 100%;
          overflow-x: auto;
          margin: 18px 0;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
        }

        .ng-table-wrap::-webkit-scrollbar {
          height: 8px;
        }

        .ng-table-wrap::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.18);
          border-radius: 999px;
        }

        .markdown-body :global(table) {
          width: 100%;
          min-width: 420px;
          border-collapse: collapse;
          font-size: 14px;
        }

        .markdown-body :global(th) {
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-weight: 800;
          padding: 12px 14px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .markdown-body :global(td) {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.86);
        }

        .markdown-body :global(tr:last-child) :global(td) {
          border-bottom: none;
        }

        .markdown-body :global(a) {
          color: #8bd3ff;
        }

        .ng-markdown-rule {
          border: none;
          height: 1px;
          margin: 22px 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        }

        /* ─── KaTeX global rendering ─── */
        .markdown-body :global(.katex) {
          font-size: 1.1em;
          display: inline;
          vertical-align: middle;
          color: inherit;
        }

        .markdown-body :global(.katex-display) {
          display: block;
          overflow-x: auto;
          overflow-y: hidden;
          margin: 18px 0;
          padding: 6px 0;
          text-align: center;
        }

        .markdown-body :global(.katex-html) {
          white-space: normal;
        }

        .ng-thinking {
          display: flex;
          gap: 6px;
          align-items: center;
          height: 30px;
          padding: 4px 0 2px;
          position: relative;
          z-index: 1;
        }

        .ng-thinking span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: linear-gradient(180deg, #fff, #8bd3ff);
          animation: bounce 1.4s ease-in-out infinite;
          box-shadow: 0 0 14px rgba(255, 255, 255, 0.12);
        }

        .ng-thinking span:nth-child(2) {
          animation-delay: 0.16s;
        }

        .ng-thinking span:nth-child(3) {
          animation-delay: 0.32s;
        }

        @keyframes bounce {
          0%,
          80%,
          100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-6px);
          }
        }

        .ng-error-banner {
          background: rgba(255, 107, 107, 0.08);
          border: 1px solid rgba(255, 107, 107, 0.26);
          color: #ff8f8f;
          padding: 14px 16px;
          border-radius: 18px;
          margin-top: 16px;
          font-size: 14px;
        }

        .ng-input-zone {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(180deg, transparent 0%, rgba(6, 6, 8, 0.82) 25%, #050507 100%);
          padding: 0 var(--chat-side-padding) 22px;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 3;
        }

        .ng-input-glow {
          width: min(900px, 100%);
          height: 28px;
          margin-bottom: -10px;
          background: radial-gradient(circle at center, rgba(255, 255, 255, 0.09), transparent 72%);
          filter: blur(12px);
          pointer-events: none;
        }

        .ng-input-container {
          width: 100%;
          max-width: var(--input-max-width);
          background: #2f2f2f;
          border-radius: 28px;
          padding: 10px 12px 10px 16px;
          display: flex;
          align-items: flex-end;
          gap: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: border-color 0.2s, transform 0.2s;
          position: relative;
          overflow: hidden;
        }

        .ng-input-container:focus-within {
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateY(-1px);
        }

        .ng-input-container.drag-active {
          border-color: rgba(139, 211, 255, 0.55);
          box-shadow: 0 0 0 1px rgba(139, 211, 255, 0.18), 0 18px 42px rgba(0, 0, 0, 0.38);
          background: linear-gradient(180deg, rgba(47, 47, 47, 0.98), rgba(34, 40, 46, 0.98));
        }

        .ng-input-left-accent {
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(139, 211, 255, 0.9), rgba(192, 132, 252, 0.8));
          opacity: 0.7;
        }

        .ng-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          color: #fff;
          font-size: 16px;
          line-height: 1.6;
          padding: 12px 4px 12px 14px;
          max-height: 200px;
          min-height: 26px;
          font-family: inherit;
          scrollbar-width: none;
        }

        .ng-textarea::placeholder {
          color: rgba(255, 255, 255, 0.38);
        }

        .ng-input-actions {
          display: flex;
          padding-bottom: 4px;
          align-items: center;
          gap: 8px;
        }

        .ng-action-btn {
          width: 42px;
          height: 42px;
          border-radius: 16px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .ng-action-btn.send {
          background: rgba(255, 255, 255, 0.16);
          color: rgba(255, 255, 255, 0.7);
          opacity: 0.45;
        }

        .ng-action-btn.send.active {
          background: linear-gradient(135deg, #ffffff, #cfefff);
          color: #111;
          opacity: 1;
          box-shadow: 0 10px 26px rgba(255, 255, 255, 0.12);
        }

        .ng-action-btn.send.active:hover {
          transform: translateY(-1px) scale(1.03);
          background: linear-gradient(135deg, #ffffff, #e7f8ff);
        }

        .ng-action-btn.stop {
          background: rgba(255, 107, 107, 0.12);
          border: 1px solid rgba(255, 107, 107, 0.3);
          color: #ffb0b0;
          opacity: 1;
        }

        .ng-action-btn.stop:hover {
          background: rgba(255, 107, 107, 0.16);
          transform: translateY(-1px) scale(1.03);
        }

        /* ── Paperclip / Attach Button ── */
        .ng-attach-btn {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.5);
          transition: all 0.2s;
          flex-shrink: 0;
          margin-bottom: 3px;
        }
        .ng-attach-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.9);
          transform: rotate(-8deg) scale(1.05);
        }
        .ng-attach-btn.has-file {
          background: rgba(139, 211, 255, 0.15);
          color: #8bd3ff;
          border: 1px solid rgba(139, 211, 255, 0.35);
        }
        .ng-attach-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .ng-attach-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #8bd3ff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── File Preview Strip ── */
        .ng-file-preview-strip {
          width: 100%;
          max-width: var(--input-max-width);
          margin-bottom: 10px;
          animation: fadeIn 0.25s ease-out;
        }
        .ng-file-strip-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 10px;
        }
        .ng-file-chip {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(139, 211, 255, 0.25);
          border-radius: 16px;
          padding: 10px 14px;
          max-width: 100%;
        }
        .ng-file-thumb {
          width: 44px;
          height: 44px;
          border-radius: 8px;
          object-fit: cover;
          border: 1px solid rgba(255,255,255,0.1);
          flex-shrink: 0;
        }
        .ng-file-icon-wrap {
          width: 44px; height: 44px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #8bd3ff;
          flex-shrink: 0;
        }
        .ng-file-chip-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .ng-file-chip-name {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255,255,255,0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 280px;
        }
        .ng-file-chip-type {
          font-size: 12px;
          color: rgba(139, 211, 255, 0.7);
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .ng-file-chip-remove {
          background: transparent;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.4);
          display: flex;
          align-items: center;
          padding: 4px;
          border-radius: 8px;
          transition: all 0.2s;
          margin-left: auto;
        }
        .ng-file-chip-remove:hover {
          color: #ff8f8f;
          background: rgba(255,107,107,0.1);
        }

        /* ── Attachment chip inside message ── */
        .ng-user-message-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ng-message-attachments {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .ng-attachment-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(139, 211, 255, 0.1);
          border: 1px solid rgba(139, 211, 255, 0.3);
          border-radius: 100px;
          padding: 4px 10px 4px 8px;
          font-size: 12px;
          font-weight: 600;
          color: #8bd3ff;
          max-width: 260px;
        }
        .ng-attachment-thumb,
        .ng-attachment-icon {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          flex-shrink: 0;
        }
        .ng-attachment-thumb {
          object-fit: cover;
          border: 1px solid rgba(255,255,255,0.12);
        }
        .ng-attachment-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.08);
        }
        .ng-attachment-chip span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ng-input-footer {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.48);
          margin-top: 12px;
          text-align: center;
          line-height: 1.6;
        }

        .ng-model-indicator {
          color: rgba(255, 255, 255, 0.78);
          margin-left: 4px;
          font-weight: 700;
        }

        .ng-sidebar-backdrop {
          display: none;
        }

        @keyframes float {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(0, -16px, 0) scale(1.03);
          }
        }

        @media (max-width: 920px) {
          .ng-shell {
            --chat-max-width: 860px;
            --chat-side-padding: 18px;
            --input-max-width: 860px;
          }

          .ng-sidebar {
            position: absolute;
            z-index: 200;
            height: 100%;
            width: 304px;
            box-shadow: 12px 0 34px rgba(0, 0, 0, 0.5);
          }

          .ng-sidebar-closed {
            transform: translateX(-100%);
            width: 304px;
          }

          .ng-sidebar-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.52);
            z-index: 199;
          }

          .ng-chat-container {
            width: min(100%, var(--chat-max-width));
            padding-top: 84px;
          }
        }

        @media (max-width: 768px) {
          .ng-shell {
            --chat-side-padding: 14px;
            --input-max-width: 100%;
          }

          .ng-chat-scroll-area {
            padding: 0 var(--chat-side-padding);
          }

          .ng-chat-container {
            padding-top: 80px;
            padding-bottom: 290px;
          }

          .ng-suggestions-grid {
            grid-template-columns: 1fr;
          }

          .ng-message-content,
          .ng-message-row.user .ng-message-content {
            max-width: 100%;
          }

          .ng-message-row {
            gap: 12px;
          }

          .ng-message-shell.user {
            padding: 14px 16px;
          }

          .ng-input-zone {
            padding-left: var(--chat-side-padding);
            padding-right: var(--chat-side-padding);
            padding-bottom: 18px;
          }

          .ng-input-container {
            border-radius: 24px;
            padding: 10px 10px 10px 14px;
          }
        }

        @media (max-width: 560px) {
          .ng-shell {
            --chat-side-padding: 10px;
          }

          .ng-topbar {
            padding-left: 10px;
            padding-right: 10px;
            height: 60px;
          }

          .ng-message-shell {
            padding: 12px 0;
          }

          .ng-message-row {
            gap: 10px;
          }

          .ng-avatar-small {
            width: 34px;
            height: 34px;
          }

          .ng-message-meta {
            gap: 8px;
            margin-bottom: 10px;
            font-size: 10px;
          }

          .ng-message-text {
            font-size: 14px;
            line-height: 1.75;
          }

          .ng-welcome-title {
            font-size: 30px;
          }

          .ng-welcome-subtitle {
            font-size: 14px;
          }

          .ng-sidebar-inner {
            padding: 14px;
          }

          .ng-input-zone {
            padding-bottom: 14px;
          }

          .ng-file-chip {
            width: 100%;
          }

          .ng-file-chip-name {
            max-width: 180px;
          }

          .ng-input-footer {
            font-size: 11px;
            margin-top: 10px;
          }
        }
      `}</style>
    </>
  );
}
