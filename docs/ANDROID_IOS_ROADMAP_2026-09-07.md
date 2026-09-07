# NEET Tracker — Android, iPhone and iPad roadmap

Prepared 7 September 2026. This is a proposed migration plan, not a claim that native apps have been built or that every requested website feature is complete.

Implementation has now started: the first native client is in `apps/mobile`, with actual status and verification in its README. The phases below remain the wider roadmap; they are not all complete.

## Recommendation

Keep the current Next.js website, Vercel backend and Prisma/MySQL records. Add one TypeScript React Native application for Android and iOS, using Expo development builds. Share tested domain logic and API contracts; build device-appropriate native screens. Do not move student records into a disconnected app database or ship server credentials inside the app.

This recommendation prioritizes native navigation, audio lifecycle control, accessible touch interactions and iPad layouts. It requires a real frontend migration: current HTML, CSS, browser speech hooks, PDF.js and web chart components cannot simply become native components. Expo development builds support native libraries and custom native code, unlike the limited Expo Go playground. [Expo workflow](https://docs.expo.dev/workflow/overview/).

A WebView/Capacitor shell remains a possible faster intermediate delivery if speed becomes the primary constraint, but is not the recommended final experience for this project. Apple asks for utility and UI beyond a repackaged website; approval is never guaranteed by a framework choice. [Apple review guidelines, section 4.2](https://developer.apple.com/app-store/review/guidelines/).

## What stays, what changes

| Layer | Reuse | Native work required |
| --- | --- | --- |
| Student data | Existing account, chapters, topics, questions solved, revisions, daily logs, tests, Todo and cycle history | Mobile-safe authentication, sync receipts and conflict handling |
| Server | Existing database and service behavior | Stable versioned API contracts, validation, consistent error/receipt shapes and user-scoped authorization |
| Learning logic | Scoring, syllabus IDs, aliases, typed action plans, dates and validation where platform-independent | Extract from browser/server-coupled modules; regression tests across clients |
| Visual identity | Ink/cream/antique-gold tokens, fonts, subject colors, original icon language | Native components, gestures, safe areas, keyboard behavior, native charts and tablet layouts |
| Reader | Authorized files, chapter titles, provenance and reviewed question links | Download management, native PDF rendering, zoom/text selection and normalized highlight coordinates |
| Voice | Action vocabulary, confirmation rules, existing private cloned clips | Native microphone/session handling, speech recognition adapters, wake detector feasibility, interruption recovery |

## Phase 0 — close the website release gates

Before declaring feature parity, make a route-by-route acceptance list and finish the known gaps:

- Practice Arena landing, palette, results and interruption/resume checks. Preserve class 11/12 PCB sectional tests and independent custom selections.
- Reconcile Study Planner narrative hours with the actual generated schedule.
- Review educational provenance, answer correctness, question-bank availability and NCERT passage links. A polished reader does not make an automatically matched passage a verified historical source.
- Test the complete voice action/confirmation/undo matrix. Do not describe fixed cloned clips as arbitrary dynamic cloned speech.
- Audit user scoping, queued writes and multi-device conflicts before enabling broad offline mutations.

Exit gate: every existing route has a named owner, a feature checklist, expected errors and passing critical-flow tests. Outstanding educational or hardware-dependent work remains visibly marked, not treated as completed by a UI refresh.

## Phase 1 — shared data and native foundation

1. Keep the web app running. Add the mobile client alongside it only after approving this roadmap; do not relocate the live repository as an incidental setup step.
2. Extract shared domain types, validation and command plans into platform-independent modules. Prisma remains server-only.
3. Add a mobile authentication/session contract: short-lived access, revocable refresh sessions, device logout and secure credential storage. Keep web cookies working. Neither database passwords nor privileged provider keys belong in a mobile bundle.
4. Store small credentials in native secure storage; use an appropriate encrypted local database for offline study records. SecureStore uses Android Keystore-backed encryption and iOS Keychain, but is not the sole source of truth for irreplaceable data. [SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/).
5. Establish development, beta and production environments. Use synthetic accounts for destructive/retry tests.
6. Add a per-operation ID, server receipt and revision/version to mutable records. Enforce increments and confirmations on the server, not only in the assistant UI.

Exit gate: sign in on web and mobile, see the same records, revoke a mobile session, and complete a tested write without exposing credentials or duplicating data.

## Phase 2 — native design system and core screens

The proposed navigation is Today, Study, Practice, Plan and More, with a consistent assistant entry. Keep global search readily accessible without a floating card obscuring content.

- Phones: single-column task-first screens, comfortable touch targets, compact headers, optional details, bottom sheets and correctly inset keyboards.
- iPad: two-pane subject/reader/workbench layouts where useful; support portrait, landscape, split-screen and keyboard navigation. Do not stretch a phone screen across the whole tablet.
- Motion: subtle transitions for navigation, state changes and progress. The assistant may use richer GPU animation, but must scale down and stop when hidden. Honor reduced-motion settings.
- Charts: labelled axes and units, comparable periods, exact-value views, explicit missing data and a short explanation of what each comparison means.
- Voice mode: pastel pink for student input, pastel blue for playback, minimal visible text, no keyboard composer until Text mode is selected. Never display simulated audio reactivity as a live microphone signal.

Port Dashboard, all four subject workbenches, topic/chapter editing, Daily Goals, Todo and Study Planner first. Keep original record IDs and totals.

Exit gate: native usability checks and feature-by-feature comparison pass on Samsung M12 and iPad 10th generation, not just a desktop simulator.

## Phase 3 — complete learning-tool parity

| Workspace | Required native behavior |
| --- | --- |
| Practice Arena | Sectional/custom/full tests, timer, palette/review states, bookmarked questions, resume and exact scoring |
| Test journal and errors | Logging/editing, analysis, linked mistakes, retained drafts and confirmed deletion |
| PYQ | Search/filter, year progress, sourced diagrams/formulas, attempt feedback and test launch |
| NCERT reader | Chapter-named downloads, page memory, zoom/selection, reviewed pastel highlights, multi-question panels and explanations |
| Reviews and insights | Existing records, honest charts, Rank Predictor assumptions and clearly identified online features |
| Mood and Cycle Planner | Private logs, optional fields, meaningful estimates, secure sync and explicit consent before any external processing |
| Search and notifications | Every supported destination, deep links to the actual record, correct back navigation and permission recovery |

Native PDF rendering and annotation need a focused prototype before choosing a dependency. Verify text selection, page rotation, zoom, highlight alignment, memory use, file licensing and offline storage. Avoid rasterizing an entire book into memory. Keep the reviewed-link gate intact.

Exit gate: a parity matrix has no silently missing critical feature. Missing historical content remains explicitly unavailable; it is not filled with generated questions.

## Phase 4 — reliable voice assistant without a required external AI key

Implement a shared validated action system beneath both global voice and Daily Goals. Recognition produces a proposed intent; it does not directly mutate the database.

1. Use native microphone and speech recognition adapters, capability checks and clear permission recovery. Prefer on-device recognition when the actual device/language supports it. No required AI key does not automatically mean all OS speech recognition is offline: Android documents that its default recognizer may use remote servers and is not intended for continuous recognition. [Android SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer).
2. Benchmark a small local wake-word detector separately from full transcription. Start with an explicitly enabled foreground session. Do not promise Siri-like locked-screen/background listening: background execution is constrained by OS and store rules. Consider App Intents/Shortcuts for supported system entry points instead of abusing background audio. [Apple guidelines, section 2.5.4](https://developer.apple.com/app-store/review/guidelines/), [App Intents](https://developer.apple.com/documentation/appintents).
3. Resolve page names, chapter IDs, aliases and existing topics using the real syllabus and action registry. “NLM” and “Newton’s laws of motion” should resolve to the same entity; ambiguous matches must ask, not guess.
4. Execute multi-step requests as visible, cancellable plans. Read/navigation actions can be immediate; consequential updates receive a concise review. Use receipts, idempotency and undo where genuinely supported.
5. Daily Goals should accept multiple fields in one answer and ask only for missing or ambiguous details. If 45 questions are attributed only to Botany, ask which chapters and how to split them. Never distribute counts arbitrarily or double-count subject totals and chapter totals. Tomorrow’s tasks belong in Todo. A two-minute target is a usability goal, not a forced speaking deadline.
6. Memory should be explicit and editable: preferred names, study preferences and confirmed facts, with delete controls. Study totals must come from records, not conversational recollection. Proactive revision/test suggestions remain suggestions until accepted.
7. Continue the existing cloned clips at 1×, with no automatic switch to a female/system voice. Dynamic responses in the user’s cloned voice are a separate technical feasibility gate: evaluate a legally usable self-hosted/on-device model, quality, latency, licensing and thermal/memory behavior. The current clips cannot synthesize arbitrary sentences. Benchmark before selecting a model or promising operation on Samsung M12.
8. Core navigation/logging does not need an LLM. For broader explanatory features, choose reviewed retrieval or an explicitly configured self-hosted model; retrieval does not eliminate hallucinations. Existing online Guru features must remain honestly labelled or be deliberately replaced, not silently relabelled “offline.”

Exit gate: a reproducible voice corpus covering all registered actions, aliases, noise, silence, repeated wake cycles, app minimization, denied permissions, playback interruption and duplicated requests passes on the target devices. Report measured recognition/task-success rates, not an invented 99% claim.

## Phase 5 — offline behavior, polish and device qualification

- Download authorized chapters and selected question packs with version/checksum metadata, storage controls and a clear removal action.
- Save local drafts and test answers transactionally. A durable outbox retains operation IDs across restarts, retries safely and shows conflicts instead of silently overwriting a newer device's work.
- Use OS notifications for requested reminders; treat permission denial and time-zone changes as normal states. Do not rely on JavaScript timers to wake a closed application.
- Validate exam resume after process death, slow networks, airplane mode, calls, audio route changes, storage pressure and expired authentication.
- Profile startup, scroll/frame time, PDF memory, battery/heat and speech latency. Use the M12 as the low-end acceptance device; add Narzo 70 Turbo and both iPads. Test VoiceOver/TalkBack, large text, contrast and reduced motion.
- Protect private cycle and voice data; avoid including transcripts or health notes in analytics/crash logs. Provide appropriate account/data deletion and content/privacy disclosures for the chosen distribution scope.

Exit gate: no known data-loss or incorrect-score blocker; native crash/resume tests pass; feature parity and performance targets are measured on real hardware.

## Phase 6 — beta distribution and store release

First deliver an Android test build and an iOS/iPadOS beta, gather actual use feedback, then decide between private distribution and a public product. A personal-only app and a public NEET platform need different account, content-rights, onboarding and privacy arrangements.

EAS can build Android and iOS binaries in the cloud, which fits development from the Windows laptop; native iOS troubleshooting may still require access to macOS/Xcode. Store developer accounts and signing are separate from AI API keys. Obtain these in the user's own accounts, and do not purchase or enroll without approval. [EAS Build](https://docs.expo.dev/build/introduction/), [build/account prerequisites](https://docs.expo.dev/build/setup/).

Use staged releases, beta channels, migration compatibility and rollback plans. Never force an update while an exam or unsynced log is active. Recheck current store privacy, account-deletion, content and review requirements before submission. App-store approval and review timing cannot be guaranteed.

## Recommended first mobile milestone

Build a real-device vertical slice: sign in → open Physics → add a confirmed question/revision update by voice → see the same result on the website → open a downloaded chapter → restart offline without losing the draft. Include the native assistant animation and iPad split layout in this slice.

This milestone exposes the main risks before rebuilding every screen. Set the full delivery schedule after this prototype and the voice/PDF benchmarks; do not estimate a production-quality two-platform, offline-capable voice product as a one-click website conversion.
