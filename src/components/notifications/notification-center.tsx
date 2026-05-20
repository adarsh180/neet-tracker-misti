"use client";

import { Bell, Check, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type AppNotification = {
  id: string;
  title: string;
  body: string;
  tone: "focus" | "urgent" | "care" | "win" | string;
  senderLabel: string;
  senderClientId: string | null;
  createdAt: string;
};

const POLL_MS = 5000;

function safeJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

function toneLabel(tone: string) {
  if (tone === "urgent") return "Urgent";
  if (tone === "care") return "Care";
  if (tone === "win") return "Win";
  return "Focus";
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(delta / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function NotificationCenter({
  appLabel,
  defaultSender,
  partnerLabel = "Partner app",
}: {
  appLabel: string;
  defaultSender: string;
  partnerLabel?: string;
}) {
  const keyPrefix = useMemo(() => appLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-"), [appLabel]);
  const clientIdKey = `${keyPrefix}-notification-client`;
  const readKey = `${keyPrefix}-notification-read`;
  const notifiedKey = `${keyPrefix}-notification-system-shown`;
  const senderKey = `${keyPrefix}-notification-sender`;

  const [clientId, setClientId] = useState("");
  const [senderLabel, setSenderLabel] = useState(defaultSender);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [browserAlertsSupported, setBrowserAlertsSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const previousIdsRef = useRef<Set<string>>(new Set());

  const unread = notifications.filter((item) => !readIds.has(item.id));

  const persistRead = useCallback(
    (next: Set<string>) => {
      setReadIds(next);
      localStorage.setItem(readKey, JSON.stringify(Array.from(next).slice(-160)));
    },
    [readKey],
  );

  const fetchNotifications = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { notifications: AppNotification[] };
    const next = payload.notifications ?? [];
    setNotifications(next);

    const known = previousIdsRef.current;
    const fresh = next
      .filter((item) => !known.has(item.id))
      .filter((item) => item.senderClientId !== clientId)
      .reverse();

    if (known.size > 0 && fresh.length > 0) {
      setToast(fresh[fresh.length - 1]);
      const shown = new Set(safeJson<string[]>(notifiedKey, []));
      fresh.forEach((item) => {
        if (permission === "granted" && !shown.has(item.id)) {
          new Notification(`${item.senderLabel}: ${item.title}`, {
            body: item.body,
            icon: "/icon-192.png",
            tag: item.id,
          });
          shown.add(item.id);
        }
      });
      localStorage.setItem(notifiedKey, JSON.stringify(Array.from(shown).slice(-160)));
    }

    previousIdsRef.current = new Set(next.map((item) => item.id));
  }, [clientId, notifiedKey, permission]);

  useEffect(() => {
    let id = localStorage.getItem(clientIdKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(clientIdKey, id);
    }
    setClientId(id);
    setSenderLabel(localStorage.getItem(senderKey) || defaultSender);
    setReadIds(new Set(safeJson<string[]>(readKey, [])));
    setBrowserAlertsSupported("Notification" in window && "serviceWorker" in navigator && "PushManager" in window);
    if ("Notification" in window) setPermission(Notification.permission);
  }, [clientIdKey, defaultSender, readKey, senderKey]);

  useEffect(() => {
    if (!clientId || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        setPushEnabled(Boolean(subscription));
        if (subscription) {
          await fetch("/api/push-subscriptions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(subscription)), senderClientId: clientId }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    void fetchNotifications();
    const timer = window.setInterval(fetchNotifications, POLL_MS);
    return () => window.clearInterval(timer);
  }, [clientId, fetchNotifications]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function enablePushAlerts() {
    if (!browserAlertsSupported) {
      setPushStatus("Push is not supported in this browser.");
      return;
    }

    const next = await Notification.requestPermission();
    setPermission(next);
    if (next !== "granted") {
      setPushStatus("Notifications are blocked until permission is allowed.");
      return;
    }

    const configResponse = await fetch("/api/push-subscriptions", { cache: "no-store" });
    if (!configResponse.ok) {
      setPushStatus("Sign in again to enable push.");
      return;
    }

    const config = (await configResponse.json()) as { publicKey?: string; configured?: boolean };
    if (!config.configured || !config.publicKey) {
      setPushStatus("Push keys are missing on the server.");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      }));

    const saveResponse = await fetch("/api/push-subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(subscription)), senderClientId: clientId }),
    });

    if (saveResponse.ok) {
      setPushEnabled(true);
      setPushStatus("Phone push is enabled.");
    } else {
      setPushStatus("Could not save this device for push.");
    }
  }

  async function sendNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const body = String(form.get("body") || "").trim();
    const tone = String(form.get("tone") || "focus");
    const target = String(form.get("target") || "local");
    const sender = String(form.get("senderLabel") || defaultSender).trim() || defaultSender;
    if (!title || !body) return;

    setSending(true);
    localStorage.setItem(senderKey, sender);
    setSenderLabel(sender);

    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, tone, target, senderLabel: sender, senderClientId: clientId }),
      });
      if (response.ok) {
        event.currentTarget.reset();
        setComposerOpen(false);
        await fetchNotifications();
      }
    } finally {
      setSending(false);
    }
  }

  function markAllRead() {
    persistRead(new Set([...readIds, ...notifications.map((item) => item.id)]));
  }

  return (
    <>
      <div className="notify-dock">
        <button
          className="notify-button"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Open notifications"
          aria-expanded={open}
        >
          <Bell size={18} />
          {unread.length > 0 ? <span>{Math.min(unread.length, 9)}</span> : null}
        </button>
      </div>

      {toast && (
        <button className={`notify-toast tone-${toast.tone}`} type="button" onClick={() => setOpen(true)}>
          <Sparkles size={15} />
          <span>
            <strong>{toast.title}</strong>
            <small>{toast.senderLabel}</small>
          </span>
        </button>
      )}

      {open && (
        <section className="notify-panel" aria-label={`${appLabel} notification center`}>
          <header className="notify-head">
            <div>
              <div className="notify-kicker">Live notifications</div>
              <h2>{appLabel}</h2>
            </div>
            <button type="button" className="notify-icon" onClick={() => setOpen(false)} aria-label="Close notifications">
              <X size={16} />
            </button>
          </header>

          <div className="notify-actions">
            <button type="button" onClick={() => setComposerOpen((value) => !value)}>
              <Send size={14} />
              Notify
            </button>
            <button type="button" onClick={markAllRead} disabled={!unread.length}>
              <Check size={14} />
              Read
            </button>
            {browserAlertsSupported ? (
              <button type="button" onClick={enablePushAlerts}>{pushEnabled ? "Push on" : "Phone push"}</button>
            ) : null}
          </div>

          {pushStatus ? <div className="notify-push-status">{pushStatus}</div> : null}

          {composerOpen && (
            <form className="notify-compose" onSubmit={sendNotification}>
              <input name="senderLabel" defaultValue={senderLabel} placeholder="Your name" maxLength={42} />
              <input name="title" placeholder="Short title" maxLength={90} required />
              <textarea name="body" placeholder="Write a useful, non-spammy nudge..." maxLength={420} required />
              <select name="target" defaultValue="partner" aria-label="Notification destination">
                <option value="partner">{partnerLabel}</option>
                <option value="local">This app only</option>
                <option value="both">Both apps</option>
              </select>
              <div className="notify-compose-row">
                <select name="tone" defaultValue="focus">
                  <option value="focus">Focus</option>
                  <option value="urgent">Urgent</option>
                  <option value="care">Care</option>
                  <option value="win">Win</option>
                </select>
                <button type="submit" disabled={sending}>
                  <Send size={14} />
                  {sending ? "Sending" : "Send"}
                </button>
              </div>
            </form>
          )}

          <div className="notify-list">
            {notifications.length ? notifications.map((item) => (
              <article key={item.id} className={`notify-item tone-${item.tone} ${readIds.has(item.id) ? "read" : ""}`}>
                <button type="button" onClick={() => persistRead(new Set([...readIds, item.id]))}>
                  <span className="notify-dot" />
                  <span>
                    <strong>{item.title}</strong>
                    <em>{item.body}</em>
                    <small>{item.senderLabel} · {toneLabel(item.tone)} · {relativeTime(item.createdAt)}</small>
                  </span>
                </button>
              </article>
            )) : <div className="notify-empty">No notifications yet.</div>}
          </div>
        </section>
      )}

      <style jsx>{`
        .notify-dock,
        .notify-panel,
        .notify-toast {
          --text: var(--text-primary);
        }

        .notify-dock {
          position: fixed;
          top: calc(20px + env(safe-area-inset-top));
          right: 22px;
          z-index: 9998;
        }

        .notify-button,
        .notify-icon,
        .notify-actions button,
        .notify-compose button,
        .notify-toast {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(8,10,22,0.78);
          color: var(--text);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          box-shadow: 0 16px 34px rgba(0,0,0,0.34);
          cursor: pointer;
        }

        .notify-button {
          position: relative;
          width: 52px;
          height: 52px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background:
            linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)),
            rgba(8,10,22,0.78);
          border-color: rgba(255,255,255,0.16);
          box-shadow:
            0 18px 42px rgba(0,0,0,0.38),
            inset 0 1px 0 rgba(255,255,255,0.14);
          transition: transform 180ms var(--ease-out), border-color 180ms var(--ease-out), box-shadow 180ms var(--ease-out);
        }

        .notify-button:hover {
          transform: translateY(-2px);
          border-color: rgba(212,168,83,0.38);
          box-shadow:
            0 22px 48px rgba(0,0,0,0.44),
            0 0 24px rgba(212,168,83,0.14),
            inset 0 1px 0 rgba(255,255,255,0.18);
        }

        .notify-button span {
          position: absolute;
          top: -4px;
          right: -2px;
          min-width: 20px;
          height: 20px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, var(--gold), var(--rose-bright));
          color: #07070c;
          font-size: 11px;
          font-weight: 900;
        }

        .notify-panel {
          position: fixed;
          top: calc(84px + env(safe-area-inset-top));
          right: 22px;
          z-index: 10000;
          width: min(420px, calc(100vw - 28px));
          max-height: min(680px, calc(100svh - 108px - env(safe-area-inset-top)));
          display: grid;
          grid-template-rows: auto auto auto minmax(0, 1fr);
          gap: 12px;
          padding: 16px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.13);
          background: linear-gradient(160deg, rgba(255,255,255,0.13), rgba(255,255,255,0.045)), rgba(6,8,20,0.92);
          box-shadow: 0 30px 90px rgba(0,0,0,0.55);
          backdrop-filter: blur(34px) saturate(160%);
          -webkit-backdrop-filter: blur(34px) saturate(160%);
        }

        .notify-head,
        .notify-actions,
        .notify-compose-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .notify-kicker {
          color: var(--gold-bright);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        h2 {
          margin: 4px 0 0;
          font: 800 1.45rem/1 var(--font-display), serif;
        }

        .notify-icon {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: grid;
          place-items: center;
        }

        .notify-actions {
          justify-content: flex-start;
          flex-wrap: wrap;
        }

        .notify-push-status {
          padding: 9px 11px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }

        .notify-actions button,
        .notify-compose button {
          min-height: 34px;
          border-radius: 999px;
          padding: 0 12px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 850;
        }

        .notify-actions button:disabled {
          opacity: 0.42;
          cursor: default;
        }

        .notify-compose {
          display: grid;
          gap: 9px;
          padding: 12px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.045);
        }

        .notify-compose input,
        .notify-compose textarea,
        .notify-compose select {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.11);
          border-radius: 14px;
          background: rgba(0,0,0,0.2);
          color: var(--text);
          padding: 11px 12px;
          font: inherit;
          outline: none;
        }

        .notify-compose textarea {
          min-height: 88px;
          resize: vertical;
        }

        .notify-compose select {
          max-width: 128px;
        }

        .notify-list {
          overflow-y: auto;
          display: grid;
          gap: 8px;
          padding-right: 2px;
        }

        .notify-item button {
          width: 100%;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 10px;
          padding: 12px;
          text-align: left;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          background: rgba(255,255,255,0.045);
          color: var(--text);
          cursor: pointer;
        }

        .notify-item.read {
          opacity: 0.56;
        }

        .notify-dot {
          width: 10px;
          height: 10px;
          margin-top: 5px;
          border-radius: 999px;
          background: var(--gold);
          box-shadow: 0 0 16px var(--gold-glow);
        }

        .tone-urgent .notify-dot { background: var(--danger); }
        .tone-care .notify-dot { background: var(--physics); }
        .tone-win .notify-dot { background: var(--botany); }

        .notify-item strong,
        .notify-item em,
        .notify-item small {
          display: block;
        }

        .notify-item strong {
          font-size: 13px;
          line-height: 1.25;
        }

        .notify-item em {
          margin-top: 5px;
          color: var(--text-secondary);
          font-size: 12px;
          font-style: normal;
          line-height: 1.45;
        }

        .notify-item small {
          margin-top: 8px;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .notify-toast {
          position: fixed;
          top: calc(84px + env(safe-area-inset-top));
          right: 22px;
          z-index: 10001;
          max-width: min(360px, calc(100vw - 28px));
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 18px;
          text-align: left;
          animation: notifyIn 240ms var(--ease-out);
        }

        .notify-toast strong,
        .notify-toast small {
          display: block;
        }

        .notify-toast strong {
          font-size: 13px;
        }

        .notify-toast small {
          margin-top: 2px;
          color: var(--text-muted);
          font-size: 11px;
        }

        .notify-empty {
          padding: 22px;
          border: 1px dashed rgba(255,255,255,0.12);
          border-radius: 18px;
          color: var(--text-muted);
          text-align: center;
          font-size: 13px;
        }

        @keyframes notifyIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 560px) {
          .notify-dock {
            top: calc(12px + env(safe-area-inset-top));
            right: 12px;
          }

          .notify-button {
            width: 48px;
            height: 48px;
          }

          .notify-panel {
            top: calc(72px + env(safe-area-inset-top));
            right: 10px;
            width: calc(100vw - 20px);
            max-height: calc(100svh - 86px - env(safe-area-inset-top));
            border-radius: 22px;
          }

          .notify-toast {
            top: calc(72px + env(safe-area-inset-top));
            right: 10px;
          }
        }
      `}</style>
    </>
  );
}
