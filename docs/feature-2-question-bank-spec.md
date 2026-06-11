# SPEC — NEET Question Bank (200,000 questions) for the Practice Arena

> Hand this whole file to the coding agent (Codex). It contains the goal, the exact
> integration points in this repo, the database design, the ingestion pipeline, the
> serving changes, the AI prompt templates, and acceptance criteria.

---

## 0. Context: what already exists (DO NOT rebuild these)

This is a Next.js 16 (App Router, Turbopack) + Prisma + TiDB (MySQL) app for one student
(Misti) preparing NEET UG 2027. Already working and in production:

- **`prisma/schema.prisma`** — has `Subject` (slugs: `physics`, `chemistry`, `botany`,
  `zoology`), `Topic` (with `chapter` string per NCERT, `classLevel` "11"/"12"),
  `TestRecord`, `ErrorLogTest`/`ErrorLogQuestion`, and `PracticeTest`.
- **`src/lib/practice-engine.ts`** — the live Practice Arena engine:
  - `PracticeQuestion` type (id, subject, chapter, topic, source, sourceRef,
    difficulty EASY|MODERATE|TOUGH, question markdown+LaTeX, options[4],
    correctIndex, explanation, verified).
  - `extractJsonArray()` — battle-tested parser that survives `<thought>` reasoning
    preambles, markdown fences, wrapper objects, and token-limit truncation
    (salvages complete items). **Reuse it for all AI JSON parsing.**
  - `verifyBatch()` — blind verification: a second AI call re-solves questions
    WITHOUT seeing the key; disagreements are dropped. **This is the integrity
    contract — every AI-generated question entering the bank must pass it.**
  - `submitPracticeTest()` — NTA grading (+4/−1/0), subject-wise breakdown,
    auto-creates `TestRecord` + `ErrorLogTest` rows. **Unchanged.**
  - `sanitizePracticeTest()` — strips `correctIndex`/`explanation` until the test
    is COMPLETED. **Unchanged. Answer keys must never reach the client early.**
- **`src/lib/openrouter.ts`** — `chatWithAI(messages, maxTokens, temperature,
  timeoutMs, models?)`. Models: `gemma-4-31b-it` (primary), `gemma-4-26b-a4b-it`
  (fallback1), `gemini-2.5-flash` (emergency). Known quirks (cost hours to learn —
  respect them):
  - gemma-4 models emit an **unclosed `<thought>` preamble** that eats tokens →
    always give ≥12000 maxTokens for generation, instruct "begin your reply with [",
    and parse with `extractJsonArray`.
  - `gemma-4-31b-it` times out on long question-generation outputs;
    `gemma-4-26b-a4b-it` completes them. Question work should pass the model order
    `[fallback1, primary, emergencyFallback]` (see `PRACTICE_MODELS` in
    practice-engine.ts).
  - Never put a JSON string array inside a prompt as a "do not repeat" list — the
    model mimics the flat shape and breaks the schema. Use plain-text bullets.
  - Free-tier Google API throws transient 429/503 — every batch job must be
    resumable and idempotent.
- **`src/app/(protected)/practice/page.tsx`** — full UI: setup → generating
  (progress loop) → exam (timer, palette, localStorage autosave) → result
  (score, per-question key + explanation + source). Keep the UI; only the
  generating phase gets faster (bank-served papers are near-instant).
- **API routes** — `/api/practice` (create/list), `/api/practice/[id]` (get/submit/
  delete), `/api/practice/[id]/generate` (batch loop). Auth via
  `getPrivateSession()` from `src/lib/server-auth.ts` on every route.
- Env: `DATABASE_URL`, `GEMINI_API_KEY`, `CRON_SECRET`. Cron heartbeat exists at
  `/api/cron/daily-planner` (05:00 IST daily) — the bank-filler can ride it or get
  its own secret-protected endpoint.

## 1. Goal

Build a **persistent question bank** of up to **200,000 questions** in the database so
that:

1. Every NCERT chapter of Physics, Chemistry, Botany, Zoology (class 11 + 12) holds
   **2,000–3,000 questions** at steady state.
2. Difficulty per chapter ≈ **30% EASY / 45% MODERATE / 25% TOUGH**.
3. Source mix per chapter (labels already used by the engine):
   - `NEET_PYQ` — NEET UG previous-year questions (1998–2025), reproduced faithfully.
   - `JEE_PYQ` — JEE Main PYQs, **Physics & Chemistry only**, single-correct only.
   - `INSTITUTE` — questions at the exact standard/style of Aakash, Allen,
     Physics Wallah, Motion test series.
   - `PLATFORM` — standard problems found on legitimate prep platforms.
   - `AI` — original questions strictly inside NCERT class 11–12 syllabus.
   - NEW: `NCERT` — questions directly from NCERT exercises/examples/intext,
     labeled e.g. "NCERT Class 11 Ch 5 Exercise 5.12".
4. Papers are **assembled from the bank instantly** (stratified random sampling),
   with an optional **10–20% live-AI portion** per paper for freshness.
5. She never sees the same question twice until the chapter pool is exhausted
   (per-question serve/attempt tracking).
6. The bank **fills itself continuously** via a rate-limited nightly job until quotas
   are met — and every AI-generated entry passes blind verification before insert.

Reality note for the implementer: 200k verified questions cannot appear in one run on
a free API tier. Build the machine that converges there: bulk import adapters for any
owned/licensed material (instant volume) + AI generation that adds hundreds–thousands
per night, prioritized by the chapters Misti is currently weakest in.

## 2. Database design (additive — `prisma db push`, never destructive)

```prisma
model BankQuestion {
  id            String   @id @default(cuid())
  subject       String   // "Physics" | "Chemistry" | "Botany" | "Zoology"
  classLevel    String?  // "11" | "12"
  chapter       String   // canonical NCERT chapter name (see §3)
  topic         String?
  source        String   // NEET_PYQ | JEE_PYQ | INSTITUTE | PLATFORM | NCERT | AI
  sourceRef     String   // "NEET 2019" | "JEE Main 2021 (26 Aug S1)" | "Aakash AIATS style" | "NCERT 11 Ch 3 Ex 3.7" | "Original"
  difficulty    String   // EASY | MODERATE | TOUGH
  question      String   @db.Text      // markdown + LaTeX ($...$)
  optionsJson   Json     // exactly 4 strings
  correctIndex  Int      // 0-3
  explanation   String   @db.Text
  verified      Boolean  @default(false) // passed blind verification
  contentHash   String   @unique @db.VarChar(64) // sha256 of normalized question+options (dedupe)
  timesServed   Int      @default(0)
  timesCorrect  Int      @default(0)
  timesWrong    Int      @default(0)
  lastServedAt  DateTime?
  importBatch   String?  // seeder run id / import file name
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([subject, chapter, difficulty])
  @@index([subject, chapter, source])
  @@index([subject, chapter, lastServedAt])
  @@map("bank_questions")
}

model BankFillJob {
  id            String   @id @default(cuid())
  subject       String
  chapter       String
  requested     Int
  inserted      Int      @default(0)
  rejected      Int      @default(0)  // failed validation/verification/dedupe
  status        String   @default("RUNNING") // RUNNING | DONE | FAILED
  model         String?
  error         String?  @db.Text
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([subject, chapter, createdAt])
  @@map("bank_fill_jobs")
}
```

`contentHash` = sha256 of `lowercase(question + options.join("|"))` with whitespace
collapsed and LaTeX spacing normalized. Insert with `createMany({ skipDuplicates })`
or catch unique-violation per row — dedupe is non-negotiable at this scale.

## 3. Canonical chapter taxonomy

Create `src/data/syllabus/neet-chapters.ts`: the full NCERT chapter list per subject
and class (Physics 11: Units & Measurement, Motion in a Straight Line, …; Chemistry
11: Some Basic Concepts of Chemistry, …; Biology split into Botany/Zoology chapters
the way this app's `Topic` table splits them — **read the live `Topic` table's
distinct `chapter` values per subject first and reconcile**; live DB names win when
they differ from textbook names, because the error log and planner match on them).
Export `CHAPTERS: { subject, classLevel, chapter, aliases: string[] }[]` with an
`canonicalizeChapter(subject, rawName)` helper (alias matching, case/punctuation
insensitive). Every bank insert must store the canonical name.

## 4. Filling the bank

### 4.1 Import adapter (for owned/licensed material) — `scripts/bank-import.mjs`

- Input: JSON or CSV files in `data/bank-import/` with columns
  `subject, classLevel, chapter, topic, source, sourceRef, difficulty, question,
  optionA..optionD, correctIndex (0-3 or A-D), explanation`.
- Validates every row (4 non-empty options, correctIndex valid, subject/chapter
  canonicalizable), computes `contentHash`, batch-inserts with dedupe, prints a
  report (inserted / duplicate / invalid with reasons).
- Imported rows get `verified: true` only if the file is flagged `--trusted`;
  otherwise they enter unverified and the verification sweep (§4.3) checks them.
- This is the legal-clean path for institute material: only import files the owner
  actually has rights to. The AI path generates institute-**style** questions, which
  is what the engine already does.

### 4.2 AI bulk generation — `scripts/bank-fill.mjs` + `/api/cron/bank-fill`

Core loop (both entry points share `src/lib/question-bank.ts`):

1. Pick the target chapter: lowest `(current verified count / quota)` ratio, tie-broken
   by Misti's weak zones (reuse the weak-zone query in practice-engine.ts:
   `errorLogQuestion` wrong counts by chapter).
2. Generate one batch of **5 questions** (the proven safe size) with the generation
   prompt in §6.1: pass the chapter, classLevel, difficulty targets for what the
   chapter currently lacks, source-mix targets for what the chapter currently lacks,
   and a plain-text bullet list of the 24 most recent question stems in that chapter
   (dedupe steering).
3. Parse with `extractJsonArray`, validate (same rules as `validateBatch` in
   practice-engine.ts), then **blind-verify** with the §6.2 prompt (re-solve without
   keys; drop disagreements; `verified=true` only when solver agrees confidently).
4. Compute hashes, insert non-duplicates, update the `BankFillJob` row.
5. Rate limiting: ≥6s between AI calls, exponential backoff on 429/503 (30s, 120s,
   give up the run — the next run resumes), hard cap per run (`--max-questions`,
   default 300 for the nightly cron, unlimited for manual script runs).
6. Resumable + idempotent: state lives entirely in the DB counts; killing the
   script at any moment loses at most one batch.

CLI examples to support:

```
node scripts/bank-fill.mjs --subject physics --chapter "Laws of Motion" --count 200
node scripts/bank-fill.mjs --all --max-questions 1000        # quota-driven sweep
node scripts/bank-fill.mjs --status                          # per-chapter progress table
```

Cron: `/api/cron/bank-fill` (GET, `Authorization: Bearer CRON_SECRET`, maxDuration
300) runs a small quota-driven sweep (~60–100 questions/run, well inside the route
budget). Schedule it in `vercel.json` at a quiet hour (e.g. `30 20 * * *` UTC =
02:00 IST). NOTE: Vercel Hobby allows max 2 cron jobs and 2 already exist
(`cycle-nudge`, `daily-planner`) — so either ride inside the existing daily-planner
heartbeat (add a `fillQuestionBank()` call with its own time budget) or document
that the user should trigger nightly fills via an external pinger / manual script.
**Default to riding the existing heartbeat with a 120s budget.**

### 4.3 Verification sweep — `scripts/bank-verify.mjs`

Walks `verified=false` rows in batches of 8, blind-verifies (§6.2), marks
`verified=true` on confident agreement, deletes on disagreement (log what was
deleted to stdout for auditability). Run after imports.

## 5. Serving papers from the bank

Modify **only** the generation half of `src/lib/practice-engine.ts`:

1. `createPracticeTest(config)` gains `aiFreshPercent` (0–20, default 10).
2. New `assembleFromBank(test)`:
   - Stratified sampling matching the paper config: full-length = 25/25/25/25 split
     across subjects with NTA difficulty mix; subject/chapter/topic modes filter
     accordingly; PYQ_YEAR mode filters `source="NEET_PYQ" AND sourceRef LIKE
     "%<year>%"`.
   - **Only `verified=true` rows.**
   - Freshness ordering: prefer `timesServed=0`, then oldest `lastServedAt`. Within
     each stratum pick randomly (`ORDER BY RAND()` is fine at this scale with the
     indexes above; otherwise sample ids in app code).
   - Convert rows to the existing `PracticeQuestion` shape (id stays `q1..qN` per
     paper; carry `bankId` in a new optional field for stat write-back).
   - Mark `timesServed+1`, `lastServedAt=now()` on the sampled rows.
   - If the bank lacks stock for a stratum, fall back to live AI generation for the
     shortfall (the existing `generateNextBatch` path) — the paper must never fail
     to fill.
3. `generateNextBatch` first call: run `assembleFromBank`; if it fully satisfies
   `questionCount` minus the AI-fresh portion, only the AI-fresh questions go through
   the live generate+verify loop. Result: a 50-question paper is READY in seconds
   when the bank has stock, and the progress UI still works unchanged for the AI
   portion.
4. `submitPracticeTest`: after grading, write back per-question stats to the bank
   (`timesCorrect`/`timesWrong` via `bankId`). Everything else (TestRecord, ErrorLog
   feed) unchanged.

## 6. AI prompt templates (use exactly; they encode hard-won model behavior)

### 6.1 Generation (per batch of 5)

System:
```
You are a precise NEET UG question paper setter. Respond only with a valid JSON
array of objects. Never include markdown fences. Accuracy of answer keys is
non-negotiable.
```

User (fill the {placeholders}):
```
Produce EXACTLY 5 single-correct MCQs as a JSON array for the NEET UG question bank.
IMPORTANT: Do NOT write planning notes, thoughts, or analysis. Begin your reply with "[".

Subject: {subject} (class {classLevel}). Chapter: "{chapter}". Stay strictly inside
this chapter's NCERT scope.

SOURCE PRIORITY for this batch (label each question):
{e.g. "3x NEET_PYQ (real NEET UG previous-year questions, any year 1998-2025,
reproduce faithfully, sourceRef like 'NEET 2019'); 1x INSTITUTE (exact style and
standard of Aakash/Allen/Physics Wallah/Motion test series); 1x NCERT (directly from
NCERT exercises/examples, sourceRef like 'NCERT Class 11 Ch 5 Example 5.4')"}
If you are not CERTAIN of a PYQ's exact wording and answer, do NOT fake it — use a
lower-priority source label instead. Never mislabel.

Difficulty for this batch: {e.g. "2 EASY, 2 MODERATE, 1 TOUGH"}.

FORMAT RULES:
1. JSON array ONLY. No prose, no wrapper object.
2. Each item: { "subject": "{subject}", "classLevel": "{classLevel}",
   "chapter": "{chapter}", "topic": "specific topic",
   "source": "NEET_PYQ|JEE_PYQ|INSTITUTE|PLATFORM|NCERT|AI", "sourceRef": "string",
   "difficulty": "EASY|MODERATE|TOUGH", "question": "string",
   "options": ["A","B","C","D"], "correctIndex": 0-3,
   "explanation": "1-3 short sentences on why the key is right" }
3. Math/chemistry in LaTeX: inline $...$, \times for multiplication. Plain text for biology.
4. Options plausible, mutually exclusive, similar length. Exactly one correct.
5. Assertion-Reason and Match-the-column formats allowed (state fully in question text).
6. correctIndex MUST be verifiably correct — solve each question yourself before keying it.
7. BE COMPACT: question < 90 words, options < 18 words, explanation < 45 words.
8. Every array item MUST be a complete JSON object wrapped in { }.
9. Do not repeat these existing questions:
{plain-text bullet list, one per line, "• <first 70 chars>" — NEVER a JSON array}
```

Call: `chatWithAI(messages, 12000, 0.4, 150000, [AI_MODELS.fallback1,
AI_MODELS.primary, AI_MODELS.emergencyFallback])`. If zero valid questions parse,
retry once with `[AI_MODELS.emergencyFallback]` (flash is more schema-reliable).

### 6.2 Blind verification (per batch, no keys shown)

System:
```
You are an expert NEET examiner solving questions independently. Respond only with
valid JSON. Never include markdown fences.
```

User:
```
Solve each MCQ below independently and carefully. Respond with a JSON array:
[{ "id": "q1", "answerIndex": 0-3, "confident": true|false }].
Set confident=false if the question is ambiguous, has no single correct option, or
you are unsure.

{JSON of [{id, subject, question, options}] — never include correctIndex}
```

Keep only: solver agrees AND confident → `verified=true`. Agrees but unconfident →
insert `verified=false` (the sweep retries later). Disagrees → discard.

## 7. Acceptance criteria

1. `npx prisma db push` adds the two tables; nothing existing changes.
2. `node scripts/bank-fill.mjs --subject physics --chapter "Laws of Motion" --count 25`
   inserts ≥15 verified, deduped questions (rejection rate visible in the report).
3. `node scripts/bank-fill.mjs --status` prints per-chapter: verified count / quota,
   difficulty split, source split.
4. Creating a 50-question SUBJECT paper when the bank has stock → status READY in
   < 10 seconds, all questions from bank, `timesServed` incremented; UI unchanged.
5. With `aiFreshPercent=10`, exactly ~5 of 50 go through live generate+verify.
6. PYQ_YEAR papers sample only `NEET_PYQ` rows of that year, topping up with live
   generation when short.
7. Submitting a paper still creates TestRecord + ErrorLog rows exactly as today
   (run the existing flow to confirm) and now also updates bank stats.
8. Answer keys (`correctIndex`, `explanation`) never appear in any API response for
   a non-COMPLETED test (grep the JSON to prove it).
9. `npm run build` passes. All new routes check `getPrivateSession()` (or
   CRON_SECRET for cron).
10. Re-running any seeder/import is safe (dedupe via contentHash; no duplicates).

## 8. Suggested task order for the agent

1. Schema + db push + canonical chapter taxonomy (reconcile with live Topic table).
2. `src/lib/question-bank.ts` (hashing, validation, insert, sampling, fill loop).
3. `scripts/bank-fill.mjs` + `--status` + `scripts/bank-verify.mjs` + `scripts/bank-import.mjs`.
4. Bank-serving integration in practice-engine (`assembleFromBank`, stat write-back).
5. Heartbeat integration (nightly fill inside the existing daily-planner cron with a
   120s budget) — never let a fill failure break the planner/reviews (try/catch, log).
6. Run a real fill for 2–3 chapters, then a real bank-served paper end-to-end.
```
