# Misti’s Study Studio — native client

This is the first implemented Android/iPhone/iPad slice, not a finished port or a store release. It lives alongside the existing Next.js project and uses the live NEET Tracker backend. Vercel ignores this directory; the website’s dependency graph is unchanged.

## Implemented

- React Native / Expo SDK 57 client with ink, cream and gold styling, locally bundled Inter/Playfair fonts, reduced-motion-aware transitions, safe areas, phone bottom navigation and wide-iPad side navigation.
- Existing account sign-in. Native `expo/fetch` reads the same revocable trusted-device cookie, stores only the token in SecureStore, and sends it only to the fixed first-party HTTPS API. Passwords, database credentials and AI keys are not persisted or bundled. Browser preview intentionally cannot authenticate or save a native session.
- Today: real saved totals, syllabus completion and labelled 14-day study-hour history. Unlogged days remain unknown instead of becoming zero study.
- Subjects: all four subjects from the API, chapter/topic search, class filtering, completion and question/revision counts. Chapter-only question totals are not doubled across ambiguous class names. Editing remains a labelled website handoff.
- Todo: current shared board, completed filter, server-confirmed completion. Failed/uncertain writes require refresh before another change. No automatic retry, invented offline receipt or duplicate task creation.
- Device-local daily reminder: explicit permission request, Android channel, validated 24-hour time, scheduled-notification receipt, permission recheck when returning from Settings, cancellation, generic lock-screen copy and tap-to-Todo handling. It is not remote push or a cross-device scheduler.
- Explore: labelled browser handoffs to the rest of the website. Native voice is explicitly pending; this build does not request microphone access, ship personal recordings or fall back to another speaker.

## Run and verify

Run commands **inside `apps/mobile`** with Node 22.13+ (22.22 used for qualification):

```sh
npm ci
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo-doctor
npx expo export --platform all --max-workers 2
```

The Android/iOS exports are JavaScript/Hermes bundles, **not an APK/IPA**. Build an installed development client for real-device work:

```sh
npm run android
# Requires an installed Android SDK and JDK; not present on this workspace host.

npm run ios
# Requires macOS with Xcode.

# Alternatively, after the owner signs into an Expo account and links this app:
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
```

`eas.json` includes development, internal APK preview and production profiles. Expo project ownership, final store identifiers, Android signing, Apple team/certificates and device provisioning have not been configured. No account enrollment, paid build or store submission was initiated. Do not put signing credentials into Git.

The root script `scripts/check-mobile-preview.mjs` checks the exported sign-in screen at phone/iPad/wide sizes. These are real React Native Web screenshots, not images of a device and not proof of native keyboard or notification behaviour. `scripts/check-live-contract.mts` signs in normally and verifies the three read contracts against production, without modifying student records or printing tokens. The new trusted session is logged out afterward.

## Verification at this handoff

- Android, iOS and web bundle exports pass.
- Seven unit checks cover session parsing, first-party URL restrictions, degraded-data handling, matching save receipts, reminder time validation, chapter count/class scope and Xcode UUID compatibility.
- Expo Doctor: 18/18 checks; compatible SDK dependencies; native TypeScript/lint pass.
- Live read contracts pass for dashboard, subjects and tasks through Node HTTP. The actual Expo networking bridge has been inspected but still needs device qualification.
- Sign-in web rendering: 390×844, 820×1180 and 1440×1000, without overflow or browser exceptions. Authenticated native screens and hardware delivery remain unqualified.
- `npm audit` reports zero vulnerabilities after a **scoped** `xcode → uuid 11.1.1` override. Xcode uses `uuid.v4()`; a regression test verifies its 24-character project IDs. No broad forced Expo downgrade was used.

## Next implementation gates

1. Owner account/build signing, installed Android and iPad development clients; verify SecureStore session restart/expiry/logout, keyboard, large text, back navigation and reminder taps/denial/reboot.
2. Native task creation/editing with operation IDs, daily-log forms and per-subject allocations, checked topic/revision updates. Extend shared domain contracts rather than parse commands independently in each screen.
3. Native PDF downloads, chapter filenames and reviewed normalized-coordinate highlights; test offline reopen and storage cleanup.
4. Native exam engine/palette/results with durable attempt snapshots and explicit conflict recovery.
5. Foreground voice recognition, reviewed local action registry and authenticated private cloned clips at 1×. Background wake and arbitrary cloned speech are separate feasibility gates, not current capabilities.
6. Native remote notifications require an opted-in device-token endpoint, delivery worker and APNs/FCM credentials. The current local reminder needs none of these. No delivery percentage is promised.

Primary implementation references: [Expo SDK 57](https://expo.dev/changelog/sdk-57), [Expo fetch](https://docs.expo.dev/versions/v57.0.0/sdk/expo/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
