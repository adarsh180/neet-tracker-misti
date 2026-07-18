# Automated question-bank factory

This project treats `VERIFIED_STRICT` as an automated quality label, never as a claim of human review.

## Admission standard

Every new original question must pass:

1. deterministic structure, duplicate-option, encoding, syllabus-scope, and visual-asset checks;
2. two independent blind solvers that agree confidently on one answer;
3. a separate assessment critic checking ambiguity, syllabus alignment, difficulty, explanation accuracy, distractor quality, and all four option rationales.

Failed rows are excluded from practice tests. Runtime test generation is disabled; a test is released only when the strict bank can fill its exact subject/class/chapter scope.

## Resumable commands

Upgrade existing rows in bounded batches:

```powershell
npm run bank:upgrade-v2 -- --limit 1000 --batch 6
```

Grow the serveable strict bank toward 300,000 accepted rows. Repeat the bounded run until the target is reached. Quarantined legacy rows remain for audit history and do not count toward this target:

```powershell
npm run bank:fill -- --all --target-strict 300000 --batch 8 --time-budget-minutes 60
```

Grow the verified diagram/graph inventory toward 5,000 (use `--target 10000` after reviewing coverage):

```powershell
npm run bank:visual-fill -- --target 5000 --batch 4 --time-budget-minutes 60
```

Import an official PYQ paper only from a provenance manifest containing official NTA URLs, SHA-256 hashes, independent extraction consensus, official-key confirmation, paper code, and question numbers:

```powershell
npm run pyq:import-official -- .\path\to\verified-manifest.json
```

Benchmark strict 180-question assembly:

```powershell
npm run bank:benchmark
```

## Operational estimate

Live single-item checks on 18 July 2026 took roughly 40 seconds for a legacy upgrade, 107 seconds for a new text question, and 141 seconds for a new accepted visual item. Batching amortizes much of that latency, but retries, model quotas, and strict rejection remain material.

A realistic unattended window for upgrading the old bank and producing roughly 187,000 additional accepted rows is several weeks on one worker. Carefully partitioned subject workers can reduce wall-clock time, subject to model quota and cost. Do not weaken the gates just to hit a row count.

## Release checks

- `npx prisma migrate status`
- `npx tsc --noEmit`
- `npm run build`
- `npm run bank:benchmark`
- `npm audit --omit=dev`

PYQ years remain locked in the UI until a complete paper has official provenance and at least 180 serveable rows. Visual questions remain unserveable until their actual SVG/graphic is present.
