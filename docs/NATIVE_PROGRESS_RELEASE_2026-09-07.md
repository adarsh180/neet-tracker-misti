# Native topic progress — third implementation slice

## Delivered scope

In the native client: **Subjects → subject → chapter → Update topic progress**.

- Select existing topics in the inspected class/chapter; enter new question counts per topic.
- Keep, complete or reopen completion status. Already-completed topics are omitted from a completion-only batch.
- Explicitly confirm an end-to-end revision before adding one revision to each selected topic.
- Review old → new question and revision totals before saving. Optional notes are retained, including notes accompanying a reopened completion status.
- Keep Daily Goals totals separate, avoiding a second addition of the same study questions or hours. No implicit allocation or generated academic data.
- Use the existing ink/cream/subject-color native design, safe-area modal, keyboard avoidance, reduced motion and scrollable phone/tablet review.

## Integrity and integration

The shared private `/api/native/workspace` POST accepts a bounded `progress` payload in addition to the existing task/day kinds. No schema migration or dependency addition is needed for this slice.

Every entry includes the original topic/subject/class/chapter IDs and values, timestamp, completion state, question total and revision count. All entries are validated before writes. Selected topic rows are locked, conditional updates add question deltas, and the existing per-account transaction and durable `NativeMutation` receipt prevent replayed saves from adding a second revision or increment. Moved/deleted/stale topics return a conflict rather than silently rebasing the draft.

Multi-topic full revisions share a session per exact subject/class/chapter group. Revision children retain each topic's history. A subset of a chapter is marked partial at session level even though the individually selected topics were revised fully. A single-topic session keeps its explicit topic ID. Null-chapter topics are not incorrectly combined into one chapter. Existing website aggregates still identify legacy sessions by chapter name; the schema has no session class column, so cross-class session summaries with identical chapter names remain a separate web data-model limitation.

Topic-linked `StudyActivity` entries preserve the selected topic and question delta. Daily log totals remain unchanged, and the subject API's chapter-only aggregate does not count these topic-linked deltas twice.

A failed/uncertain save freezes its original operation ID and payload for an exact retry. Leaving prompts for confirmation and refreshes after an attempted save. Drafts are in memory, not durable offline storage. Native review receipts must match every saved topic, class, question total, completion state and revision count.

## Verification

- Root unit suite: 59 passed.
- Native unit suite: 15 passed, including explicit revision, missing versions, invalid question additions, scope/receipt mismatches and no-op bulk completion filtering.
- Twelve real TiDB transaction checks passed, including single/grouped revision replay, stale/wrong-class rejection, full versus partial chapter coverage, class-separated sessions and reopened-topic note preservation. All fixtures were rolled back; no QA academic records were committed.
- Native form browser QA: daily/task/progress flows passed at 390×844, 820×1180 and 1440×1000. Progress includes a simulated failed request followed by an identical-payload retry. No horizontal overflow or browser exceptions; screenshots under `output/mobile-qa/native-progress-review-*.png`.
- Root targeted lint and Next.js production build passed. Native TypeScript/lint and final Android/iOS/web exports passed.
- Expo Doctor passed 18/18 checks and the SDK dependency compatibility check passed.
- Release checks now verify that an empty progress request is rejected by the new validator, without making a live academic write. Native live read qualification also validates every returned topic's review inputs.

These screenshots are rendered React Native Web fixtures, not hardware screenshots. Android/iOS exports are JavaScript/Hermes bundles, not signed APK/IPA files. Real keyboard, networking and device lifecycle qualification remains necessary.

## Remaining native work

Structural chapter/topic creation and renaming, standalone partial-revision notes, combined daily-log/chapter allocation review, durable encrypted drafts, PDF downloads/reader/highlights, native exams, voice actions with authenticated private cloned clips, remote APNs/FCM notifications and signed-device/store qualification remain unfinished. Existing local daily reminders and labelled website handoffs are retained. No external AI key or substitute voice was introduced.

## Release receipt

- Runtime/native source: `f4a1906`, pushed to `codex/study-studio-release-20260906`.
- Vercel deployment: `dpl_4ScBXnrVC6NSwctpixNndt9vVpjR`, READY, explicitly promoted only after candidate verification passed.
- Public site: https://neet-tracker-misti.vercel.app
- Immutable candidate: https://neet-tracker-misti-qcm12yvb4-adarsh180s-projects.vercel.app
- Candidate and public checks passed: sign-in, private day reads/no-store, invalid task/progress rejection, existing protected API/page reads, PDF worker, private cloned audio (unauthenticated 401, authenticated 200 / 45,837 bytes, range playback 206). Verification sessions were logged out.
- Post-promotion native live contracts passed for dashboard, every editable topic, editable tasks and today's daily log through Node HTTP, with no production academic writes.
- Rollback target: `dpl_B6EJsrWR1wt2ue3X9PWYhMMDRr6c` (runtime source `c610c77`). There is no new schema migration to reverse; preserve durable receipt history.
- Private cloned clips stayed out of Git and were included only through the existing local Vercel deployment packaging. Native source is in GitHub; no APK/IPA or native store publication occurred.
- Documentation-only follow-up records verification and the owner's confirmation that Expo/Apple accounts are not yet available; it does not require another runtime deployment.
