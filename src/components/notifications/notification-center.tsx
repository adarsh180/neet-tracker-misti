"use client";

import { Bell, BellRing, Check, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

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
const DISMISS_LIMIT = 240;

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

function pushCountLabel(count: number) {
  return `${count} device${count === 1 ? "" : "s"}`;
}

function NotificationRow({
  item,
  read,
  onRead,
  onDismiss,
}: {
  item: AppNotification;
  read: boolean;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const startXRef = useRef<number | null>(null);
  const lastPointRef = useRef({ x: 0, time: 0 });
  const velocityRef = useRef(0);
  const movedRef = useRef(false);
  const hapticRef = useRef(false);

  const progress = Math.min(Math.abs(dragX) / 118, 1);
  const side = dragX >= 0 ? 1 : -1;

  const dismissWithMotion = useCallback(
    (direction: number) => {
      if (isExiting) return;
      setIsExiting(true);
      setDragX(direction * 460);
      navigator.vibrate?.(18);
      window.setTimeout(onDismiss, 190);
    },
    [isExiting, onDismiss],
  );

  function endDrag() {
    if (startXRef.current === null || isExiting) return;
    const shouldDismiss = Math.abs(dragX) > 92 || Math.abs(velocityRef.current) > 0.72;

    if (shouldDismiss) {
      dismissWithMotion(side);
    } else {
      setDragX(0);
    }

    setIsPressed(false);
    startXRef.current = null;
    hapticRef.current = false;
  }

  return (
    <article
      className={`notify-item tone-${item.tone} ${read ? "read" : ""} ${isPressed ? "dragging" : ""} ${isExiting ? "exiting" : ""}`}
      style={
        {
          "--drag-x": `${dragX}px`,
          "--drag-progress": progress,
          "--drag-tilt": `${Math.max(-2.4, Math.min(2.4, dragX / 44))}deg`,
          "--drag-scale": 1 - progress * 0.018,
        } as CSSProperties
      }
    >
      <div className="notify-dismiss-bg notify-dismiss-bg-left" aria-hidden="true">
        <span>Clear</span>
      </div>
      <div className="notify-dismiss-bg notify-dismiss-bg-right" aria-hidden="true">
        <span>Clear</span>
      </div>
      <button
        type="button"
        className="notify-item-card"
        onClick={() => {
          if (!movedRef.current && !isExiting) onRead();
        }}
        onPointerDown={(event) => {
          if (isExiting) return;
          startXRef.current = event.clientX;
          lastPointRef.current = { x: event.clientX, time: event.timeStamp };
          velocityRef.current = 0;
          movedRef.current = false;
          hapticRef.current = false;
          setIsPressed(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (startXRef.current === null || isExiting) return;
          const raw = event.clientX - startXRef.current;
          const magnitude = Math.abs(raw);
          const resistance = magnitude > 148 ? 148 + (magnitude - 148) * 0.24 : magnitude;
          const next = Math.sign(raw || 1) * Math.min(resistance, 214);
          const elapsed = Math.max(event.timeStamp - lastPointRef.current.time, 1);
          velocityRef.current = (event.clientX - lastPointRef.current.x) / elapsed;
          lastPointRef.current = { x: event.clientX, time: event.timeStamp };

          if (Math.abs(next) > 4) movedRef.current = true;
          if (Math.abs(next) > 74 && !hapticRef.current) {
            navigator.vibrate?.(8);
            hapticRef.current = true;
          }
          if (Math.abs(next) < 42) hapticRef.current = false;

          setDragX(next);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="notify-dot" />
        <span className="notify-copy">
          <span className="notify-row-head">
            <strong>{item.title}</strong>
            <span className="notify-tone">{toneLabel(item.tone)}</span>
          </span>
          <em>{item.body}</em>
          <small>
            <span>From {item.senderLabel}</span>
            <span>{relativeTime(item.createdAt)}</span>
          </small>
        </span>
      </button>
      <button type="button" className="notify-dismiss-btn" onClick={() => dismissWithMotion(-1)} aria-label={`Clear ${item.title}`}>
        <X size={14} />
      </button>
    </article>
  );
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
  const dismissedKey = `${keyPrefix}-notification-dismissed`;
  const senderKey = `${keyPrefix}-notification-sender`;

  const [clientId, setClientId] = useState("");
  const [senderLabel, setSenderLabel] = useState(defaultSender);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [browserAlertsSupported, setBrowserAlertsSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const previousIdsRef = useRef<Set<string>>(new Set());

  const visibleNotifications = notifications.filter((item) => !dismissedIds.has(item.id));
  const unread = visibleNotifications.filter((item) => !readIds.has(item.id));
  const isNeetDesk = appLabel.toLowerCase().includes("neet");
  const copy = {
    kicker: "Device alerts",
    compose: isNeetDesk ? "Send a NEET nudge" : "Send a UPSC nudge",
    titlePlaceholder: isNeetDesk ? "Bio revision sprint" : "Mains answer sprint",
    bodyPlaceholder: isNeetDesk
      ? "20 MCQs before dinner, then mark weak chapters."
      : "Write one GS answer now, then log the gap.",
    pushReady: isNeetDesk
      ? "NEET device push is ready. Test notification sent to this device."
      : "UPSC device push is ready. Test notification sent to this device.",
  };

  const persistRead = useCallback(
    (next: Set<string>) => {
      setReadIds(next);
      localStorage.setItem(readKey, JSON.stringify(Array.from(next).slice(-160)));
    },
    [readKey],
  );

  const persistDismissed = useCallback(
    (next: Set<string>) => {
      setDismissedIds(next);
      localStorage.setItem(dismissedKey, JSON.stringify(Array.from(next).slice(-DISMISS_LIMIT)));
    },
    [dismissedKey],
  );

  const dismissNotification = useCallback(
    (id: string) => {
      persistDismissed(new Set([...dismissedIds, id]));
      persistRead(new Set([...readIds, id]));
    },
    [dismissedIds, persistDismissed, persistRead, readIds],
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
      .filter((item) => !dismissedIds.has(item.id))
      .filter((item) => !readIds.has(item.id))
      .filter((item) => item.senderClientId !== clientId)
      .reverse();

    if (known.size > 0 && fresh.length > 0) {
      setToast(fresh[fresh.length - 1]);
    }

    previousIdsRef.current = new Set(next.map((item) => item.id));
  }, [clientId, dismissedIds, readIds]);

  useEffect(() => {
    let id = localStorage.getItem(clientIdKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(clientIdKey, id);
    }
    setClientId(id);
    setSenderLabel(localStorage.getItem(senderKey) || defaultSender);
    setReadIds(new Set(safeJson<string[]>(readKey, [])));
    setDismissedIds(new Set(safeJson<string[]>(dismissedKey, [])));
    setBrowserAlertsSupported("Notification" in window && "serviceWorker" in navigator && "PushManager" in window);
    if ("Notification" in window) setPermission(Notification.permission);
  }, [clientIdKey, defaultSender, dismissedKey, readKey, senderKey]);

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
    if (existing) {
      await fetch("/api/push-subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: existing.endpoint }),
      }).catch(() => {});
      await existing.unsubscribe().catch(() => false);
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });

    const saveResponse = await fetch("/api/push-subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(subscription)), senderClientId: clientId }),
    });

    if (saveResponse.ok) {
      setPushEnabled(true);
      const testResponse = await fetch("/api/push-subscriptions/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, senderClientId: clientId }),
      });
      setPushStatus(testResponse.ok ? copy.pushReady : "Push is saved, but the server push test failed. Check VAPID env keys and device notification settings.");
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
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        push?: { sent?: number; failed?: number };
        partner?: { push?: { sent?: number; failed?: number }; forwarded?: boolean; reason?: string; status?: number };
      } | null;

      if (!response.ok) {
        setPushStatus(result?.error || "Notification could not be delivered.");
        return;
      }

      const localSent = result?.push?.sent ?? 0;
      const localFailed = result?.push?.failed ?? 0;
      const partnerSent = result?.partner?.push?.sent ?? 0;
      const partnerFailed = result?.partner?.push?.failed ?? 0;
      const totalSent = localSent + partnerSent;
      const totalFailed = localFailed + partnerFailed;

      if (target === "partner") {
        if (partnerSent > 0) {
          setPushStatus(`Receiver device push sent to ${pushCountLabel(partnerSent)}${partnerFailed ? `; ${partnerFailed} failed` : ""}.`);
        } else if (result?.partner?.forwarded) {
          setPushStatus(`${partnerLabel} got the website notification, but 0 receiver devices were registered for push. Open that app on the phone and press Device push.`);
        } else {
          setPushStatus(`Could not reach ${partnerLabel}. Check partner endpoint and secret.`);
        }
      } else if (target === "both") {
        setPushStatus(
          `Push result: this app ${localSent} sent${localFailed ? `, ${localFailed} failed` : ""}; ${partnerLabel} ${partnerSent} sent${partnerFailed ? `, ${partnerFailed} failed` : ""}.`,
        );
      } else if (totalSent > 0) {
        setPushStatus(`Device push sent to ${pushCountLabel(totalSent)}${totalFailed ? `; ${totalFailed} failed` : ""}.`);
      } else {
        setPushStatus("Saved in the notification center, but no device push subscriptions are registered.");
      }

      event.currentTarget.reset();
      setComposerOpen(false);
      await fetchNotifications();
    } finally {
      setSending(false);
    }
  }

  function markAllRead() {
    persistRead(new Set([...readIds, ...visibleNotifications.map((item) => item.id)]));
  }

  function clearRead() {
    const readVisible = visibleNotifications.filter((item) => readIds.has(item.id)).map((item) => item.id);
    const idsToClear = readVisible.length ? readVisible : visibleNotifications.map((item) => item.id);
    persistDismissed(new Set([...dismissedIds, ...idsToClear]));
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
              <div className="notify-kicker">{copy.kicker}</div>
              <h2>{appLabel}</h2>
            </div>
            <button type="button" className="notify-icon" onClick={() => setOpen(false)} aria-label="Close notifications">
              <X size={16} />
            </button>
          </header>

          <div className="notify-actions">
            <button type="button" onClick={() => setComposerOpen((value) => !value)}>
              <Send size={14} />
              Compose
            </button>
            <button type="button" onClick={markAllRead} disabled={!unread.length}>
              <Check size={14} />
              Mark read
            </button>
            <button type="button" onClick={clearRead} disabled={!visibleNotifications.length}>
              <X size={14} />
              Clear read
            </button>
            {browserAlertsSupported ? (
              <button type="button" onClick={enablePushAlerts}>
                <BellRing size={14} />
                {pushEnabled ? "Push ready" : "Device push"}
              </button>
            ) : null}
          </div>

          {pushStatus ? <div className="notify-push-status">{pushStatus}</div> : null}

          {composerOpen && (
            <form className="notify-compose" onSubmit={sendNotification}>
              <input name="senderLabel" defaultValue={senderLabel} placeholder="Your name" maxLength={42} />
              <input name="title" placeholder={copy.titlePlaceholder} maxLength={90} required />
              <textarea name="body" placeholder={copy.bodyPlaceholder} maxLength={420} required />
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
                  {sending ? "Sending" : copy.compose}
                </button>
              </div>
            </form>
          )}

          <div className="notify-list">
            {visibleNotifications.length ? visibleNotifications.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                read={readIds.has(item.id)}
                onRead={() => persistRead(new Set([...readIds, item.id]))}
                onDismiss={() => dismissNotification(item.id)}
              />
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
          border: 1px solid rgba(255,255,255,0.18);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.055) 42%, rgba(255,255,255,0.025)),
            rgba(8,10,22,0.66);
          color: var(--text);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          box-shadow:
            0 16px 34px rgba(0,0,0,0.34),
            inset 0 1px 0 rgba(255,255,255,0.18),
            inset 0 -1px 0 rgba(255,255,255,0.06);
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
            inset 0 1px 0 rgba(255,255,255,0.24),
            inset 0 -8px 18px rgba(255,255,255,0.035);
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
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.18);
          background:
            linear-gradient(150deg, rgba(255,255,255,0.20), rgba(255,255,255,0.075) 34%, rgba(255,255,255,0.035) 68%),
            rgba(6,8,20,0.78);
          box-shadow:
            0 30px 90px rgba(0,0,0,0.55),
            inset 0 1px 0 rgba(255,255,255,0.24),
            inset 0 -1px 0 rgba(255,255,255,0.06);
          backdrop-filter: blur(38px) saturate(190%);
          -webkit-backdrop-filter: blur(38px) saturate(190%);
        }

        .notify-panel::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 46%;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.16), transparent),
            radial-gradient(circle at 18% 0%, rgba(255,255,255,0.18), transparent 36%);
          opacity: 0.72;
        }

        .notify-panel > * {
          position: relative;
          z-index: 1;
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
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 14px;
          background:
            linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)),
            rgba(0,0,0,0.2);
          color: rgba(255,250,238,0.82);
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
          border: 1px solid rgba(255,255,255,0.16);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.15), rgba(255,255,255,0.045)),
            rgba(0,0,0,0.18);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.18),
            0 16px 32px rgba(0,0,0,0.16);
        }

        .notify-compose input,
        .notify-compose textarea,
        .notify-compose select {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 14px;
          background:
            linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025)),
            rgba(0,0,0,0.28);
          color: rgba(255,250,238,0.96);
          padding: 11px 12px;
          font: inherit;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
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

        .notify-item {
          --drag-x: 0px;
          --drag-progress: 0;
          --drag-tilt: 0deg;
          --drag-scale: 1;
          position: relative;
          overflow: hidden;
          border-radius: 20px;
          isolation: isolate;
          transform-origin: center;
          transition: height 220ms cubic-bezier(0.22, 1, 0.36, 1), margin 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease;
        }

        .notify-item.exiting {
          opacity: 0;
          pointer-events: none;
        }

        .notify-dismiss-bg {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          border-radius: inherit;
          opacity: var(--drag-progress);
          transform: scale(calc(0.96 + (var(--drag-progress) * 0.04)));
          transition: opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .notify-dismiss-bg::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background:
            radial-gradient(circle at var(--clear-glow-x, 90%) 50%, rgba(255,255,255,0.18), transparent 34%),
            linear-gradient(135deg, rgba(232,114,138,0.28), rgba(255,111,122,0.13));
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
        }

        .notify-dismiss-bg-left {
          justify-content: flex-start;
          padding-left: 18px;
          --clear-glow-x: 10%;
        }

        .notify-dismiss-bg-right {
          justify-content: flex-end;
          padding-right: 18px;
          --clear-glow-x: 90%;
        }

        .notify-dismiss-bg span {
          position: relative;
          z-index: 1;
          min-width: 62px;
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          color: #fff8f8;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 14px 28px rgba(0,0,0,0.18);
        }

        .notify-item-card {
          position: relative;
          z-index: 1;
          width: 100%;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 11px;
          padding: 13px;
          text-align: left;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 20px;
          background:
            linear-gradient(150deg, rgba(255,255,255,0.18), rgba(255,255,255,0.07) 45%, rgba(255,255,255,0.035)),
            rgba(9,11,22,0.58);
          color: rgba(255,250,238,0.96);
          cursor: pointer;
          box-shadow:
            0 18px 34px rgba(0,0,0,0.22),
            inset 0 1px 0 rgba(255,255,255,0.22),
            inset 0 -1px 0 rgba(255,255,255,0.055);
          backdrop-filter: blur(20px) saturate(170%);
          -webkit-backdrop-filter: blur(20px) saturate(170%);
          transform: translate3d(var(--drag-x), 0, 0) rotateZ(var(--drag-tilt)) scale(var(--drag-scale));
          transition:
            transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 220ms cubic-bezier(0.22, 1, 0.36, 1),
            background 220ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1);
          touch-action: pan-y;
          will-change: transform;
        }

        .notify-item-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 44%;
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.18), transparent),
            radial-gradient(circle at 16% 0%, rgba(255,255,255,0.2), transparent 34%);
          opacity: 0.68;
        }

        .notify-item-card > * {
          position: relative;
          z-index: 1;
        }

        .notify-item.dragging .notify-item-card,
        .notify-item.exiting .notify-item-card {
          transition:
            transform 180ms cubic-bezier(0.2, 0.86, 0.22, 1),
            opacity 160ms ease,
            border-color 160ms ease,
            background 160ms ease;
        }

        .notify-item-card:hover {
          border-color: rgba(255,235,190,0.32);
          background:
            linear-gradient(150deg, rgba(255,255,255,0.23), rgba(255,255,255,0.085) 46%, rgba(255,255,255,0.045)),
            rgba(9,11,22,0.64);
          box-shadow:
            0 22px 42px rgba(0,0,0,0.26),
            0 0 22px rgba(212,168,83,0.12),
            inset 0 1px 0 rgba(255,255,255,0.28);
        }

        .notify-dismiss-btn {
          position: absolute;
          right: 9px;
          top: 50%;
          z-index: 2;
          width: 30px !important;
          height: 30px;
          min-height: 30px;
          display: grid !important;
          place-items: center;
          padding: 0 !important;
          border-radius: 999px !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          background: rgba(0,0,0,0.32) !important;
          color: var(--text-secondary) !important;
          transform: translateY(-50%) scale(0.9);
          opacity: 0;
          backdrop-filter: blur(18px) saturate(150%);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          transition: opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms ease, border-color 160ms ease;
        }

        .notify-item:hover .notify-dismiss-btn,
        .notify-item:focus-within .notify-dismiss-btn {
          opacity: 1;
          transform: translateY(-50%) scale(1);
        }

        .notify-dismiss-btn:hover {
          color: #fff8f8 !important;
          border-color: rgba(232,114,138,0.38) !important;
        }

        .notify-item-card > span:nth-child(2) {
          min-width: 0;
          padding-right: 28px;
        }

        .notify-copy {
          display: grid;
          gap: 7px;
          min-width: 0;
        }

        .notify-row-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }

        .notify-tone {
          flex-shrink: 0;
          min-height: 22px;
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0 8px;
          border: 1px solid rgba(255,255,255,0.16);
          background:
            linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06)),
            rgba(0,0,0,0.18);
          color: rgba(255,229,168,0.96);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .notify-item.read .notify-item-card {
          border-color: rgba(255,255,255,0.12);
          background:
            linear-gradient(150deg, rgba(255,255,255,0.12), rgba(255,255,255,0.045) 48%, rgba(255,255,255,0.025)),
            rgba(9,11,22,0.5);
          box-shadow:
            0 12px 26px rgba(0,0,0,0.16),
            inset 0 1px 0 rgba(255,255,255,0.16);
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
          color: rgba(255,250,238,0.98);
          font-size: 13px;
          line-height: 1.25;
          overflow-wrap: anywhere;
          text-shadow: 0 1px 12px rgba(0,0,0,0.28);
        }

        .notify-item em {
          color: rgba(255,248,232,0.78);
          font-size: 12px;
          font-style: normal;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }

        .notify-item small {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          color: rgba(255,242,218,0.58);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .notify-item small span {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .notify-item.read strong {
          color: rgba(255,250,238,0.86);
        }

        .notify-item.read em {
          color: rgba(255,248,232,0.66);
        }

        .notify-item.read small {
          color: rgba(255,242,218,0.48);
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
          background:
            linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.075)),
            rgba(8,10,22,0.68);
          border-color: rgba(255,255,255,0.2);
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
