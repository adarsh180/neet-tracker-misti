"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

import { SaathMark } from "./hub-shell";

/** Saath's gate: the dashboard-switch password opens it for 24 hours on this device. Identical in both repos. */
export function HubUnlockCard({ api, home, back }: { api: string; home: string; back: { href: string; label: string } }) {
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="sth">
      <main className="sth-unlock">
        <form
          className="sth-unlock-card sth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const password = String(new FormData(e.currentTarget).get("password") ?? "");
            try {
              const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
              const data = await res.json().catch(() => ({}));
              if (res.ok) return window.location.replace(home);
              setLocked(Boolean(data.lockedMinutes));
              setError(`${data.error ?? "Could not unlock."}${data.lockedMinutes ? ` Try again in ${data.lockedMinutes} min.` : ""}`);
            } catch {
              setError("Network error — try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <SaathMark size={44} />
          <div>
            <span className="sth-kicker">Private · our dashboard</span>
            <h1>Open Saath</h1>
          </div>
          <p>Money, funds, goals and plans for both of you. Enter the dashboard-switch password — it is separate from your sign-in password. Saath stays open for 24 hours on this device, then locks itself; five wrong tries lock it for 15 minutes.</p>
          <label className="sth-field">Password<input type="password" name="password" autoComplete="off" required autoFocus disabled={busy || locked} /></label>
          {error ? <p className="sth-error" role="alert">{error}</p> : null}
          <button type="submit" className="sth-btn is-primary" disabled={busy || locked}><Lock size={15} /> {busy ? "Checking…" : "Unlock"}</button>
          <a className="sth-back" href={back.href}>← {back.label}</a>
        </form>
      </main>
    </div>
  );
}
