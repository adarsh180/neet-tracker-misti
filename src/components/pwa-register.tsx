"use client";

import { Download, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  flushOfflineQueue,
  getOfflineQueueCount,
  installOfflineMutationQueue,
  subscribeOfflineQueue,
} from "@/lib/offline-sync";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [syncing, setSyncing] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [installState, setInstallState] = useState<"idle" | "installing" | "installed">("idle");
  const refreshingRef = useRef(false);
  const shouldRefreshOnControllerChangeRef = useRef(false);

  useEffect(() => {
    const cleanupQueue = installOfflineMutationQueue();
    const unsubscribe = subscribeOfflineQueue(setQueueCount);

    const handleOnline = async () => {
      setSyncing(true);
      await flushOfflineQueue();
      setQueueCount(getOfflineQueueCount());
      setSyncing(false);
    };

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallState("idle");
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setInstallState("installed");
      window.setTimeout(() => setInstallState("idle"), 4200);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      cleanupQueue();
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext && window.location.hostname !== "localhost") return;

    const handleControllerChange = () => {
      if (!shouldRefreshOnControllerChangeRef.current) return;
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };

    let updateCleanup: (() => void) | undefined;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
        if (registration.waiting) setWaitingWorker(registration.waiting);
        void registration.update().catch(() => undefined);

        const update = () => {
          if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
        };

        document.addEventListener("visibilitychange", update);
        const timer = window.setInterval(update, 30 * 60 * 1000);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(worker);
            }
          });
        });

        updateCleanup = () => {
          document.removeEventListener("visibilitychange", update);
          window.clearInterval(timer);
        };
      }).catch((error) => {
        console.warn("[pwa] service worker registration failed", error);
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    if (document.readyState === "complete") {
      register();
      return () => {
        updateCleanup?.();
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      };
    }

    window.addEventListener("load", register, { once: true });
    return () => {
      updateCleanup?.();
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const showStatus = queueCount > 0 || !online || syncing || installPrompt || installState !== "idle" || waitingWorker;

  if (!showStatus) return null;

  return (
    <div className="pwa-status" aria-live="polite" data-studio-chrome>
      <div className={`pwa-pill ${online ? "" : "offline"}`}>
        {syncing ? <RefreshCw size={14} className="spin" /> : online ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span>{queueCount > 0 ? `${queueCount} waiting to sync` : online ? "Synced" : "Offline"}</span>
      </div>

      {waitingWorker && (
        <button className="pwa-install" type="button" disabled={updating || queueCount > 0 || syncing || !online}
          title={queueCount > 0 ? "Sync your saved changes before updating" : "Apply the update when you have finished your current work"}
          onClick={() => {
            if (document.body.classList.contains("cbt-exam-active") || getOfflineQueueCount() > 0) return;
            if (!window.confirm("Ready to update? The app will reload. Save any open form and finish your voice session first.")) return;
            setUpdating(true);
            shouldRefreshOnControllerChangeRef.current = true;
            if (waitingWorker.state === "activated") window.location.reload();
            else waitingWorker.postMessage({ type: "SKIP_WAITING" });
          }}>
          <RefreshCw size={14} />{updating ? "Updating…" : "Update when ready"}
        </button>
      )}

      {installPrompt && (
        <button
          className="pwa-install"
          type="button"
          onClick={async () => {
            setInstallState("installing");
            await installPrompt.prompt();
            const choice = await installPrompt.userChoice;
            setInstallPrompt(null);
            if (choice.outcome === "dismissed") {
              setInstallState("idle");
            } else {
              window.setTimeout(() => {
                setInstallState((current) => (current === "installing" ? "installed" : current));
                window.setTimeout(() => setInstallState("idle"), 4200);
              }, 1200);
            }
          }}
        >
          <Download size={14} />
          {installState === "installing" ? "Installing" : "Install"}
        </button>
      )}
      {!installPrompt && installState === "installed" ? (
        <div className="pwa-pill installed">
          <Download size={14} />
          <span>Installed</span>
        </div>
      ) : null}

      <style jsx>{`
        .pwa-status {
          position: fixed;
          left: 50%;
          bottom: calc(164px + env(safe-area-inset-bottom));
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 8px;
          max-width: calc(100vw - 24px);
          flex-wrap: wrap;
          justify-content: center;
          transform: translateX(-50%);
          pointer-events: none;
        }

        .pwa-pill,
        .pwa-install {
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid var(--glass-border-mid);
          border-radius: 999px;
          background: var(--bg-surface);
          color: var(--text-primary);
          box-shadow: 0 12px 26px rgba(0,0,0,0.32);
          backdrop-filter: blur(18px) saturate(150%);
          -webkit-backdrop-filter: blur(18px) saturate(150%);
          font-size: 12px;
          font-weight: 850;
        }

        .pwa-pill {
          padding: 0 12px;
        }

        .pwa-pill.offline {
          border-color: rgba(251,191,36,0.24);
          color: var(--gold);
        }

        .pwa-pill.installed {
          border-color: rgba(80,220,155,0.24);
          color: #6ee7b7;
        }

        .pwa-install {
          padding: 0 13px;
          border-color: rgba(212,168,83,0.3);
          background: var(--gold);
          color: var(--bg-void);
          cursor: pointer;
          pointer-events: auto;
        }

        .pwa-install:disabled { opacity: .55; cursor: not-allowed; }

        .spin {
          animation: spin 0.9s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 600px) {
          .pwa-status {
            bottom: calc(164px + env(safe-area-inset-bottom));
          }

          .pwa-pill span,
          .pwa-install {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
}
