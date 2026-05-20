"use client";

import { Download, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
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

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const cleanupQueue = installOfflineMutationQueue();
    const unsubscribe = subscribeOfflineQueue(setQueueCount);

    const handleOnline = async () => {
      setOnline(true);
      setSyncing(true);
      await flushOfflineQueue();
      setQueueCount(getOfflineQueueCount());
      setSyncing(false);
    };

    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    return () => {
      cleanupQueue();
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext && window.location.hostname !== "localhost") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.warn("[pwa] service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  const showStatus = queueCount > 0 || !online || syncing || installPrompt;

  if (!showStatus) return null;

  return (
    <div className="pwa-status" aria-live="polite">
      <div className={`pwa-pill ${online ? "" : "offline"}`}>
        {syncing ? <RefreshCw size={14} className="spin" /> : online ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span>{queueCount > 0 ? `${queueCount} waiting to sync` : online ? "Synced" : "Offline"}</span>
      </div>

      {installPrompt && (
        <button
          className="pwa-install"
          type="button"
          onClick={async () => {
            await installPrompt.prompt();
            await installPrompt.userChoice;
            setInstallPrompt(null);
          }}
        >
          <Download size={14} />
          Install
        </button>
      )}

      <style jsx>{`
        .pwa-status {
          position: fixed;
          left: 50%;
          bottom: calc(18px + env(safe-area-inset-bottom));
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 8px;
          transform: translateX(-50%);
          pointer-events: none;
        }

        .pwa-pill,
        .pwa-install {
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 999px;
          background: rgba(16,16,22,0.82);
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

        .pwa-install {
          padding: 0 13px;
          border-color: rgba(212,168,83,0.3);
          background: linear-gradient(135deg, rgba(212,168,83,0.94), rgba(232,114,138,0.9));
          color: #08080b;
          cursor: pointer;
          pointer-events: auto;
        }

        .spin {
          animation: spin 0.9s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 600px) {
          .pwa-status {
            bottom: calc(76px + env(safe-area-inset-bottom));
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
