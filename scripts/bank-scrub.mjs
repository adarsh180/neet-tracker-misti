import { PrismaClient } from "@prisma/client";

let prisma = new PrismaClient();

// Cleans the SERVED pool (VERIFIED_STRICT). Two actions:
//  1. Strip PhysicsWallah watermark / app / URL fragments from question/options/explanation.
//  2. Demote rows that are structurally broken (after cleaning) out of the served pool,
//     so they stop appearing in test papers until fixed.
// Scoped to VERIFIED_STRICT so it never races the bank-perfect campaign (which writes
// UNVERIFIED/NEEDS_REVIEW -> VERIFIED_STRICT).

const WATERMARK_RE = new RegExp(
  [
    "master\\s+ncert(?:\\s+with\\s+pw\\s+books\\s+app|\\s+neet)?",
    "with\\s+pw\\s+books\\s+app",
    "(?:i\\s*os|android)\\s+app(?:\\s*\\|)?",
    "pw\\s+(?:web\\s*(?:site|/\\s*app)?|app)\\b",
    "library\\s*-\\s*https?://\\S+",
    "https?://\\S+",
    "smart\\.link/\\S+",
  ].join("|"),
  "ig",
);

const PLACEHOLDER_RE = /^\s*(?:\[object object\]|undefined|null|n\/?a|option [a-d]|\.+)\s*$/i;

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const scrub = (s) => clean(String(s == null ? "" : s).replace(WATERMARK_RE, " "));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await fn(); }
    catch (err) {
      const msg = String(err?.code ?? "") + " " + String(err?.message ?? err);
      if (attempt === 4 || !/P1001|P1017|P1002|reach database|closed the connection|ECONNRESET|ETIMEDOUT|socket/i.test(msg)) throw err;
      await prisma.$disconnect().catch(() => {});
      await sleep(1200 * (attempt + 1));
      prisma = new PrismaClient();
    }
  }
}

function broken(question, opts, explanation) {
  if (opts.length !== 4 || opts.some((o) => !o)) return "bad option count/empty";
  if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) return "duplicate options";
  if (opts.some((o) => PLACEHOLDER_RE.test(o))) return "placeholder option";
  if (explanation.length < 25) return "explanation too thin";
  if (question.length < 15) return "question too short";
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const subjectFilter = args.subject ? String(args.subject) : undefined;

  const rows = await withRetry(() => prisma.bankQuestion.findMany({
    where: { qualityStatus: "VERIFIED_STRICT", verified: true, subject: subjectFilter },
    select: { id: true, subject: true, question: true, optionsJson: true, explanation: true },
  }));

  let scrubbed = 0, demoted = 0, examined = rows.length;
  const demoteReasons = {};

  for (const r of rows) {
    const optsRaw = Array.isArray(r.optionsJson) ? r.optionsJson.map(clean) : [];
    const q0 = clean(r.question), e0 = clean(r.explanation);
    const q1 = scrub(q0), e1 = scrub(e0), opts1 = optsRaw.map(scrub);
    const textChanged = q1 !== q0 || e1 !== e0 || opts1.some((o, i) => o !== optsRaw[i]);

    const reason = broken(q1, opts1, e1);
    if (reason) {
      demoteReasons[reason] = (demoteReasons[reason] ?? 0) + 1;
      demoted++;
      if (apply) {
        await withRetry(() => prisma.bankQuestion.update({
          where: { id: r.id },
          data: {
            verified: false,
            qualityStatus: "NEEDS_REVIEW",
            rejectReason: `bank-scrub: ${reason}`,
            ...(textChanged ? { question: q1, explanation: e1, optionsJson: opts1 } : {}),
          },
        }));
      }
      continue;
    }
    if (textChanged) {
      scrubbed++;
      if (apply) {
        await withRetry(() => prisma.bankQuestion.update({
          where: { id: r.id },
          data: { question: q1, explanation: e1, optionsJson: opts1 },
        }));
      }
    }
  }

  console.log(JSON.stringify({
    apply, subject: subjectFilter ?? "all", examined,
    scrubbedWatermark: scrubbed, demotedBroken: demoted, demoteReasons,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
