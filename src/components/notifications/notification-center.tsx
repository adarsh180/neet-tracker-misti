"use client";

import { Bell, BellRing, CheckCheck, Eraser, Link2, Link2Off, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

/**
 * Messages between the UPSC desk and the NEET desk, plus each site's own
 * alerts, as one conversation. Identical in both repos. Polls every 5 s,
 * keeps a week, shows what you sent and whether it was delivered, checks the
 * link to the other site, and arms OS push per device.
 */

type AppNotification = { id: string; title: string; body: string; tone: "focus" | "urgent" | "care" | "win" | string; senderLabel: string; senderClientId: string | null; createdAt: string; readAt?: string | null };
type PersistentNotificationOptions = NotificationOptions & { actions?: Array<{ action: string; title: string }>; renotify?: boolean; requireInteraction?: boolean; vibrate?: number[] };
type Kind = "mine" | "theirs" | "alert";

// Push alerts arrive instantly; this poll is only the fallback, and only while the tab is visible.
const POLL_MS = 30000;
const DESKTOP_ALERT_QUERY = "(min-width: 900px) and (hover: hover) and (pointer: fine)";
const TONES = [
  { key: "focus", label: "Focus" },
  { key: "care", label: "Care" },
  { key: "win", label: "Win" },
  { key: "urgent", label: "Urgent" },
];

function safeJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}
const time = (v: string) => new Date(v).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
function dayLabel(v: string) {
  const d = new Date(v);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const raw = window.atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const permissionNow = (): NotificationPermission => ("Notification" in window ? Notification.permission : "default");
const initial = (s: string) => s.trim().charAt(0).toUpperCase() || "•";

export function NotificationCenter({ appLabel, defaultSender, partnerLabel = "Partner app", floating = false }: { appLabel: string; defaultSender: string; partnerLabel?: string; floating?: boolean }) {
  const prefix = useMemo(() => appLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-"), [appLabel]);
  const keys = { client: `${prefix}-notification-client`, read: `${prefix}-notification-read`, dismissed: `${prefix}-notification-dismissed`, sender: `${prefix}-notification-sender` };
  const partnerName = partnerLabel.split("’")[0].split("'")[0];

  const [clientId, setClientId] = useState("");
  const [sender, setSender] = useState(defaultSender);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"partner" | "local" | "both">("partner");
  const [tone, setTone] = useState("focus");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [status, setStatus] = useState<{ tone: "good" | "bad" | "info"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [arming, setArming] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [link, setLink] = useState<{ linked: boolean; problem: string | null } | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [mounted, setMounted] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const tag = useRef<string | null>(null);
  const alerted = useRef<Set<string>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);

  const kindOf = useCallback(
    (i: AppNotification): Kind => {
      // Sent from this browser, or from another of my devices (same name, a person not an app) → mine.
      if (clientId && i.senderClientId === clientId) return "mine";
      if (i.senderClientId && i.senderLabel.toLowerCase() === defaultSender.toLowerCase()) return "mine";
      return i.senderClientId || i.senderLabel.toLowerCase() === partnerName.toLowerCase() ? "theirs" : "alert";
    },
    [clientId, partnerName, defaultSender],
  );
  const visible = useMemo(() => items.filter((i) => !dismissed.has(i.id)), [items, dismissed]);
  const unread = visible.filter((i) => !i.readAt && !readIds.has(i.id) && kindOf(i) !== "mine");
  // Oldest first, grouped by day — reads like a conversation.
  const groups = useMemo(() => {
    const out: Array<{ day: string; list: AppNotification[] }> = [];
    for (const i of [...visible].reverse()) {
      const d = dayLabel(i.createdAt);
      if (out.at(-1)?.day === d) out.at(-1)!.list.push(i);
      else out.push({ day: d, list: [i] });
    }
    return out;
  }, [visible]);

  const persistRead = useCallback((next: Set<string>) => {
    setReadIds(next);
    localStorage.setItem(keys.read, JSON.stringify([...next].slice(-300)));
  }, [keys.read]);
  const persistDismissed = useCallback((next: Set<string>) => {
    setDismissed(next);
    localStorage.setItem(keys.dismissed, JSON.stringify([...next].slice(-300)));
  }, [keys.dismissed]);

  // Read / cleared state lives on the server, so every device of this desk agrees.
  const sync = useCallback((op: "read" | "clear", ids: string[]) => {
    if (!ids.length) return;
    void fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, ids }) }).catch(() => null);
  }, []);
  const clearIds = useCallback(
    (ids: string[]) => {
      persistDismissed(new Set([...dismissed, ...ids]));
      setItems((list) => list.filter((i) => !ids.includes(i.id)));
      sync("clear", ids);
    },
    [dismissed, persistDismissed, sync],
  );

  const systemAlert = useCallback(async (item: AppNotification) => {
    if (!desktop || !pushSupported || permissionNow() !== "granted" || alerted.current.has(item.id)) return;
    alerted.current.add(item.id);
    try {
      const reg = await navigator.serviceWorker.ready;
      const opts: PersistentNotificationOptions = { body: item.body, icon: "/icon-192.png", badge: "/icon-192.png", tag: item.id, data: { id: item.id, url: "/dashboard", tone: item.tone }, actions: [{ action: "open", title: "Open" }], renotify: true, requireInteraction: item.tone === "urgent", silent: false, vibrate: [160, 70, 160] };
      await reg.showNotification(`${item.senderLabel}: ${item.title}`, opts);
    } catch {
      alerted.current.delete(item.id);
    }
  }, [desktop, pushSupported]);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store", headers: tag.current ? { "x-notify-tag": tag.current } : {} }).catch(() => null);
    if (!res?.ok || res.status === 204) return;
    tag.current = res.headers.get("x-notify-tag");
    const data = (await res.json().catch(() => ({}))) as { notifications?: AppNotification[] };
    const next = data.notifications ?? [];
    setItems(next);
    // The first load only learns what is already there; anything after that is new and pops up.
    if (known.current) {
      const fresh = next.filter((i) => !known.current!.has(i.id) && !(clientId && i.senderClientId === clientId));
      if (fresh.length) {
        setToast(fresh[0]);
        fresh.slice(0, 3).forEach((i) => void systemAlert(i));
      }
    }
    known.current = new Set(next.map((i) => i.id));
  }, [clientId, systemAlert]);

  const checkLink = useCallback(async () => {
    const res = await fetch("/api/notifications?partner=1", { cache: "no-store" }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    setLink(data ? { linked: Boolean(data.linked), problem: data.problem ?? null } : { linked: false, problem: "Could not check the link." });
  }, []);

  const ensurePush = useCallback(async ({ ask = false, test = false } = {}) => {
    if (!clientId || !pushSupported) return false;
    let perm = permissionNow();
    if (ask && perm !== "granted") perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") {
      setPushOn(false);
      if (ask) setStatus({ tone: "bad", text: "Notifications are blocked — allow them in the browser's site settings." });
      return false;
    }
    const cfgRes = await fetch("/api/push-subscriptions", { cache: "no-store" }).catch(() => null);
    const cfg = cfgRes?.ok ? ((await cfgRes.json()) as { publicKey?: string; configured?: boolean }) : null;
    if (!cfg?.configured || !cfg.publicKey) {
      if (ask) setStatus({ tone: "bad", text: "Push keys are missing on the server." });
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) }));
    const saved = await fetch("/api/push-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)), senderClientId: clientId }) }).catch(() => null);
    if (!saved?.ok) {
      setPushOn(false);
      if (ask) setStatus({ tone: "bad", text: "Could not save this device for alerts." });
      return false;
    }
    setPushOn(true);
    if (test) {
      const t = await fetch("/api/push-subscriptions/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, senderClientId: clientId }) }).catch(() => null);
      setStatus(t?.ok ? { tone: "good", text: "This device now gets alerts — a test was just sent." } : { tone: "bad", text: "Saved, but the test alert failed. Check the device's notification settings." });
    }
    return true;
  }, [clientId, pushSupported]);

  useEffect(() => {
    setMounted(true);
    let id = localStorage.getItem(keys.client);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(keys.client, id);
    }
    setClientId(id);
    setSender(localStorage.getItem(keys.sender) || defaultSender);
    setReadIds(new Set(safeJson<string[]>(keys.read, [])));
    setDismissed(new Set(safeJson<string[]>(keys.dismissed, [])));
    setPushSupported("Notification" in window && "serviceWorker" in navigator && "PushManager" in window);
    setPermission(permissionNow());
    const media = window.matchMedia(DESKTOP_ALERT_QUERY);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep this device's push subscription fresh (it can rotate silently).
  useEffect(() => {
    if (!clientId || !pushSupported) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setPushOn(Boolean(sub));
        if (sub) await fetch("/api/push-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)), senderClientId: clientId }) }).catch(() => {});
        else if (permissionNow() === "granted") await ensurePush();
      } catch {
        if (!cancelled) setPushOn(false);
      }
    };
    void refresh();
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("online", refresh);
    };
  }, [clientId, pushSupported, ensurePush]);

  useEffect(() => {
    if (!clientId) return;
    void fetchItems();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void fetchItems(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void fetchItems();
    window.addEventListener("online", fetchItems);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", fetchItems);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clientId, fetchItems]);

  useEffect(() => {
    if (!open) return;
    if (!link) void checkLink();
    // Opening the conversation reads it — on every device — and lands at the newest message.
    persistRead(new Set([...readIds, ...visible.map((i) => i.id)]));
    sync("read", visible.filter((i) => !i.readAt).map((i) => i.id));
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
  }, [items.length, open]);

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread.length) void nav.setAppBadge?.(unread.length).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unread.length]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text) return;
    const head = title.trim() || (text.length > 48 ? `${text.slice(0, 46).trimEnd()}…` : text);
    setSending(true);
    setStatus(null);
    localStorage.setItem(keys.sender, sender);
    try {
      const res = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: head, body: text, tone, target, senderLabel: sender || defaultSender, senderClientId: clientId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ tone: "bad", text: data.error ?? "Not sent — try again." });
        if (target !== "local") void checkLink();
        return;
      }
      const pushed = (data.partner?.push?.sent ?? 0) + (data.push?.sent ?? 0);
      setStatus(target === "local" ? null : { tone: "good", text: `Delivered to ${partnerName}${pushed ? ` · alert on ${pushed} device${pushed === 1 ? "" : "s"}` : " · they'll see it when they open their desk"}` });
      setTitle("");
      setBody("");
      await fetchItems();
    } catch {
      setStatus({ tone: "bad", text: "Network error — not sent." });
    } finally {
      setSending(false);
    }
  }
  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && desktop) {
      e.preventDefault();
      void send();
    }
  };

  const panel = (
    <section className={`nc-panel ${floating ? "is-floating" : ""}`} role="dialog" aria-label={`${appLabel} messages`}>
      <span className="nc-ambient" aria-hidden="true" />
      <header className="nc-head">
        <span className="nc-pair" aria-hidden="true">
          <i className="me">{initial(defaultSender)}</i>
          <i className="you">{initial(partnerName)}</i>
        </span>
        <div className="nc-head-copy">
          <h2>{partnerName}</h2>
          <button type="button" className={`nc-link ${link ? (link.linked ? "is-ok" : "is-bad") : ""}`} onClick={() => void checkLink()} title={link?.problem ?? "Check the link again"}>
            {link?.linked === false ? <Link2Off size={12} /> : <Link2 size={12} />}
            {!link ? "checking the link…" : link.linked ? `linked · ${partnerLabel}` : `not linked — ${link.problem ?? "unknown"}`}
          </button>
        </div>
        <div className="nc-tools">
          {pushSupported ? (
            <button type="button" className={`nc-tool ${pushOn && permission === "granted" ? "is-on" : ""}`} onClick={async () => { setArming(true); try { await ensurePush({ ask: true, test: true }); } finally { setArming(false); } }} disabled={arming || permission === "denied"} title={permission === "denied" ? "Alerts are blocked in this browser" : pushOn && permission === "granted" ? "Alerts are on for this device — tap to send a test" : "Turn on alerts for this device"}>
              <BellRing size={16} />
            </button>
          ) : null}
          <button type="button" className="nc-tool" onClick={() => confirm("Clear the whole conversation on all your devices?") && clearIds(visible.map((i) => i.id))} disabled={!visible.length} title="Clear the conversation (on all your devices)"><Eraser size={16} /></button>
          <button type="button" className="nc-tool" onClick={() => setOpen(false)} aria-label="Close"><X size={17} /></button>
        </div>
      </header>

      {status ? <p className={`nc-status is-${status.tone}`} role="status">{status.text}</p> : null}

      <div className="nc-thread" ref={scroller}>
        {groups.length ? (
          groups.map((g) => (
            <div key={g.day} className="nc-day">
              <span className="nc-day-label">{g.day}</span>
              {g.list.map((i) => {
                const k = kindOf(i);
                return (
                  <article key={i.id} className={`nc-msg k-${k} t-${i.tone}`}>
                    {k === "alert" ? <span className="nc-alert-icon" aria-hidden="true"><Sparkles size={13} /></span> : null}
                    <div className="nc-bubble">
                      {k === "alert" ? <span className="nc-from">{i.senderLabel}</span> : null}
                      <b>{i.title}</b>
                      {i.body && i.body !== i.title ? <p>{i.body}</p> : null}
                      <span className="nc-meta">
                        {k === "theirs" && i.senderLabel.toLowerCase() !== partnerName.toLowerCase() ? <span>{i.senderLabel}</span> : null}
                        <span>{time(i.createdAt)}</span>
                        {i.tone !== "focus" ? <span className="nc-tone">{TONES.find((t) => t.key === i.tone)?.label}</span> : null}
                        {k === "mine" ? <CheckCheck size={13} className="nc-tick" aria-label="Delivered" /> : null}
                      </span>
                    </div>
                    <button type="button" className="nc-x" onClick={() => clearIds([i.id])} aria-label={`Clear ${i.title}`}><X size={12} /></button>
                  </article>
                );
              })}
            </div>
          ))
        ) : (
          <div className="nc-empty">
            <span className="nc-pair big" aria-hidden="true"><i className="me">{initial(defaultSender)}</i><i className="you">{initial(partnerName)}</i></span>
            <b>No messages this week</b>
            <small>Write to {partnerName} below — it lands on their desk and their phone.</small>
          </div>
        )}
      </div>

      <form className="nc-compose" onSubmit={send}>
        <div className="nc-compose-top">
          <div className="nc-to" role="group" aria-label="Send to">
            {([["partner", partnerName], ["both", "Both desks"], ["local", "Note to self"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={target === k} onClick={() => setTarget(k)}>{l}</button>
            ))}
          </div>
          <div className="nc-tones" role="group" aria-label="Tone">
            {TONES.map((t) => <button key={t.key} type="button" className={`t-${t.key}`} aria-pressed={tone === t.key} onClick={() => setTone(t.key)} title={t.label} aria-label={t.label} />)}
          </div>
        </div>
        <input className="nc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={90} />
        <div className="nc-compose-row">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={onKey} placeholder={`Message ${target === "local" ? "yourself" : partnerName}…`} maxLength={420} rows={1} aria-label="Message" />
          <button type="submit" className="nc-send" disabled={sending || !body.trim()} aria-label="Send"><Send size={17} /></button>
        </div>
      </form>
    </section>
  );

  return (
    <>
      <div className={floating ? "nc-dock" : "nc-inline"}>
        <button className={`nc-bell ${floating ? "" : "v2-iconbtn notify-button"} ${open ? "is-open" : ""} ${unread.length ? "has-new" : ""}`} type="button" onClick={() => setOpen((v) => !v)} aria-label={unread.length ? `Messages, ${unread.length} new` : "Messages"} aria-expanded={open}>
          <Bell size={18} />
          {unread.length ? <span className="nc-badge">{Math.min(unread.length, 9)}</span> : null}
        </button>
      </div>
      {mounted && open ? createPortal(<><div className="nc-scrim" onClick={() => setOpen(false)} />{panel}</>, document.body) : null}
      {mounted && toast && !open
        ? createPortal(
            <button className={`nc-toast t-${toast.tone}`} type="button" onClick={() => { setToast(null); setOpen(true); }} style={{ "--i": 0 } as CSSProperties}>
              <span className="nc-toast-avatar">{initial(toast.senderLabel)}</span>
              <span><b>{toast.senderLabel}</b><small>{toast.title}{toast.body && toast.body !== toast.title ? ` — ${toast.body.slice(0, 70)}${toast.body.length > 70 ? "…" : ""}` : ""}</small></span>
            </button>,
            document.body,
          )
        : null}
    </>
  );
}
