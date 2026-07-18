import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function* jsonLines(filePath) {
  for await (const line of createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity })) {
    if (line) yield JSON.parse(line);
  }
}

async function loadById(filePath) {
  const rows = new Map();
  for await (const row of jsonLines(filePath)) rows.set(String(row.canonicalId), row);
  return rows;
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain");
}

async function close(stream) {
  stream.end();
  await once(stream, "finish");
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function optionMap(options) {
  const map = new Map();
  for (let index = 0; index < options.length; index += 1) {
    const key = normalize(options[index]);
    if (!key || map.has(key)) return null;
    map.set(key, index);
  }
  return map;
}

function stableHash(question, options) {
  return createHash("sha256").update(`${normalize(question)}\n${options.map(normalize).join("\n")}`).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.variants || !args.representatives || !args.approved) throw new Error("--variants, --representatives and --approved are required");
  const variantsPath = path.resolve(String(args.variants));
  const representativesPath = path.resolve(String(args.representatives));
  const approvedPath = path.resolve(String(args.approved));
  const outputDir = path.resolve(String(args.out || path.join(path.dirname(approvedPath), "verified-variants")));
  await mkdir(outputDir, { recursive: true });

  const [representatives, approved] = await Promise.all([loadById(representativesPath), loadById(approvedPath)]);
  const safeStream = createWriteStream(path.join(outputDir, "strict-derived-variants.jsonl"), { encoding: "utf8" });
  const reviewStream = createWriteStream(path.join(outputDir, "variant-review-source.jsonl"), { encoding: "utf8" });
  const counts = { variants: 0, strictDerived: 0, representativeNotApproved: 0, representativeMissing: 0, stemDifferent: 0, optionSetDifferent: 0, sourceKeyConflict: 0, malformedOptions: 0 };

  for await (const variant of jsonLines(variantsPath)) {
    counts.variants += 1;
    const representativeId = String(variant.readiness?.representativeId ?? "");
    const representative = representatives.get(representativeId);
    const verified = approved.get(representativeId);
    let reason = null;
    if (!representative) {
      counts.representativeMissing += 1;
      reason = "REPRESENTATIVE_MISSING";
    } else if (!verified) {
      counts.representativeNotApproved += 1;
      reason = "REPRESENTATIVE_NOT_STRICT_APPROVED";
    } else if (normalize(variant.question) !== normalize(representative.question)) {
      counts.stemDifferent += 1;
      reason = "STEM_DIFFERS_FROM_REPRESENTATIVE";
    } else {
      const variantMap = optionMap(variant.options ?? []);
      const representativeMap = optionMap(representative.options ?? []);
      const verifiedMap = optionMap(verified.options ?? []);
      if (!variantMap || !representativeMap || !verifiedMap || variantMap.size !== 4 || representativeMap.size !== 4 || verifiedMap.size !== 4) {
        counts.malformedOptions += 1;
        reason = "MALFORMED_OR_DUPLICATE_OPTIONS";
      } else {
        const variantKeys = [...variantMap.keys()].sort();
        const representativeKeys = [...representativeMap.keys()].sort();
        const verifiedKeys = [...verifiedMap.keys()].sort();
        if (JSON.stringify(variantKeys) !== JSON.stringify(representativeKeys) || JSON.stringify(variantKeys) !== JSON.stringify(verifiedKeys)) {
          counts.optionSetDifferent += 1;
          reason = "OPTION_SET_DIFFERS_FROM_VERIFIED_REPRESENTATIVE";
        } else {
          const verifiedCorrect = normalize(verified.options[verified.correctIndex]);
          const sourceCorrect = normalize(variant.options[variant.correctIndex]);
          const correctIndex = variantMap.get(verifiedCorrect);
          if (sourceCorrect !== verifiedCorrect || !Number.isInteger(correctIndex)) {
            counts.sourceKeyConflict += 1;
            reason = "SOURCE_KEY_CONFLICTS_WITH_VERIFIED_REPRESENTATIVE";
          } else {
            const optionExplanations = variant.options.map((option) => {
              const verifiedIndex = verifiedMap.get(normalize(option));
              return verified.optionExplanations[verifiedIndex];
            });
            counts.strictDerived += 1;
            await writeLine(safeStream, {
              ...variant,
              contentHash: stableHash(verified.question, variant.options),
              question: verified.question,
              correctIndex,
              correctOption: variant.options[correctIndex],
              explanation: verified.explanation,
              optionExplanations,
              difficulty: verified.difficulty ?? variant.difficulty,
              verification: {
                status: "STRICT_DERIVED_OPTION_PERMUTATION",
                representativeId,
                representativeVerification: verified.verification,
                sourceKeyAgreement: true,
              },
            });
          }
        }
      }
    }
    if (reason) await writeLine(reviewStream, { reason, representativeId, variant });
  }

  await Promise.all([close(safeStream), close(reviewStream)]);
  const report = {
    generatedAt: new Date().toISOString(),
    variantsPath,
    representativesPath,
    approvedPath,
    outputDir,
    counts,
    policy: {
      originalRowsDeleted: false,
      strictPropagationRequiresApprovedRepresentative: true,
      strictPropagationLimitedToIdenticalStemAndOptionSet: true,
      numericalOrParaphrasedVariantsRequireIndependentReview: true,
    },
    databaseWrites: 0,
  };
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
