import { existsSync } from "node:fs";

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

import { db } from "@/lib/db";
import { buildPracticeReportHtml } from "@/lib/practice-report";
import { getPrivateSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const LOCAL_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPrivateSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const test = await db.practiceTest.findFirst({
    where: { id, userId: session.userId, status: "COMPLETED" },
    include: { reviews: { orderBy: { questionNumber: "asc" } } },
  });
  if (!test) return Response.json({ error: "Completed practice test not found" }, { status: 404 });

  const executablePath = existsSync(LOCAL_CHROME) ? LOCAL_CHROME : await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: existsSync(LOCAL_CHROME) ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
    defaultViewport: { width: 1280, height: 900 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const origin = new URL(request.url).origin;
    const questions = Array.isArray(test.questionsJson) ? test.questionsJson as Array<Record<string, unknown>> : [];
    const visualIds = questions.map((question) => String(question.visualAssetUrl ?? "").match(/^\/api\/practice\/visual\/([^/?#]+)/)?.[1]).filter((value): value is string => Boolean(value));
    const visualAssets = visualIds.length ? await db.questionVisualAsset.findMany({ where: { id: { in: visualIds } } }) : [];
    const visualMap = new Map(visualAssets.map((asset) => [asset.id, `data:${asset.mimeType};base64,${Buffer.from(asset.fileData).toString("base64")}`]));
    const reportTest = {
      ...test,
      questionsJson: questions.map((question) => {
        const assetId = String(question.visualAssetUrl ?? "").match(/^\/api\/practice\/visual\/([^/?#]+)/)?.[1];
        return assetId && visualMap.has(assetId) ? { ...question, visualAssetUrl: visualMap.get(assetId) } : question;
      }),
    };
    const html = buildPracticeReportHtml(reportTest, test.reviews, origin);
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })));
    });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: '<div style="width:100%;font:9px Arial;color:#64748b;text-align:center"><span class="title"></span> - Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margin: { top: "14mm", right: "12mm", bottom: "18mm", left: "12mm" },
      preferCSSPageSize: true,
    });
    const filename = `${test.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "practice-report"}.pdf`;
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } finally {
    await browser.close();
  }
}
