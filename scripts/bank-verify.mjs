import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "node",
    target: "ES2020",
  },
});

const { verifyUnverifiedBankQuestions } = require("../src/lib/question-bank.ts");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const limit = args.limit ? Number(args.limit) : 8;
const result = await verifyUnverifiedBankQuestions(limit);

console.log(`checked=${result.checked} verified=${result.verified} deleted=${result.deleted.length}`);
for (const row of result.deleted) {
  console.log(`deleted\t${row.id}\t${row.subject}\t${row.chapter}\t${row.question.slice(0, 90).replace(/\s+/g, " ")}`);
}
