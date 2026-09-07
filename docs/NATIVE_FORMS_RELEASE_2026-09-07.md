# Native forms — second implementation slice

## Scope

Native Today and Explore now open the daily-log editor. Todo supports native creation and editing. The existing website remains the authoritative backend; these screens do not introduce a second database or AI provider.

- Daily fields match the web form: hours/questions/intensity/notes per subject, discipline and completion scores, plus all ten screen-time categories and a screen-time note.
- Atomic save: selected daily entries and optional screen time commit together. Skipping omits a write and does not delete existing records. Explicit zero values may record a rest day. Chapter allocations and revisions are not inferred from these totals.
- Task edits preserve status and unrelated agent settings/history. Due dates are date-only values, independent of the server timezone.
- Review before save, retained in-memory drafts on failure, frozen same-request retry, matching receipt validation, stale-record conflict errors, explicit reload/discard choices, phone/tablet modal layouts, keyboard avoidance and reduced motion.

## Persistence and concurrency

`/api/native/workspace` is private, first-party-only and `no-store`. GET returns one consistent saved day; POST validates a bounded task/day payload. It does not replace the older web APIs.

`native_mutations` is an additive durable receipt table with a reserved per-account lock row. Receipts survive task deletion, so a retry never resurrects a deleted task. The same operation ID with different content is rejected. Receipt and academic write commit in one transaction.

The actual database is TiDB, not stock MySQL. A real transaction test rejected SERIALIZABLE. The implementation uses supported READ COMMITTED with an account guard lock, unique operation receipts, and conditional `updatedAt` writes. See [TiDB transaction isolation](https://docs.pingcap.com/tidb/stable/dev-guide-transaction-overview/) and [Prisma v6 concurrency control](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).

The narrowly scoped migration was applied using `scripts/apply-native-receipts.mjs --apply`, then the table shape was checked. No historical migrations, schema resets or academic data backfills were run. This repository’s earlier manually applied migrations have no migration lock file; the helper intentionally does not bulk-run that history. Keep this applied SQL immutable.

## Verification

- Root unit suite: 58 passing checks at initial qualification.
- Native unit suite: 11 passing checks, including malformed inputs, missing versions and exact receipts.
- Seven real-database transaction checks passed: repeated task creation, changed-payload ID reuse, stale task updates, retries after deletion, daily replay, partial-batch rollback and missing-version conflict. Every fixture was rolled back; no QA student records were committed.
- React Native Web fixture UI: daily and task review/save flows passed at 390×844, 820×1180 and 1440×1000, with no horizontal overflow or browser exceptions. Screenshots under `output/mobile-qa`. These are **not physical device screenshots or microphone/keyboard qualification**.
- Production Next.js build passed; Android/iOS/web Expo bundles exported. Subsequent final qualification and deployment receipts are appended below.

## Remaining app work

No APK/IPA or store release is claimed. Installed-device qualification and owner-controlled Expo/signing/Apple provisioning remain necessary. Native PDF reader/downloads/highlights, the full exam engine, chapter/revision editing, cloned-voice action integration, remote APNs/FCM delivery and durable offline drafts remain separate unfinished slices. Local reminders already exist; they are not remote push. No substitute voice or external AI key was added.

To reproduce the isolated form screenshots: temporarily switch `apps/mobile/index.ts` to import `./qa/FormsPreview`, export web into `output/mobile-forms-preview`, restore the production `./src/App` entry, then run `scripts/check-native-forms-preview.mjs`. The fixture entry is not imported by the production app and never uses real account data.
