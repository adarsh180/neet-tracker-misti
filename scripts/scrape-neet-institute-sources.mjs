import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const USER_AGENT = "NEET-Tracker-Licensed-Corpus-Collector/1.0 (provenance-preserving; contact project owner)";
const ROOT = path.join(process.cwd(), "tmp", "institute-sources");
const DOWNLOAD = process.argv.includes("--download");
const providerFilter = process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1]?.toUpperCase();

const sources = [
  ...Array.from({ length: 12 }, (_, index) => {
    const year = 2025 - index;
    return {
      provider: "PW",
      examYear: year,
      url: `https://www.pw.live/neet/exams/neet-${year}-question-paper`,
    };
  }),
  { provider: "ALLEN", examYear: null, url: "https://allen.in/neet/mock-test" },
  { provider: "ALLEN", examYear: 2022, url: "https://news.allen.in/neet-ug-2022-download-paper-with-answers-key-solutions-video-analysis-by-allen/" },
  { provider: "ALLEN", examYear: 2021, url: "https://news.allen.in/neet-ug-2021-answer-key/" },
  { provider: "AAKASH", examYear: 2025, url: "https://www.aakash.ac.in/" },
  { provider: "RESONANCE", examYear: 2016, url: "https://www.resonance.ac.in/answer-key-solutions/AIPMT/2016/Answer-Key-Solution.aspx" },
  { provider: "RESONANCE", examYear: 2014, url: "https://www.resonance.ac.in/answer-key-solutions/AIPMT/2014/Answer-Key-Solution.aspx" },
];

const directAssets = [
  {
    provider: "NTA",
    examYear: 2019,
    paperCode: "P1-P40",
    artifactKind: "ANSWER_KEY",
    sourcePageUrl: "https://www.nta.ac.in/NoticeBoardArchive",
    assetUrl: "https://www.nta.ac.in/Download/Notice/20190605125750.pdf",
  },
  {
    provider: "AAKASH",
    examYear: 2019,
    paperCode: "P1",
    artifactKind: "QUESTION_PAPER",
    sourcePageUrl: "https://www.aakash.ac.in/neet-answer-key-solution/",
    assetUrl: "https://www.aakash.ac.in/neet-answer-key-solution/NEET-2019%20%28Code-P1%29_Question%20Paper.pdf",
  },
  {
    provider: "AAKASH",
    examYear: 2019,
    paperCode: "P1",
    artifactKind: "SOLUTION",
    sourcePageUrl: "https://dlp.aakash.ac.in/solutionsneet-2019-code-p1",
    assetUrl: "https://dcx0p3on5z8dw.cloudfront.net/Aakash/s3fs-public/2020-07/Solutions_NEET-2019%20%28Code-P1%29.pdf",
  },
  {
    provider: "AAKASH",
    examYear: 2016,
    paperCode: "PHASE-1",
    artifactKind: "ANALYSIS",
    sourcePageUrl: "https://www.aakash.ac.in/answers-solutions/aipmt/",
    assetUrl: "https://www.aakash.ac.in/answers-solutions/aipmt/aipmt-question-paper-detailed-analysis-neet-phase-1.pdf",
  },
  {
    provider: "NTA",
    examYear: 2025,
    paperCode: "45-48",
    artifactKind: "ANSWER_KEY",
    sourcePageUrl: "https://neet.nta.nic.in/document/final-answer-keys-for-neetug-2025/",
    assetUrl: "https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2025/06/2025061450.pdf",
  },
];

const allowedHosts = new Set([
  "www.pw.live", "pw.live", "static.pw.live", "d2bps9p1kiy4ka.cloudfront.net", "asset.allen.in",
  "allen.in", "www.allen.in", "news.allen.in", "myexam.allen.in", "www.aakash.ac.in", "aakash.ac.in",
  "dlp.aakash.ac.in", "dcx0p3on5z8dw.cloudfront.net",
  "www.resonance.ac.in", "resonance.ac.in", "neet.nta.nic.in", "www.nta.ac.in", "nta.ac.in",
  "cdnbbsr.s3waas.gov.in",
]);

function assertAllowed(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`Blocked non-allowlisted source: ${url}`);
  }
  return url;
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#038;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
}

function linksFromHtml(html, baseUrl) {
  const matches = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const results = [];
  for (const match of matches) {
    let href;
    try {
      href = new URL(decodeHtml(match[1]), baseUrl).toString();
    } catch {
      continue;
    }
    const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const signal = `${href} ${label}`;
    if (!/\.pdf(?:$|[?#])|download|question paper|answer key|solution|mock test/i.test(signal)) continue;
    try {
      assertAllowed(href);
    } catch {
      continue;
    }
    results.push({ href, label });
  }
  return [...new Map(results.map((item) => [item.href, item])).values()];
}

function classify(label, url) {
  const signal = `${label} ${url}`;
  if (/answer[\s_-]*key/i.test(signal)) return "ANSWER_KEY";
  if (/solution|with[\s_-]*answer/i.test(signal)) return "SOLUTION";
  if (/analysis/i.test(signal)) return "ANALYSIS";
  if (/mock|practice|sample/i.test(signal)) return "MOCK_PAPER";
  return "QUESTION_PAPER";
}

function inferPaperCode(label, url) {
  const signal = `${label} ${decodeURIComponent(url)}`;
  return signal.match(/(?:code|set|paper)[\s_():-]*([A-Z0-9-]{1,12})/i)?.[1]?.toUpperCase() ?? null;
}

async function pause(ms = 450) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBytes(rawUrl) {
  const url = assertAllowed(rawUrl);
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" }, redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const finalUrl = assertAllowed(response.url);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, finalUrl: finalUrl.toString(), mimeType: response.headers.get("content-type")?.split(";")[0] ?? null };
}

async function upsertArtifact(input, payload) {
  const sha256 = createHash("sha256").update(payload.bytes).digest("hex");
  const isPdf = payload.mimeType === "application/pdf" || input.assetUrl.toLowerCase().includes(".pdf");
  let storagePath = null;
  if (DOWNLOAD && isPdf) {
    const directory = path.join(ROOT, input.provider.toLowerCase(), String(input.examYear ?? "unclassified"));
    await mkdir(directory, { recursive: true });
    const finalPath = path.join(directory, `${sha256.slice(0, 16)}.pdf`);
    const temporaryPath = `${finalPath}.tmp`;
    await writeFile(temporaryPath, payload.bytes);
    await rename(temporaryPath, finalPath);
    storagePath = path.relative(process.cwd(), finalPath).replaceAll("\\", "/");
  }
  return db.questionSourceArtifact.upsert({
    where: { assetUrl: input.assetUrl },
    create: {
      provider: input.provider,
      artifactKind: input.artifactKind,
      examYear: input.examYear,
      paperCode: input.paperCode,
      sourcePageUrl: input.sourcePageUrl,
      assetUrl: input.assetUrl,
      mimeType: payload.mimeType,
      sha256,
      byteSize: payload.bytes.length,
      storagePath,
      crawlStatus: "DOWNLOADED",
      fetchedAt: new Date(),
      metadataJson: input.metadataJson,
    },
    update: {
      artifactKind: input.artifactKind,
      examYear: input.examYear,
      paperCode: input.paperCode,
      sourcePageUrl: input.sourcePageUrl,
      mimeType: payload.mimeType,
      sha256,
      byteSize: payload.bytes.length,
      ...(storagePath ? { storagePath } : {}),
      crawlStatus: "DOWNLOADED",
      fetchedAt: new Date(),
      metadataJson: input.metadataJson,
    },
  });
}

const report = { pages: 0, assetsDiscovered: 0, assetsDownloaded: 0, failed: [] };
try {
  for (const source of sources.filter((item) => !providerFilter || item.provider === providerFilter)) {
    try {
      const payload = await fetchBytes(source.url);
      report.pages += 1;
      await upsertArtifact({
        ...source,
        artifactKind: "ARCHIVE_PAGE",
        sourcePageUrl: source.url,
        assetUrl: source.url,
        paperCode: null,
        metadataJson: { finalUrl: payload.finalUrl },
      }, payload);
      const html = payload.bytes.toString("utf8");
      const links = linksFromHtml(html, payload.finalUrl);
      report.assetsDiscovered += links.length;
      for (const link of links) {
        const url = new URL(link.href);
        if (!/\.pdf(?:$|[?#])/i.test(url.pathname + url.search)) continue;
        try {
          await pause();
          const asset = await fetchBytes(link.href);
          await upsertArtifact({
            provider: source.provider,
            artifactKind: classify(link.label, link.href),
            examYear: source.examYear,
            paperCode: inferPaperCode(link.label, link.href),
            sourcePageUrl: source.url,
            assetUrl: link.href,
            metadataJson: { anchorLabel: link.label, finalUrl: asset.finalUrl },
          }, asset);
          report.assetsDownloaded += 1;
        } catch (error) {
          report.failed.push({ provider: source.provider, url: link.href, error: String(error.message ?? error) });
        }
      }
    } catch (error) {
      report.failed.push({ provider: source.provider, url: source.url, error: String(error.message ?? error) });
    }
    await pause();
  }

  for (const asset of directAssets.filter((item) => !providerFilter || item.provider === providerFilter)) {
    try {
      const payload = await fetchBytes(asset.assetUrl);
      await upsertArtifact({ ...asset, metadataJson: { finalUrl: payload.finalUrl, configuredDirectly: true } }, payload);
      report.assetsDiscovered += 1;
      report.assetsDownloaded += 1;
    } catch (error) {
      report.failed.push({ provider: asset.provider, url: asset.assetUrl, error: String(error.message ?? error) });
    }
    await pause();
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.$disconnect();
}
