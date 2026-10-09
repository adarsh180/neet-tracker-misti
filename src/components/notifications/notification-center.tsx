"use client";

import { Bell, BellRing, Check, CheckCheck, Link2, Link2Off, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";

/**
 * Messages between the UPSC desk and the NEET desk, plus each site's own
 * alerts. Identical in both repos. Polls every 5 s, keeps a week, shows what
 * you sent and whether it was delivered, checks the link to the other site,
 * and arms OS push per device.
 */

type AppNotification = { id: string; title: string; body: string; tone: "focus" | "urgent" | "care" | "win" | string; senderLabel: string; senderClientId: string | null; createdAt: string };
type PersistentNotificationOptions = NotificationOptions & { actions?: Array<{ action: string; title: string }>; renotify?: boolean; requireInteraction?: boolean; vibrate?: number[] };

const POLL_MS = 5000;
const DISMISS_LIMIT = 300;
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
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const raw = window.atob((base64String + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const permissionNow = (): NotificationPermission => ("Notification" in window ? Notification.permission : "default");

function Row({ item, mine, read, partnerName, onRead, onDismiss }: { item: AppNotification; mine: boolean; read: boolean; partnerName: string; onRead: () => void; onDismiss: () => void }) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  const leave = (dir: number) => {
    setLeaving(true);
    setDx(dir * 420);
    navigator.vibrate?.(14);
    window.setTimeout(onDismiss, 180);
  };
  const end = () => {
    if (start.current === null) return;
    start.current = null;
    if (Math.abs(dx) > 96) leave(Math.sign(dx));
    else setDx(0);
  };
  return (
    <li className={`nc-item t-${item.tone} ${read ? "is-read" : ""} ${mine ? "is-mine" : ""} ${leaving ? "is-leaving" : ""}`} style={{ "--dx": `${dx}px`, "--p": Math.min(1, Math.abs(dx) / 110) } as CSSProperties}>
      <button
        type="button"
        className="nc-item-card"
        onClick={() => !moved.current && onRead()}
        onPointerDown={(e) => {
          start.current = e.clientX;
          moved.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (start.current === null) return;
          const d = e.clientX - start.current;
          if (Math.abs(d) > 5) moved.current = true;
          setDx(Math.sign(d) * Math.min(Math.abs(d), 200));
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span className="nc-stripe" aria-hidden="true" />
        <span className="nc-item-body">
          <span className="nc-item-top">
            <b>{item.title}</b>
            {!read && !mine ? <i className="nc-unread" aria-label="unread" /> : null}
          </span>
          <span className="nc-text">{item.body}</span>
          <span className="nc-meta">
            {mine ? <span className="nc-sent"><CheckCheck size={13} /> You → {partnerName === "this desk" ? "this desk" : partnerName}</span> : <span>From {item.senderLabel}</span>}
            <span>·</span>
            <span>{relativeTime(item.createdAt)}</span>
            <span className="nc-tone">{TONES.find((t) => t.key === item.tone)?.label ?? "Focus"}</span>
          </span>
        </span>
      </button>
      <button type="button" className="nc-x" onClick={() => leave(-1)} aria-label={`Clear ${item.title}`}><X size={14} /></button>
    </li>
  );
}

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
  const [compose, setCompose] = useState(false);
  const [target, setTarget] = useState<"partner" | "local" | "both">("partner");
  const [tone, setTone] = useState("focus");
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
  const alerted = useRef<Set<string>>(new Set());

  const visible = items.filter((i) => !dismissed.has(i.id));
  const isMine = useCallback((i: AppNotification) => Boolean(clientId) && i.senderClientId === clientId, [clientId]);
  const unread = visible.filter((i) => !readIds.has(i.id) && !isMine(i));

  const persistRead = useCallback((next: Set<string>) => {
    setReadIds(next);
    localStorage.setItem(keys.read, JSON.stringify([...next].slice(-300)));
  }, [keys.read]);
  const persistDismissed = useCallback((next: Set<string>) => {
    setDismissed(next);
    localStorage.setItem(keys.dismissed, JSON.stringify([...next].slice(-DISMISS_LIMIT)));
  }, [keys.dismissed]);

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
    const res = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
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
      if (ask) setStatus({ tone: "bad", text: "Could not save this device for push." });
      return false;
    }
    setPushOn(true);
    if (test) {
      const t = await fetch("/api/push-subscriptions/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, senderClientId: clientId }) }).catch(() => null);
      setStatus(t?.ok ? { tone: "good", text: "This device will now get alerts — a test was just sent." } : { tone: "bad", text: "Saved, but the test push failed. Check the device's notification settings." });
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
    const timer = window.setInterval(fetchItems, POLL_MS);
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
    if (open && !link) void checkLink();
  }, [open, link, checkLink]);

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

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const title = String(f.get("title") || "").trim();
    const body = String(f.get("body") || "").trim();
    const from = String(f.get("senderLabel") || defaultSender).trim() || defaultSender;
    if (!title || !body) return;
    setSending(true);
    setStatus(null);
    localStorage.setItem(keys.sender, from);
    setSender(from);
    try {
      const res = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, body, tone, target, senderLabel: from, senderClientId: clientId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ tone: "bad", text: data.error ?? "Not sent — try again." });
        if (target !== "local") void checkLink();
        return;
      }
      const pushed = (data.partner?.push?.sent ?? 0) + (data.push?.sent ?? 0);
      setStatus({
        tone: "good",
        text: target === "local" ? "Saved on this desk." : `Delivered to ${partnerLabel}.${pushed ? ` Alert sent to ${pushed} device${pushed === 1 ? "" : "s"}.` : " They'll see it in their panel; device alerts need push turned on there."}`,
      });
      form.reset();
      setCompose(false);
      await fetchItems();
    } catch {
      setStatus({ tone: "bad", text: "Network error — not sent." });
    } finally {
      setSending(false);
    }
  }

  const panel = (
    <section className={`nc-panel ${floating ? "is-floating" : ""}`} role="dialog" aria-label={`${appLabel} messages`}>
      <header className="nc-head">
        <div>
          <h2>Messages</h2>
          <p>{unread.length ? `${unread.length} new` : "All caught up"} · kept for 7 days</p>
        </div>
        <button type="button" className="nc-icon" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
      </header>

      <button type="button" className={`nc-link ${link ? (link.linked ? "is-ok" : "is-bad") : ""}`} onClick={() => void checkLink()} title="Check the link again">
        {link?.linked === false ? <Link2Off size={14} /> : <Link2 size={14} />}
        <span>{!link ? `Checking the link to ${partnerLabel}…` : link.linked ? `Linked with ${partnerLabel}` : `Not linked — ${link.problem ?? "unknown problem"}`}</span>
      </button>

      <div className="nc-actions">
        <button type="button" className={`nc-chip ${compose ? "is-on" : ""}`} onClick={() => setCompose((v) => !v)} aria-expanded={compose}><Send size={14} /> Write</button>
        <button type="button" className="nc-chip" onClick={() => persistRead(new Set([...readIds, ...visible.map((i) => i.id)]))} disabled={!unread.length}><Check size={14} /> Mark read</button>
        <button type="button" className="nc-chip" onClick={() => persistDismissed(new Set([...dismissed, ...visible.filter((i) => readIds.has(i.id) || isMine(i)).map((i) => i.id)]))} disabled={!visible.length}><X size={14} /> Clear read</button>
        {pushSupported ? (
          <button type="button" className={`nc-chip ${pushOn && permission === "granted" ? "is-good" : ""}`} onClick={async () => { setArming(true); try { await ensurePush({ ask: true, test: true }); } finally { setArming(false); } }} disabled={arming || permission === "denied"}>
            <BellRing size={14} /> {permission === "denied" ? "Alerts blocked" : arming ? "Turning on…" : pushOn && permission === "granted" ? "Alerts on" : "Alerts on this device"}
          </button>
        ) : null}
      </div>

      {status ? <p className={`nc-status is-${status.tone}`} role="status">{status.text}</p> : null}

      {compose ? (
        <form className="nc-compose" onSubmit={send}>
          <div className="nc-to" role="group" aria-label="Send to">
            {([["partner", partnerName], ["local", "This desk"], ["both", "Both"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={target === k} onClick={() => setTarget(k)}>{l}</button>
            ))}
          </div>
          <input name="title" placeholder="Title" maxLength={90} required autoFocus />
          <textarea name="body" placeholder="Message" maxLength={420} required rows={3} />
          <div className="nc-compose-row">
            <div className="nc-tones" role="group" aria-label="Tone">
              {TONES.map((t) => <button key={t.key} type="button" className={`t-${t.key}`} aria-pressed={tone === t.key} onClick={() => setTone(t.key)}>{t.label}</button>)}
            </div>
            <input name="senderLabel" defaultValue={sender} maxLength={42} aria-label="Signed as" className="nc-from" />
          </div>
          <button type="submit" className="nc-send" disabled={sending}><Send size={15} /> {sending ? "Sending…" : target === "local" ? "Save" : `Send to ${target === "both" ? "both" : partnerName}`}</button>
        </form>
      ) : null}

      <ul className="nc-list">
        {visible.length ? (
          visible.map((i) => (
            <Row key={i.id} item={i} mine={isMine(i)} read={readIds.has(i.id)} partnerName={partnerName} onRead={() => persistRead(new Set([...readIds, i.id]))} onDismiss={() => persistDismissed(new Set([...dismissed, i.id]))} />
          ))
        ) : (
          <li className="nc-empty">No messages this week.</li>
        )}
      </ul>
    </section>
  );

  return (
    <>
      <div className={floating ? "nc-dock" : "nc-inline"}>
        <button className={`nc-bell ${floating ? "" : "v2-iconbtn notify-button"} ${open ? "is-open" : ""}`} type="button" onClick={() => setOpen((v) => !v)} aria-label={unread.length ? `Messages, ${unread.length} new` : "Messages"} aria-expanded={open}>
          <Bell size={18} />
          {unread.length ? <span className="nc-badge">{Math.min(unread.length, 9)}</span> : null}
        </button>
      </div>
      {mounted && open ? createPortal(<><div className="nc-scrim" onClick={() => setOpen(false)} />{panel}</>, document.body) : null}
      {mounted && toast && !open
        ? createPortal(
            <button className={`nc-toast t-${toast.tone}`} type="button" onClick={() => { setToast(null); setOpen(true); }}>
              <span className="nc-stripe" aria-hidden="true" />
              <span><b>{toast.title}</b><small>{toast.senderLabel} · {toast.body.slice(0, 80)}{toast.body.length > 80 ? "…" : ""}</small></span>
            </button>,
            document.body,
          )
        : null}
    </>
  );
}
