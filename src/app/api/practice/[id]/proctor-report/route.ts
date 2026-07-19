import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type EvidenceInput = { reason?: unknown; at?: unknown; imageDataUrl?: unknown; detail?: unknown };

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const test = await db.practiceTest.findFirst({
    where: { id, userId: session.userId, status: "COMPLETED" },
    select: { id: true, title: true, completedAt: true, submitType: true, autoSubmitReason: true, proctorReportSentAt: true },
  });
  if (!test) return NextResponse.json({ error: "Completed test not found" }, { status: 404 });
  if (test.proctorReportSentAt) return NextResponse.json({ ok: true, alreadySent: true });

  // Proctor event logging remains active while outbound email is deliberately
  // paused. Returning before reading the request body ensures camera frames are
  // neither decoded nor retained by the server while this feature is held.
  if (process.env.PROCTOR_EMAIL_ENABLED !== "true") {
    await db.practiceTest.update({ where: { id: test.id }, data: { proctorReportStatus: "HELD" } });
    return NextResponse.json({ ok: true, held: true, emailSent: false });
  }

  const body = await request.json().catch(() => ({}));
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, 12).map((event: EvidenceInput) => ({
    reason: String(event.reason ?? "UNKNOWN").slice(0, 80),
    at: String(event.at ?? "").slice(0, 80),
    detail: String(event.detail ?? "").slice(0, 240),
  }));
  const evidence: Array<{ filename: string; content: string; reason: string; at: string }> = (Array.isArray(body.evidence) ? body.evidence : []).slice(0, 3).flatMap((item: EvidenceInput, index: number) => {
    const dataUrl = typeof item.imageDataUrl === "string" ? item.imageDataUrl : "";
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match || match[1].length > 1_500_000) return [];
    return [{
      filename: `integrity-event-${index + 1}.jpg`,
      content: match[1],
      reason: String(item.reason ?? "UNKNOWN").slice(0, 80),
      at: String(item.at ?? "").slice(0, 80),
    }];
  });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PROCTOR_REPORT_FROM_EMAIL;
  const to = process.env.PROCTOR_REPORT_TO_EMAIL || "tiwariadarsh1804@gmail.com";
  if (!apiKey || !from) {
    await db.practiceTest.update({ where: { id: test.id }, data: { proctorReportStatus: "NOT_CONFIGURED" } });
    return NextResponse.json({ error: "Proctor email is not configured. Add RESEND_API_KEY and PROCTOR_REPORT_FROM_EMAIL." }, { status: 503 });
  }

  const clean = events.length === 0;
  const eventRows = clean
    ? "<p style=\"color:#147a48;font-weight:700\">Clean attempt: no tab switch, app leave, fullscreen exit, or pause was detected.</p>"
    : `<table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">#</th><th align="left">Event</th><th align="left">Time</th></tr></thead><tbody>${events.map((event: { reason: string; at: string }, index: number) => `<tr><td style="padding:6px;border-top:1px solid #ddd">${index + 1}</td><td style="padding:6px;border-top:1px solid #ddd">${escapeHtml(event.reason)}</td><td style="padding:6px;border-top:1px solid #ddd">${escapeHtml(event.at)}</td></tr>`).join("")}</tbody></table>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `practice-proctor-${test.id}` },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${clean ? "Clean attempt" : `Integrity report (${events.length} events)`}: ${test.title}`,
      html: `<div style="font-family:Arial,sans-serif;color:#20242a"><h2>Practice Arena integrity report</h2><p><strong>Test:</strong> ${escapeHtml(test.title)}</p><p><strong>Submitted:</strong> ${escapeHtml(test.completedAt?.toISOString() ?? "")}</p><p><strong>Submission:</strong> ${escapeHtml(test.submitType ?? "MANUAL")} ${test.autoSubmitReason ? `(${escapeHtml(test.autoSubmitReason)})` : ""}</p>${eventRows}<p style="font-size:12px;color:#667085">${evidence.length} compressed evidence image(s) attached. The app did not save these images to its database.</p></div>`,
      attachments: evidence.map(({ filename, content }) => ({ filename, content })),
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    await db.practiceTest.update({ where: { id: test.id }, data: { proctorReportStatus: "FAILED" } });
    return NextResponse.json({ error: `Email delivery failed: ${detail}` }, { status: 502 });
  }

  await db.practiceTest.update({
    where: { id: test.id },
    data: { proctorReportSentAt: new Date(), proctorReportStatus: clean ? "SENT_CLEAN" : "SENT_WITH_EVENTS" },
  });
  return NextResponse.json({ ok: true, clean, eventCount: events.length, evidenceCount: evidence.length });
}
