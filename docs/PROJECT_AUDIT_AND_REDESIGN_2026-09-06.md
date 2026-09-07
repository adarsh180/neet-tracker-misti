# NEET Tracker — project audit and redesign blueprint

Audit date: 6 September 2026. Code baseline: `06ffeca`.

## 1. Executive verdict

Yes: this project can become a distinctive, premium personal study product. It already has substantial working infrastructure. However, it is not yet a complete cross-project voice agent, and its current reliability does not justify claims of perfection or near-zero errors.

The main problem is fragmentation: pages, voice commands, analytics, educational content and saves do not consistently share the same definitions and execution paths. Another round of decorative cards will not resolve that.

Recommended direction: **a quiet personal study studio**. Keep the ink, cream, antique-gold, Inter and Playfair identity; make the important work immediately accessible; reserve expressive pink/blue motion for the assistant. Measure quality through successful tasks, accurate records, readable content and reliable recovery—not visual effects alone.

This is an audit and implementation plan. No application redesign, Visual Lab removal, question-bank replacement or deployment was performed during this audit.

## 2. What was checked—and what remains unverified

- Inspected the App Router route inventory, protected layout, design tokens, Prisma schema/migrations, voice recognition/playback, command parsing and execution, daily-log allocation/save logic, Practice Arena assembly/autosave/scoring, reader/link ingestion, search, charts and PWA code.
- Reviewed page structure and data/action entry points across all protected route families. Deepest implementation inspection: voice, daily goals, subjects, practice, reader and shared infrastructure.
- Opened the deployed dashboard, Practice Arena and builder, Daily Goals, NCERT library, a real NCERT chapter, and Physics page in the in-app desktop browser.
- Ran the current unit suite: **32 passed, 0 failed**.
- Ran the production build: **passed**, including TypeScript and route generation.
- Ran ESLint over `src` and `tests`: **14 errors, 13 warnings**. This is a scoped application lint result, not a clean whole-repository lint result. Errors include Mood, Tests, Error Log, landing, PWA registration, theme toggle and the visual explainer.
- Reproduced additional parser failures with synthetic in-memory chapter data; no production study records were submitted for these probes.
- Local Node reported `22.11.0`, below the package's declared minimum `22.13.0`. Align development and deployment runtimes despite this build succeeding.

Not certified in this pass: physical iPad/Samsung/Realme microphone behavior; Comet recognition-service availability; every responsive breakpoint; every question's academic accuracy; every PDF's page fidelity; complete 30-year PYQ coverage; all authenticated write endpoints under concurrency; production load/security penetration testing. No real voice recording was used to measure recognition accuracy. A browser screenshot is not an iPad PWA certification.

## 3. Architecture worth preserving

The application uses Next.js 16.3.1 App Router, React 19, TypeScript, Prisma/MySQL, Zustand, Framer Motion, Recharts, Markdown/KaTeX, a service worker and private voice-audio endpoints.

The database already contains meaningful foundations:

- Subjects/topics, revisions, study activities and revision sessions.
- Daily goals, screen-time logs, tasks and task timelines.
- Practice attempts, question reviews, folders, report artifacts and bookmarks.
- Bank questions, source artifacts, ingestion candidates and source evidence.
- Syllabus versions/nodes, NCERT documents/passages/question links and reader attempts.
- Assistant preferences, confirmed actions and voice-log submissions.
- Tests/error ledgers, mood/cycle records, conversations and predictions.

Keep source provenance, strict question filtering, server-side grading, authentication, independent custom-test scopes, the restored sectional test and existing data. Avoid a framework migration or disconnected prototype.

Refactor the largest pages incrementally: Daily Goals is 3,152 lines; Subjects 2,714; NEET-GURU 2,648; Cycle Planner 2,573; Tests 2,087; Dashboard 2,004. These combine data logic, interactions and extensive page-specific styling. Their size is not itself a defect, but makes consistent fixes and regression testing expensive. The README is still the starter template.

## 4. Priority findings

Severity: **P1** = potentially wrong records/results or broken core workflow; **P2** = significant usability, accuracy-of-presentation or maintenance problem. Code risks below are not claims that production data has already been corrupted.

### P1 — voice and daily logging

**V1. Dynamic replies are not dynamically spoken.**

`speakPrompt(_text, ...)` ignores the supplied sentence and plays a fixed authenticated clip. It correctly uses 1× and avoids falling back to a female device voice, but it cannot speak an arbitrary chapter name, exact question allocation, memory answer or newly generated clarification. Audio failures call `onEnded` without distinguishing failure from successful playback.

Evidence: [browser-voice.ts](E:/projects/neet-tracker/src/lib/browser-voice.ts:410), [private-voice.ts](E:/projects/neet-tracker/src/lib/private-voice.ts:1).

**V2. Wake, listening, replies and navigation have competing lifecycles.**

The assistant uses recognition restarts and fixed 4.2/4.3-second continuation timers alongside audio completion callbacks. Navigation also uses short timers. The read-only memory endpoint returns an `href`, so a memory answer can trigger automatic navigation and close the window instead of remaining available to read. These patterns are credible contributors to one-shot listening and interrupted replies; the precise microphone failures need device reproduction.

Evidence: [site-voice-assistant.tsx](E:/projects/neet-tracker/src/components/voice-assistant/site-voice-assistant.tsx:123), especially navigation/reply handling around lines 206–276 and wake handling around 336.

**V3. Multi-chapter question allocation can invent a split.**

Reproduced locally:

| Spoken transcript | Actual current parser result | Required behavior |
|---|---|---|
| `45 questions from Morphology and Anatomy` | Morphology 45, Anatomy 0; no clarification | Keep total 45; ask for the split |
| `Morphology 20 questions and Anatomy 25 questions` | Both allocations unresolved; total field 20 | Resolve 20 + 25 = 45 |
| `20 questions from Morphology and 25 questions from Anatomy` | Allocations correct, but returned total is 20 | Return consistent total 45 |
| `I studied 2 hours and solved 45 questions from Morphology weak concepts none` | Whole-answer skip detector returns true | Record study; only weaknesses are empty |
| Devanagari `फिजिक्स खोलो` | Normalized text becomes empty | Preserve script and resolve supported Hindi aliases |

The wizard compensates for some multi-match totals by summing allocations, but that does not repair the invented split or general parser contract.

Evidence: [study-activity.ts](E:/projects/neet-tracker/src/lib/study-activity.ts:112), [voice-assistant.ts](E:/projects/neet-tracker/src/lib/voice-assistant.ts:88), [voice-daily-log.tsx](E:/projects/neet-tracker/src/components/daily-goals/voice-daily-log.tsx:394).

**V4. Review edits and recorded chapter deltas can disagree.**

The review form edits subject question totals independently of per-chapter allocations. Save submits both. Activity kind, coverage and completion are also subject-level values copied to every allocation; a mixed sentence about completing one chapter and only practising another cannot be represented faithfully by that structure.

Fix with per-activity drafts and invariants, not another regular-expression patch. Preserve unallocated subject totals explicitly when the student skips chapter detail.

Evidence: [voice-daily-log.tsx](E:/projects/neet-tracker/src/components/daily-goals/voice-daily-log.tsx:303), review controls around line 574.

**V5. “Saved” can mean only queued—or an unsuccessful HTTP response.**

Offline sync returns HTTP 202 with `offlineQueued: true`; voice logging treats any successful HTTP status as saved to the database. A new request ID is generated on every save attempt, so retry after an uncertain response is not the same logical operation. Separate queued/saving/synced/conflict/error states and retain a stable submission ID.

Evidence: [offline-sync.ts](E:/projects/neet-tracker/src/lib/offline-sync.ts:87), [voice-daily-log.tsx](E:/projects/neet-tracker/src/components/daily-goals/voice-daily-log.tsx:282).

**V6. Confirmation is not safely atomic.**

The confirm API treats anything except `CANCEL` as confirmation. It reads PENDING status before the mutation; task creation and marking the action completed are separate writes. Concurrent confirms can both pass the initial check. Use explicit decision validation, an atomic action claim, unique operation identity and transaction-scoped updates.

Evidence: [confirmation route](E:/projects/neet-tracker/src/app/api/assistant/actions/[actionId]/confirm/route.ts:85).

### P1 — Practice Arena and educational content

**P1. Availability and actual serving do not apply the same checks.**

PYQ availability declares a paper complete from a raw verified-row count. Assembly subsequently rejects malformed options, incomplete explanations and missing required visuals. A year can appear available but fail assembly. The selected paper is the largest raw-count paper; it does not first establish which complete paper is actually serveable.

Evidence: [availability](E:/projects/neet-tracker/src/app/api/practice/availability/route.ts:10), [strict serving predicate](E:/projects/neet-tracker/src/lib/question-bank.ts:474), year assembly around line 854.

**P2. Autosave reports success without checking the response.**

The practice autosave hook updates `savedAt` after `fetch` even for HTTP errors. Saves run every 2.5 seconds without a serialized versioned queue. The start flow even enters RUNNING on a network exception. Server PATCH accepts client timing/status payloads without a strict transition/version protocol.

Evidence: [practice client](E:/projects/neet-tracker/src/components/practice-cbt/practice-cbt-client.tsx:352), start/timer around 1417; [attempt PATCH](E:/projects/neet-tracker/src/app/api/practice/[id]/route.ts:118).

**P3. Palette and timing can diverge from reality.**

Selecting an already selected option clears its answer but still sets the palette status to ANSWERED (or ANSWERED_MARKED_FOR_REVIEW). The timer decrements once per interval rather than deriving elapsed time from a clock anchor, making suspension/throttling a risk. Fullscreen/blur security interruptions also need explicit handling for iPad system UI and assistant interactions.

Evidence: [practice client](E:/projects/neet-tracker/src/components/practice-cbt/practice-cbt-client.tsx:1432).

**P4. Some classifications lose meaning.**

Error-log creation classifies every non-full/non-PYQ practice mode as SECTIONAL, including custom tests. Preserve original test type and comparable score cohorts. Historical paper replay also needs year-specific format metadata rather than assuming every historical paper follows the current 180-question policy.

Evidence: [practice-engine.ts](E:/projects/neet-tracker/src/lib/practice-engine.ts:871), [practice creation](E:/projects/neet-tracker/src/app/api/practice/route.ts:86).

**P5. “Verified” is doing too many jobs.**

The NCERT-link importer promotes sufficiently strong lexical matches to VERIFIED passage/link status. Matching vocabulary is evidence of relevance, not proof that the exact question was derived from that passage. It can also update an existing bank question's chapter/subject from the matched document. Separate official answer-key verification, solution review, syllabus mapping, visual review and passage-link review.

Evidence: [link importer](E:/projects/neet-tracker/scripts/import-ncert-pyq-links.mjs:22), [matching pipeline](E:/projects/neet-tracker/scripts/match-ncert-pyq-passages.py:258).

Important qualification: runtime AI question generation is currently disabled by zero maximum fresh-question settings. The primary current flow assembles database questions. Do not diagnose every failure as AI generation or solve shortages by silently generating new questions. Existing validation is valuable, but neither a strict flag nor a passing build certifies academic correctness.

### P1/P2 — NCERT reader

**R1. It is not yet a true line-highlight reader.**

The PDF is inside the browser's native iframe. An external marker uses a percentage of the iframe height, not the PDF page transform. Browser zoom, native scrolling, thumbnails and internal page navigation are independent of application state. In the live chapter, a long passage is highlighted in a separate sidebar; the precise lines in the PDF are not highlighted.

Evidence: [reader chapter](E:/projects/neet-tracker/src/app/(protected)/reader/[id]/page.tsx:71). Desktop observation: The Living World, page 4.

**R2. Question rendering is inconsistent.**

Reader questions/options/explanations use plain text rather than the shared math/visual rendering used by practice. This cannot faithfully display all equation/diagram questions. Missing option-specific reasoning is replaced by generic wording, which is not an explanation of why that option is wrong.

Evidence: [reader chapter](E:/projects/neet-tracker/src/app/(protected)/reader/[id]/page.tsx), [answer route](E:/projects/neet-tracker/src/app/api/reader/[id]/answer/route.ts:34).

**R3. Highlight counts and coverage need honesty.**

The library labels all passage counts as verified highlights, but the chapter endpoint filters verified links/passages. The live library has many chapters showing zero highlights, especially Physics/Chemistry. That is incomplete linking coverage, not necessarily missing PDFs. Do not promise all PYQ-derived lines are annotated.

Evidence: [reader listing](E:/projects/neet-tracker/src/app/api/reader/route.ts:33).

Chapter-based filenames already work in the inspected chapter and should be preserved. Remote PDF serving already forwards range requests; the database/local-byte branch still returns the entire buffer. Improve that branch and caching rather than claiming range support is absent everywhere.

### P2 — shared UX, charts and trust

- **Header collisions:** the fixed centered search overlaps Practice Arena copy and competes with reader controls. Preserve its centered position, but allocate real header space instead of floating it over page content.
- **Primary work below decoration:** Daily Goals puts a large hero, statistics and analytics before the log form. Physics repeats completion in several places before chapters. Bring the next action above analytics.
- **Missing is shown as zero:** chart construction zero-fills absent logs, including discipline/completion. This contradicts the promise that empty days stay empty. The live unlogged day is also labelled “Poor.” Use `not logged`, not a performance judgement.
- **Incorrect buckets:** the screen-time “weekly” grouping uses six-day buckets. Its averages include unlogged dates as zero. Define calendar-day averages versus logged-day averages explicitly.
- **Misleading label:** “7-day rhythm” is calculated from each day's values, not a rolling seven-day window.
- **Touch/keyboard graph gaps:** daily SVG point interactions are mouse-enter/leave only, with a fixed 1,000-unit chart and labels every third point. Yearly ranges can overload labels. Use touch scrubbing, focused points, responsive tick density and accessible summaries.
- **False semantic precision:** the assistant's “weak subjects” are simply lowest completion percentages; today's plan is a slice of pending tasks without a today filter, after a take-30 query. Completion is not mastery.
- **Save feedback elsewhere:** Subjects optimistically change completion/questions and append revisions without consistently checking errors or rolling back; Tests clears its form after an unchecked response; Mood shows saved after an unchecked response.
- **PWA startup:** a transient session-check network error clears local auth and redirects to sign-in. Offline support currently caches an offline shell, not the full study database or PDF library. An installed PWA is not synonymous with full offline operation.
- **Style drift:** strong gold/pink/blue identity exists, but there are repeated nested cards, faint small labels, oversized banners, competing gradients and inconsistent page density. Global reduced-motion CSS and waveform visibility pausing already exist; preserve them. The WebGL scene still advances animation time under reduced-motion, so that path needs stronger restraint.
- **Copy drift:** the deployed dashboard still shows “UPSC side confidence.” Remove unrelated product copy. Exam-date displays should identify provisional dates until an official schedule is configured.

Evidence: [daily chart construction](E:/projects/neet-tracker/src/app/(protected)/daily-goals/page.tsx:275), [bucket logic](E:/projects/neet-tracker/src/app/(protected)/daily-goals/page.tsx:351), [chart interaction](E:/projects/neet-tracker/src/app/(protected)/daily-goals/page.tsx:1081), [assistant context](E:/projects/neet-tracker/src/app/api/assistant/context/route.ts:25), [protected layout](E:/projects/neet-tracker/src/app/(protected)/layout.tsx:44), [Subjects](E:/projects/neet-tracker/src/app/(protected)/subjects/[subject]/page.tsx:342), [Tests](E:/projects/neet-tracker/src/app/(protected)/tests/page.tsx:192), [Mood](E:/projects/neet-tracker/src/app/(protected)/mood/page.tsx:119).

## 5. Voice coverage: current reality and proposed scope

The assistant is mounted in the shared protected layout, and its route aliases cover the major workspaces. **Being available on a page is not the same as being able to operate that page.**

| Area | Present capability | Required integration |
|---|---|---|
| Navigation/search | Named routes, aliases, subject/chapter search | One complete route/entity registry; contextual discovery; safe deep links and retained wake session |
| Subjects | Confirmed topic/chapter creation, duplicate checks, limited study updates | Per-entity multi-step updates, partial/full revision distinctions, corrections and exact delta review |
| Daily Goals | Guided subject entries, allocations, review/save, tomorrow Todo drafts | Correct mixed clauses/splits/skips, parity with applicable manual fields, resumable drafts and verified save |
| Todo | Create task; suggest next saved task | Find/edit/complete/reschedule tasks, resolve ambiguity and confirm schedule changes |
| Planner | Navigate | Read plan, inspect alternatives, preview and apply changes through task services |
| Practice | Navigate to builder/sectional presets | Build a scope-validated test, inspect stock, open/resume attempt; restricted in-exam command set |
| Tests/Error Log | Navigate; simple test suggestions | Open a specific attempt, record reviewed results, retrieve evidence and log mistakes |
| Reader/PYQ | Navigate/search entry points | Open exact chapter/page, traverse highlights, attempt options and save bookmarks |
| Reviews/Insights/Rank | Navigate; basic memory/help | Read actual report findings with dates; open evidence; run only supported operations |
| Mood/Cycle Planner | Navigate | Optional explicit field capture; confirm sensitive writes; discreet spoken output |
| Notifications/preferences | Limited local controls | Manage supported preferences/reminders with clear permissions and scheduling semantics |

The current action types are narrow: CREATE_TOPIC, CREATE_CHAPTER, CREATE_TASK, UPDATE_STUDY, MEMORY_QUERY, PAGE_HELP, NAVIGATE and SEARCH. There is no general multi-action executor covering every API. The three displayed action steps are derived from interface state, not a durable record of actual substeps.

### Proposed command architecture

`Speech/text → normalized transcript → route/entity retrieval → typed intent(s) → validation/clarification → preview when needed → shared application service → confirmed result → clone speech + UI receipt`

1. A single `VoiceSessionController` owns microphone, wake detection, speech playback, cancellation and route changes. Opening/closing a panel must not instantiate competing recognition sessions.
2. A typed capability registry describes every supported page action: aliases, argument schema, permissions, confirmation policy, availability, execution and result navigation. The UI and assistant call the same services.
3. A canonical subject/chapter/topic directory supplies aliases such as NLM/Newton's laws/Laws of Motion. Normalize Unicode without destroying Hindi. Resolve class and subject before similarly named chapters. Ask on ambiguity; never choose a random match.
4. An explicit dialogue draft retains missing fields, previous corrections and selected entity IDs. “No, 25 from Anatomy” updates a pending allocation rather than starting a new command.
5. A real action queue displays only useful progress and supports cancel/retry/edit/result. Atomic claims and stable IDs prevent duplicate writes. Cancellation after a committed action offers a safe inverse where possible; it does not pretend the action never happened.
6. Memory is an evidence-backed query across study activities, manual daily logs, revisions, tasks, attempts and reader progress, filtered by requested date and ownership. Separate preferences from factual history. Allow forget/reset controls; raw audio is not retained by default.
7. Proactive assistance proposes one useful next step after a saved log, with its reason. It does not silently schedule tasks or infer missing work. No student-facing reliability dashboard.

### Fast, accurate daily logging

Start with one open prompt: “Tell me what you studied today.” Extract multiple subjects from a normal answer. Show small editable subject summaries; ask only unresolved questions. Use field states `provided`, `unknown`, `skipped`, not one blanket skip.

Example: “Botany, two hours, 45 questions.” Ask which chapters. If she says Morphology and Anatomy, ask the split. If she skips, retain 45 at subject scope, with no invented chapter allocation. If she gives 20/25, verify their sum. Completion and full revision are confirmed separately for each relevant chapter. Tomorrow plans become Todo records only after review.

Offer the applicable remaining manual fields without forcing screen-time detail into every session. Never omit fields silently to meet a stopwatch target. Aim for a typical complete log in roughly two minutes; report actual median and slow-case times during testing rather than guaranteeing every conversation takes less than two minutes.

### No external AI API key: feasible, with important boundaries

- Navigation, retrieval, parsing, confirmation, task execution and memory do not require a generative model. Implement these deterministically first. A retrieval index reduces ambiguity; calling something RAG does not make it hallucination-free.
- Existing voice recognition delegates to browser SpeechRecognition. Availability varies and some implementations send audio to a vendor service. No key does **not** mean local/offline/private processing. [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
- Benchmark an on-device speech/wake option on the actual devices before selecting it. A heavy model that works on the HP laptop is not evidence it works well on Samsung M12 or iPad PWA. An optional self-hosted service uses no third-party AI key but still needs a running server and a network connection.
- Keep clone-only, 1× output. Fixed clips are suitable for predictable greetings, not arbitrary conversational replies. Dynamic speech requires a licensed self-hosted/on-device voice synthesis engine, tested with the provided sample. Do not substitute a female voice if it fails; show an explicit silent fallback. Do not promise natural real-time cloning from a short sample before benchmarking it.
- First-use mic/audio activation may require a user gesture. A saved preference cannot override a denied browser permission or autoplay policy. [Microphone permissions](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [autoplay policy](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
- Scope wake listening to a consented, active foreground session. A minimized assistant panel on an active page is different from a hidden/suspended/locked PWA. Do not promise OS-level Siri behavior from website JavaScript; background execution is restricted. [Page visibility/background throttling](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
- The wider project currently uses Gemini in several analysis/chat paths (`src/lib/openrouter.ts` despite its filename). Making the command engine key-free does not remove those dependencies. Label and isolate them; replace only the requested capabilities with deterministic/local alternatives.

## 6. The proposed design system

### Visual direction: personal, editorial, precise

- Near-black matte canvas; a small number of tonal surfaces; warm cream readable text; antique gold for selection and primary actions. Keep subject colors semantic and restrained.
- Playfair for a short page/conversation heading; Inter for body, controls and data; tabular numerals for timers/scores. Avoid serif labels on every card.
- One shared protected header with centered search and an icon-only mic. Give it actual layout height and safe-area space. No shortcut badge. Hide/collapse nonessential chrome in active reading or test focus modes.
- A consistent navigation system: compact desktop navigation; a five-destination mobile dock such as Today, Study, Practice, Plan, More. Other routes remain accessible in More/search/voice; no duplicate assistant sidebar.
- Default page rule: one clear heading, one primary action, a few meaningful supporting values. Detailed instructions, methodology and provenance sit behind appropriately labelled disclosure—not repeated slogans.
- Reusable page header, tabs, drawers, dialogs, empty states, error receipts, filters and chart frames. Introduce shared tokens for spacing, radius, elevation, density and motion, then migrate one page at a time.
- Readable body text and sufficient contrast; touch targets designed around 44px or larger; proper focus, accessible names, keyboard operation and zoom. Minimal voice text means no wall of transcript, not removal of necessary confirmations or accessibility.

### Signature interactions—not decoration everywhere

- **Continue thread:** dashboard resumes the exact chapter/page or unfinished attempt. It does not show an arbitrary generic recommendation.
- **Chapter workbench:** opening a chapter reveals Learn / Practise / Revise and its history in place. Reading, questions and revision use the same canonical chapter identity.
- **Study receipt:** after a log, one compact receipt shows hours, question allocations and revision/completion deltas; expand or correct it without navigating through several pages.
- **Evidence-to-action:** a weakness opens the supporting wrong answers, then a scoped practice or revision draft. Never call low completion “weak mastery.”
- **Study Pulse:** preserve and refine the existing WebGL work. Pastel pink responds to student audio; pastel blue to real clone playback. Quiet idle, distinct thinking/executing/error states; no fake microphone activity. Rail collapses on tablets/phones; no text composer in Voice mode.

Motion is functional: short pressed/selection feedback, restrained drawer transitions, continuity between a chapter and its reader. No chart animation that distorts data, perpetual glowing cards, forced splash delay or particles across every page. Reduced-motion should substantially stop decorative movement, not merely reduce its amplitude. Adapt renderer resolution from measured frame performance, pause when hidden and offer a non-WebGL fallback.

## 7. Page-by-page redesign plan

| Page / route family | Product and layout change | Voice and verification requirement |
|---|---|---|
| Landing `/` | One distinctive brand composition and clear entry; remove unnecessary loading spectacle | No assistant/mic capture; check fast loading and sign-in path |
| Sign-in `/signin` | Minimal private entry, accessible errors, trusted-device explanation | No wake listening; test expired session, retry and offline messaging |
| Dashboard `/dashboard` | Today’s next action, continue reading/test, compact four-subject overview; analytics below | Open any registered page; retrieve factual day summary; no unrelated UPSC copy |
| Subjects `/subjects/[subject]` | Shared four-subject workbench; class tabs, searchable chapter list first; details/history in drawer | Create/dedupe topics, log deltas, confirm completion and revision; cross-class ambiguity tests |
| Daily Goals `/daily-goals` | Log-first layout; Manual / Voice entry; analytics and screen time secondary | Whole-day extraction, missing-field follow-ups, editable receipt, stable save identity |
| Todo `/todo` | Today / Upcoming / Done; fast capture; task detail only when opened | Create, find, complete, edit, reschedule; tomorrow drafts land here |
| Planner `/planner` | A readable plan derived from actual tasks; avoid competing Todo records | Read/revise draft, preview schedule differences, confirm before applying |
| Practice `/practice` | Four modes: Full, Sectional, Custom, PYQ. Resume attempt first; folders secondary | Shared builder commands; exact scope/stock validation; no auto-start on ambiguous request |
| Practice folders `/practice/folders/[folderId]` | Compact breadcrumbs, useful names, touch move menu; preserve attempts | Resolve named folder/attempt; confirm deletes without deleting unrelated records |
| Active test (Practice flow) | Distraction-free question stage, stable timer, accessible palette, status legend on demand | Exam-safe next/previous/review controls; navigating away prompts pause/exit, never silently submits |
| Results/answer review | Score, error pattern and next action first; solutions/diagrams on demand | Explain recorded result, open wrong answers; no unsupported academic explanation |
| Tests `/tests` | Separate history, log form and trends; full-length and custom scores not mixed indiscriminately | Record reviewed result, open a named test, retrieve comparable trend |
| Error Log `/tests/error-log` | Question-first correction inbox; details for misses; analytics secondary | Add/find mistake, retrieve source question, confirm resolution |
| PYQ archive `/pyq` | Separate NEET/AIPMT/JEE collections clearly; year/paper completeness and provenance | Open exact exam/year/paper; distinguish archive replay from current-syllabus practice |
| PYQ explorer `/pyq/questions` | Clean filter drawer, shared question renderer; answers hidden until requested/attempted | Filter by year/subject/chapter, bookmark and build scoped practice |
| NCERT library `/reader` | Group by actual book/class and chapter order, Resume first; edition/source available on demand | “Open Laws of Motion NCERT”; preserve chapter title and last read position |
| NCERT chapter `/reader/[id]` | App-controlled PDF page/text/highlight layers; desktop question panel and mobile sheet | Next page/highlight/question/option; zoom-safe pastel highlights; exact question provenance |
| Reviews `/reviews` | Short weekly reflection and one actionable next step; history expandable | Read selected period, open evidence, draft agreed revision |
| Insights `/ai-insights` | A small insights overview, not a marketplace of AI claims | Read available reports; clearly distinguish retrieval, calculation and generated prose |
| NEET-GURU `/ai-insights/neet-guru` | Focused conversation, citations next to academic claims; collapsible history | Keep tutor answers separate from privileged command execution; provider unavailable state |
| Rank Predictor `/ai-insights/rank-predictor` | Plausible range, evidence date and uncertainty first; avoid false exact rank | Open/explain saved forecast; do not treat completion percentage as measured exam readiness |
| Cycle Planner `/ai-insights/cycle-planner` | Private calendar and voluntary study adjustments; simplify nested cards | Explicit consent for sensitive speech/writes; confirm schedule changes; no medical certainty |
| Mood `/mood` | A brief supportive check-in; optional notes/trends | Record explicit values with save confirmation; no guilt labels for missing logs |
| Visual Lab `/visual-lab` | Remove requested standalone page and its promotions | Remove aliases/help/prefetch/tests/API references; redirect old bookmarks thoughtfully |
| Offline, loading, error, not-found, notifications | Shared calm recovery states; preserve drafts; distinguish offline from sign-out | Never announce success while queued; release mic appropriately; safe retry/resume |

Visual Lab removal must be a dependency cleanup: dashboard tile, QuickNav, legacy sidebar/topbar, prefetch list, voice aliases/help, route tests, proxy entry, styles, components and explain endpoint. Retain shared math/diagram helpers used elsewhere and preserve any useful user records. No broad deletion of educational assets.

## 8. NCERT and question-quality implementation

1. Use an app-controlled PDF renderer with canvas, selectable text and annotation layers transformed from the same page viewport. PDF.js exposes the scale/rotation transforms needed for this. [PDF.js examples](https://github.com/mozilla/pdf.js/blob/master/docs/contents/examples/index.md).
2. Store highlights as document-version ID, page, exact quoted text and one or more page-coordinate rectangles. Support multi-line passages and multiple linked questions. Verify alignment at different zooms, rotations and device sizes.
3. Use translucent pastel blue/lavender on the actual text, with active/focus outlines and accessible hit areas. Keep PDF pages readable instead of applying a blanket dark inversion.
4. Reuse one `QuestionContent` renderer for practice, PYQ, reader, bookmarks and error review: math, tables, images, alternatives, explanations and provenance. Render tests must catch malformed formulae, text encoding and absent diagrams.
5. Build separate inventory views for source availability, extracted items, key-verified questions, reviewed explanations, current-syllabus mapping, visual readiness and passage-link review. These are maintenance tools, not a student engineering dashboard.
6. Quarantine uncertain rows/links. Do not erase historical content merely because the current syllabus excludes it: retain the archive and exclude it from current-syllabus tests. Custom student-added topics must not silently become official syllabus nodes.
7. Reconcile stock using the exact serving rules before enabling a test selection. Retain independent Class 11/12 and Physics/Chemistry/Botany/Zoology scopes and the full-class sectional mode.
8. Run a stratified academic review across subjects, years, sources, diagrams and question formats. Disagreement between automated solvers is a review signal, not permission to guess. Full academic certification needs qualified content review.

## 9. Data, security and delivery foundations

- Introduce shared application services for task transitions, study logging, revisions, reader attempts and test state. Manual UI and voice use identical validation and ownership checks.
- Keep raw transcript/provenance separate from authoritative facts. Record who/what changed a value and the operation ID. Make undo a safe inverse with conflict detection, not restoration of a stale whole-record snapshot.
- Formalize the current single/private-workspace data model before supporting additional independent accounts; several models/queries are global while newer records have `userId`. Do not assume multi-tenant isolation is already complete.
- Stable operation IDs, conditional updates and transaction boundaries for all mutation retries. A confirmed response must reconcile to a single committed result.
- Durable user-scoped offline outbox with visible queued/synced/conflict states. Current localStorage queue expires after 24 hours and retains only 120 mutations; do not silently discard unsynced study work.
- Version schema changes and test migration/rollback against a staging copy. Preserve historical studies, tests, PDFs and provenance.
- Private cloned audio is presently under untracked `private-assets`; ensure reproducible authenticated asset delivery rather than relying on a particular workstation's untracked files. Do not commit the private recording publicly.
- Remove unused/dead generation paths after dependency analysis; split huge modules by feature, not into hundreds of trivial wrappers. Update README, data dictionary and supported-command documentation.
- Re-test build, full configured lint, unit/integration/UI tests and deployed smoke tests in CI. The current 32 parser/scope-focused tests are not enough to certify application behavior.

## 10. Execution order and acceptance gates

### Phase A — protect data and establish regressions

Fix allocation/skip bugs, save acknowledgements, stable IDs, atomic confirmation, palette state and timer semantics. Add failure/retry/concurrency tests before styling. Audit stock and highlight verification policy without replacing the production bank.

Gate: the reproduced examples pass; timeout/retry/double-confirm does not duplicate increments; failed saves retain drafts; no misleading saved state.

### Phase B — shared shell and visual system

Prototype the actual Dashboard, Subject and Daily Log layouts in the application on a preview deployment. Agree on density, typography and navigation, then extract the shared primitives. Remove Visual Lab cleanly.

Gate: no search/header overlap, no duplicate navigation, useful first screen on mobile/tablet, readable light/dark modes, keyboard and reduced-motion checks.

### Phase C — complete the core study loop

Connect chapter → PDF → linked question → mistake/revision → daily receipt → tomorrow Todo. Fix Practice Arena stock and recovery; unify question and chart rendering.

Gate: same content renders correctly in every context; PDF highlights stay on the intended lines through zoom/scroll; attempt answers survive reload and interruption; graph values match fixture records.

### Phase D — cross-project voice agent

Implement session ownership, action registry, dialogue state and evidence-backed memory. Roll out navigation first, then tasks/study, then reader/test/review actions. Benchmark clone speech and recognition separately. Enable advanced providers only after device tests; retain a usable manual path.

Gate: every advertised action has scenario tests; ambiguous quantities/entities cause clarification; cancellation suppresses stale responses; wake works repeatedly while the foreground panel is closed; no mic on landing/sign-in. Voice does not perform an action merely because a retrieved document contains instructions.

### Phase E — device and release qualification

Test iPad 10th-gen PWA and Safari, Samsung M12, Realme Narzo, iPad 11th-gen, and desktop including Comet. Include microphone denied/prompt/granted, playback rejection, silence, interruptions, repeated wake cycles, minimize/reopen, keyboard open, rotation, split view, network loss and app suspension.

Use staged rollout, database backup and a rollback-ready release. Do not announce all-device perfection from desktop testing. Deployment should follow the approved redesign and acceptance gates, not this audit alone.

### Proposed quality targets

- Zero known wrong-write or duplicate-save defects in the supported scenario suite; unknown inputs never generate invented entity IDs or arbitrary chapter allocations.
- All registered routes tested for direct speech and discovery wording; every mutation has success/error/retry/cancel coverage.
- A representative phrase corpus per action, including aliases, Indian English, supported Hindi/Hinglish, pauses, corrections and background noise. Report intent accuracy separately from transcription and wake recall/false triggers.
- Typical complete voice log around two minutes without rushing; measure actual timings. Longer ambiguous logs remain accurate rather than silently skipping fields.
- No horizontal overflow on primary layouts from narrow phones through desktop; test touch and keyboard, 200% zoom and reduced motion.
- Responsive interactions and smooth motion on target hardware; establish measured budgets for JS, PDF memory and rendering before committing to more 3D effects.
- No publication of “complete PYQ coverage,” “verified derivation” or “perfect answers” without corresponding inventory and review evidence.

## 11. What the finished product should feel like

Misti opens the app and sees what she can do next, not a wall of dashboards. Her chapter opens directly into useful work. Bubu remains available across protected pages, understands supported requests, asks one focused question when uncertain, and reports only what was actually saved. The PDF behaves like a book; questions behave consistently everywhere; graphs tell the truth. The special visual moment belongs to the voice sphere—not to every button and card.

That is a credible path to the premium product requested. The current version is a foundation for it, not the finished result.

## 12. Implementation checkpoint — 6 September 2026

This is an implementation checkpoint, not certification that every page or voice action is complete. The core batch was subsequently pushed and released on 6 September; see the release receipt below.

### Page-specific work completed in the current batch

| Area | Implemented | Still requires qualification |
| --- | --- | --- |
| Shared shell | Reserved header space, centered search with icon-only microphone, navigation dock, grouped Explore, light/dark tokens, reduced-motion rules, exam chrome suppression | Actual iPad PWA, Comet, rotation and keyboard testing |
| Landing / sign-in | Calmer layouts and fresh authenticated navigation after login | Final release/device checks |
| Dashboard | Next-step layout, real saved metrics, subject lanes, task links, honest missing-data chart gaps, focus timer | Full metric-source reconciliation, long-term timer/device checks |
| All four subject pages | Shared workbench layout, chapters before analytics, checked mutation responses | Remaining rename/reorder/delete conflict scenarios |
| Daily Goals / wellbeing | Form-first hierarchy, clearer charts and inputs, draft-preserving errors, voice allocation fixes | Complete voice review/retry/undo matrix and real-device timing |
| Test journal / Practice | Journal redesign, removal of invented cutoff lines, stricter attempt snapshots, elapsed-clock timer, save feedback and sectional/custom scope preservation | Deeper Practice landing/result/palette design pass and interruption races |
| NCERT | Same-origin PDF.js, selectable PDF text, zoom/fit controls, chapter naming, correct coordinate overlay geometry and reviewed-link gating | Human review of passage links; no claim of complete verified historical highlights |
| Insights hub | Four purpose-led cards using existing destinations and restrained motion | Final mobile/light-theme checks |
| Study planner | Responsive schedule with revision rail, planned-versus-completed explanation, collapsible rationale | Existing generator can produce inconsistent narrative totals; planning logic needs reconciliation |
| Todo | Task-first board, optional request composer, mobile detail navigation, checked saves/deletes, queued-state feedback, destructive-action confirmation | Durable idempotent offline outbox remains a broader engineering task |
| Rank Predictor | Less clutter, a single labelled comparison chart with exact-value table, heuristic evidence explanation, unsaved-history warning, removed fixed-college-cutoff cards | Historical calibration/source verification and model quality review remain separate from UI validation |

Cycle Planner and PYQ still need their deeper page-specific redesign. Shared styling and route coverage do not count as finishing those pages. Visual Lab's standalone entry has been removed/redirected; its shared explanation component remains in use by NEET-GURU.

The continued batch also redesigned Review Cards and NEET-GURU. Reviews now use one labelled metric/axis at a time, a chronological exact-value table, explicit gaps for older cards without measurable indices, collapsed history/comparisons, and non-accusatory alignment labels. Refresh failures preserve cards and selections; queued or mismatched submission receipts never mark a reflection completed. The existing scoring formula and historical generated assessments remain unchanged and need a separate quality review.

NEET-GURU now uses the shared ink/cream/gold theme, a responsive conversation rail, original line-art mark, icon-led prompts and a fixed accessible composer. Suggestions fill a draft rather than immediately calling a provider. Stream decoding preserves fragmented UTF-8, surfaces errors, requires a completion receipt and cancels stale display when moving to a new chat. Failed/queued replies restore text and attachments. Failed deletion/loading keeps the existing conversation visible. This is still the existing online AI service, not an offline model; stopping its display does not guarantee cancellation of backend generation or saving.

### Reliability and release checks

- Production build passed after the page changes; the supported Node 22.22 runtime was used.
- Prisma generation and the PDF asset postinstall succeeded after the local engine lock was released.
- 50 automated tests passed, including service-worker lifecycle, daily-log acknowledgement/queue reconciliation, database URL configuration, chat-stream decoding/cancellation and skipped-rating preservation tests.
- Full-project ESLint now ignores generated vendor assets and local research/output folders, while still checking application and project scripts. CommonJS maintenance scripts retain their supported module convention. The last successful lint run had zero errors and 14 warnings (image optimization and unused maintenance-script variables).
- Signed-in browser checks were extended to desktop, tablet and phone, real NCERT rendering/zoom, keyboard global search and simulated Todo failure/queue cases. Fixture transport is confined to the QA script; it does not write student records or introduce mock data into the product.
- A real database connection interruption was observed during browser QA. The application retained the local session and showed recovery instead of clearing pending work. A subsequent focused browser run passed. This does not establish database uptime.
- PWA updates no longer immediately reload active study sessions. The update button asks the student to finish/save work first, waits for the offline queue to clear and is hidden during a CBT exam.
- An earlier full browser run loaded all 20 registered test routes successfully. The corrected phone Todo grid and search close subsequently passed affected-route checks. The latest local browser run passed 21 interaction checks across PDF zoom/fit, keyboard search, rank rendering, Todo failure/queue handling, Daily Goals date-load/numeric/queue integrity, Reviews and NEET-GURU. All simulated mutation/provider responses are QA-only fixtures, not student records or live model evaluations.
- New page layouts opt out of the old blanket responsive CSS through `data-studio-native`. Daily Goals now places its logging desk before the long-view summary, rather than relying on CSS visual ordering.
- Daily Goals cancels superseded date reads, times out incomplete loads, and unlocks the form only for its successfully loaded date. Failed reads do not update the last-synced timestamp. Explicit per-entry acknowledgements are required; HTTP 202 never means recorded. Replay avoids the shared queue creating a second copy, and queue reconciliation preserves edits made while a previous snapshot was syncing.
- Database failures recurred during the newest browser runs. A TCP reachability check succeeded, which does not prove an authenticated database session is healthy. Production now reuses the process's Prisma client and adds bounded MySQL defaults (five connections, 15-second connect/pool timeouts) only when deployment settings omit them. This is a mitigation to test, not a proven root-cause diagnosis. Parameter semantics were checked against the [Prisma 6 MySQL documentation](https://docs.prisma.io/docs/orm/v6/overview/databases/mysql) and [connection-management guidance](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections).
- Session-check database outages return a recoverable HTTP 503 with a retry hint, rather than falsely treating the student as signed out.

### Important outstanding boundaries

1. Cloned voice currently uses the available private audio clips at 1×. Arbitrary dynamic speech in the user's cloned voice is not implemented. Do not describe it as a complete local Siri/ChatGPT replacement.
2. Foreground wake-word and navigation logic has fixes and parser tests, but cannot be called universally reliable without microphone/audio testing on the specified hardware. Background and locked-screen listening are not guaranteed by a website/PWA.
3. Existing automatically matched NCERT passages must pass explicit human review before serving as verified links. The stricter gate can result in no visible highlights until those reviews are completed; nothing has been silently fabricated or deleted.
4. Do not publish private clone recordings to GitHub. The release must verify their authenticated delivery through the existing Vercel workflow.
5. Finish remaining page passes and release smoke checks before calling the entire redesign complete. The user requested a staged release of this core batch; deployment confirmation will be recorded separately.

### Staged-release plan approved during continuation

- Publish this tested core batch before the remaining Cycle Planner, PYQ and deeper Practice design passes.
- Use a `codex/` release branch and the existing Vercel project. A Git-only deployment cannot currently supply the untracked private voice clips; use the authenticated CLI upload and verify the traced audio route before promotion. Keep recordings out of GitHub and exclude local research exports from deployment.
- Preserve the current production deployment for rollback: `dpl_Hy8K2tgojneMBiLFkjqj66FyoXa4` (19 August release).
- Verify the candidate with normal sign-in, read-only application endpoints, protected audio and byte-range delivery, PDF worker availability and page responses. No new production bank replacement, schema migration or live AI generation is part of this release verification.
- The first candidate failed before promotion because an unanchored deployment ignore rule also excluded `src/data`. The rule was narrowed to root-only local exports; syllabus/catalog assets and private authenticated audio are included, while environment files remain excluded. The previous production site was not changed.
- Work began on the remaining Cycle Planner reliability pass: omitted pain/energy values now remain unknown on both ingestion and reading, instead of coercing null to zero/minimum. Explicit zero pain remains valid. This does not repair historically coerced values or validate the forecasting/health model.

## 13. Core-batch release receipt — 6 September 2026

- Live site: https://neet-tracker-misti.vercel.app
- Promoted deployment: `dpl_2pwCGakYvNwy7GBGe1cA5ktLZ7w8`, runtime source commit `b5c4a55`.
- GitHub source branch: `codex/study-studio-release-20260906`. Main was not merged; the private voice asset delivery still requires the existing authenticated CLI release workflow. Follow-up commits containing only this receipt and QA tooling do not change the deployed application.
- Vercel production build succeeded with Node 22, Prisma generation, PDF.js asset preparation and all 48 static pages. Production alias inspection resolved to the promoted deployment.
- Local source gates: 50 tests passed, full ESLint had zero errors / 14 warnings, production build succeeded, and the final affected-route browser run passed all 21 interaction checks. Desktop core routes and tablet/phone NEET-GURU loaded without horizontal overflow or reported page/API errors. Real NCERT PDF rendering and zoom/fit passed. Transport-fixture results are not live AI evaluations.
- Both the protected candidate and public production address passed the release checks: normal credential sign-in; session, dashboard, subjects, assistant context, Practice availability, reader and task API reads; eight protected page responses; and the versioned PDF worker. The private clone audio returned 401 without the application session, 200 with it and 206 for a valid byte-range request. Audio files were not committed to GitHub.
- No schema migration, production question-bank replacement or live provider generation was performed during release verification. Existing study records were preserved. Normal authentication and existing GET-side effects may update session/derived metadata.
- Remaining: Cycle Planner's full UI and save/retry pass; PYQ archive/question browsing; deeper Practice landing/palette/results refinement; academically reviewed passage links and bank coverage; durable user-scoped offline conflict handling; arbitrary dynamic cloned speech and real iPad/PWA/Comet microphone qualification. These are not claimed complete by this release.

For an already open PWA, finish and save current work before closing/reopening or accepting the update prompt. Never clear browser storage to force the update while unsynced work remains.

## 14. Cycle Planner & PYQ continuation — 7 September 2026

This batch follows the core release; it does not certify the whole project as complete.

- Cycle Planner now puts the usable calendar and optional log form first. Detailed patterns and forecasts are collapsed, the private-account note is compact, calendar days have accessible selection/date labels, and the layout uses scoped ink/cream/gold styles on desktop, tablet and phone. Phase-based claims about peak study ability were replaced with neutral, user-led workload copy. Forecast calculations themselves are unchanged and not clinically validated; the UI explicitly distinguishes estimates from medical advice or contraception.
- Cycle saves use a stable per-draft operation identifier and a user-scoped deterministic database ID, without a schema migration. Retrying the same new draft reuses its saved entry; a conflicting replay asks the user to edit the existing log. Failed/queued/mismatched receipts keep the draft. Delete receipts identify the removed log and retries are idempotent. Derived forecast/snapshot failures do not misreport an already committed log as failed. Calendar date rollover and reversed windows are rejected by shared UI/API validation.
- Refreshes are bounded and superseded reads cancelled. The form locks during mutations; cancellation/replacing an open draft asks for confirmation. Temporarily reducing the date window retains hidden day drafts until saving. Optional day ratings remain unknown when skipped. This is not durable offline draft storage or cross-device conflict resolution.
- Optional Cycle AI advice now discloses that recent logs, symptoms and the summary go to the existing online provider, asks before sending, and shares the robust chunked-stream reader. No provider was called during QA. It is not a new local model.
- PYQ question browsing is now attempt-first: answers are hidden until selection, feedback and available option explanations are rendered from the bank, graphical assets are displayed, and a failed diagram disables the answer controls. Local browsing attempts explicitly do not alter study totals. Search adds class alongside subject/chapter/year/difficulty, preserves filters on failure, hides stale results, supports retry/empty states, and collapses extra filters on phones. Pagination input is integer-bounded at the API.
- The archive opens directly on NEET; JEE supporting papers remain available. Year slots are clearly described as personal progress tracking, not evidence of complete paper coverage. A prominent question-library link and NEET year/status filters improve discovery. Save receipts are checked, queued progress is not shown as complete, concurrent saves use exam/year keys, and background refresh is throttled and paused while hidden. No new academic questions or provenance were invented.
- The floating microphone-permission hint is limited to the dashboard so it cannot cover study inputs or answer options. The persistent header microphone and existing protected-page voice controller remain available.
- Source gates: production build/TypeScript pass; 52 unit tests pass; full lint has zero errors and the same 14 existing warnings. Browser mutation tests use isolated transport fixtures, not live student writes. Earlier QA attempts exposed test-driver issues with controls behind fixed navigation: the checks now scroll controls to the viewport centre and click visible checkbox labels, rather than hidden input coordinates.

Still outstanding after this batch: deeper Practice landing/palette/results design and interruption checks; planner narrative/total reconciliation; academic review of NCERT links and bank coverage; durable user-scoped offline conflicts; arbitrary dynamic cloned speech; real microphone/wake-word qualification on the specified iPad/PWA/Comet devices. Existing private voice assets must continue to ship through the authenticated CLI deployment, not GitHub.

Final focused browser result: all seven new interaction groups passed on the final runtime build, including draft/receipt/retry integrity, local answer reveal, filter error recovery, responsive screenshots and queued NEET progress. Screenshots were reviewed; no horizontal overflow was found at 1440, 820 or 390 pixels. The broader earlier run in this batch also passed the existing 21 interaction checks and loaded the three affected routes at desktop/tablet/phone sizes. Hardware audio and online-provider generation were not exercised. No schema migration is required for this batch.

## 15. Continuation release receipt — 7 September 2026

- Runtime source commit: `021b8a4`, pushed to `codex/study-studio-release-20260906`.
- Promoted deployment: `dpl_6Qy5ooNU6QvQZRxoCRT67yVCdtBF`; immutable address: https://neet-tracker-misti-aixjta8z5-adarsh180s-projects.vercel.app.
- Live address: https://neet-tracker-misti.vercel.app. Candidate verification completed before promotion; the public address subsequently passed the same checks.
- Deployed checks: normal sign-in; ten authenticated read APIs including Cycle/PYQ; eleven protected page responses; PDF worker; private audio denied without session and delivered with it, including a 206 byte range. Private voice files remain outside GitHub.
- The final complete local browser run passed all 28 interaction checks and loaded Cycle Planner, PYQ archive and PYQ questions at desktop/tablet/phone sizes without reported page errors or overflow. Production build/TypeScript and 52 unit tests pass; lint has zero errors and 14 existing warnings.
- Prior core deployment `dpl_2pwCGakYvNwy7GBGe1cA5ktLZ7w8` remains the rollback reference. Main was not merged. Documentation-only commits after this receipt do not alter the deployed runtime.
- The requested native-app roadmap is in `docs/ANDROID_IOS_ROADMAP_2026-09-07.md`. It is a proposal; no Android/iOS application, account enrollment or store submission was created in this release.

## 16. Practice safety and native-app handoff — 7 September 2026

This continuation prioritises remaining test interruption defects and planner arithmetic, deploys the verified website, then starts the authorised native client alongside the existing repository. It is not a claim that every earlier ambition is finished.

- Practice puts unfinished attempts first, collapses collections, retains class-wise PCB sectionals and custom tests, and honours subject/chapter/mode deep links. The header no longer implies this private practice console is operated by NTA.
- Attempt opening handles failure and superseded selection. Saves validate the attempt identity and reject queued/malformed receipts. Pause/resume wait for in-flight autosaves, have bounded network timeouts, and preserve answers when a transition fails. Leaving through the pause menu requires a confirmed pause. Browser unload warns; this is not durable offline recovery after force-closing the app.
- Submission requires a matching completed receipt. Auxiliary proctor-report failure no longer hides an already committed result. Camera streams acquired by the arena are stopped on unmount. The existing proctor policy and hardware permission requirements are unchanged.
- Planner summary and displayed totals are derived from timed blocks, including historical plans, without rewriting old tasks. Breaks are excluded and mixed blocks explicitly disclose their equal allocation assumption.
- Production build and TypeScript pass, 54 unit tests pass, full lint has zero errors and 14 pre-existing warnings. The broader 28 browser interaction checks passed; Practice/Planner render at desktop/tablet/phone sizes without overflow. New practice failure-path tests use a labelled interface fixture, simulated camera/standalone mode and accelerated calm timer, not student records or real hardware.
- Still unqualified: durable offline conflict handling, physical-device microphone/wake reliability, arbitrary dynamic cloned speech, complete historical academic coverage and human-reviewed NCERT passage mappings. The native app will expose only working native flows and identify website handoffs, not pretend every web feature has already been ported.

## 17. Live website and first native slice — 7 September 2026

- Website runtime `9d39c34` is pushed and promoted to `https://neet-tracker-misti.vercel.app`.
- Deployment: `dpl_9TWB8YnW7YBSkhvRvYkXLKwLidvW`, immutable address `https://neet-tracker-misti-rkxeoo51a-adarsh180s-projects.vercel.app`. Candidate and public release checks pass, including normal login, protected APIs/pages, PDF worker, private voice authentication and 206 audio seeking. Prior `dpl_6Qy5ooNU6QvQZRxoCRT67yVCdtBF` remains the rollback reference.
- All nine focused Practice checks pass on the final source build. These include failed/queued pause, failed resume, retained selected answers, result opening despite auxiliary-report failure, sectional links and responsive layouts.
- Native development started only after website promotion. `apps/mobile` is an isolated Expo SDK 57 / React Native 0.86.3 app using the existing first-party APIs. Today, subject browsing and Todo completion are native; other workspaces are explicitly labelled website handoffs. Local opt-in reminders are implemented, not remote push. No new academic material or AI API key was added.
- Native build/config/signing status and test boundaries are documented in `apps/mobile/README.md`. Exported native bundles are not signed installable applications. No store accounts or signing ownership were invented.
