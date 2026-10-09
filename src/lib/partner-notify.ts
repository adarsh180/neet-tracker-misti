/**
 * Server-to-server delivery between the two sites (UPSC desk ⇄ NEET desk).
 * Identical in both repos. A short timeout means a slow partner can never
 * hang the sender, and a "ping" checks the link without creating a message.
 */

type Payload = { title: string; body: string; tone: string; senderLabel: string; senderClientId: string | null };
export type PartnerResult = { forwarded: boolean; status?: number; reason?: "missing-config" | "rejected" | "network" | "timeout" | "error"; push?: { sent?: number; failed?: number } };

function config() {
  const endpoint = process.env.PARTNER_NOTIFY_ENDPOINT?.trim();
  const secret = process.env.CROSS_APP_NOTIFY_SECRET?.trim();
  return endpoint && secret ? { endpoint, secret } : null;
}

async function post(body: unknown, timeoutMs: number): Promise<PartnerResult> {
  const cfg = config();
  if (!cfg) {
    console.error("[partner] PARTNER_NOTIFY_ENDPOINT or CROSS_APP_NOTIFY_SECRET is not configured.");
    return { forwarded: false, reason: "missing-config" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.endpoint, { method: "POST", headers: { "content-type": "application/json", "x-cross-app-secret": cfg.secret }, body: JSON.stringify(body), cache: "no-store", signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) console.error(`[partner] delivery failed: ${res.status}`);
    return { forwarded: res.ok, status: res.status, reason: res.ok ? undefined : res.status === 401 ? "rejected" : "error", push: data?.push };
  } catch (error) {
    const timeout = (error as Error).name === "AbortError";
    console.error("[partner] delivery error:", timeout ? "timeout" : error);
    return { forwarded: false, reason: timeout ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export const forwardToPartner = (input: Payload) => post(input, 9000);

/** Checks the link (endpoint reachable and secret accepted) without creating a message. */
export const pingPartner = () => post({ ping: true }, 6000);

export function partnerProblem(r: PartnerResult) {
  switch (r.reason) {
    case "missing-config":
      return "This site has no partner address or secret configured.";
    case "rejected":
      return "The other site rejected the shared secret — the two sites' CROSS_APP_NOTIFY_SECRET values differ.";
    case "timeout":
      return "The other site took too long to answer.";
    case "network":
      return "The other site could not be reached.";
    default:
      return r.forwarded ? null : `The other site answered with an error (${r.status ?? "?"}).`;
  }
}
