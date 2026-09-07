type Block = { start: string; end: string; subject: string; kind: string };
const minutes = (value: string) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};
export function scheduleTotals(schedule: Block[]) {
  let study = 0, bio = 0, pc = 0, revision = 0;
  for (const block of schedule) {
    if (block.kind === "BREAK" || block.subject === "Break") continue;
    const start = minutes(block.start), end = minutes(block.end);
    if (start === null || end === null || end <= start) continue;
    const duration = end - start;
    study += duration;
    if (block.kind === "REVISION") revision += duration;
    if (["Botany", "Zoology"].includes(block.subject)) bio += duration;
    else if (["Physics", "Chemistry"].includes(block.subject)) pc += duration;
    else { bio += duration / 2; pc += duration / 2; }
  }
  const hours = (value: number) => Math.round(value / 6) / 10;
  return { studyHours: hours(study), biologyHours: hours(bio), physicsChemistryHours: hours(pc), revisionHours: hours(revision) };
}
export function scheduleSummary(totals: ReturnType<typeof scheduleTotals>) {
  return `${totals.studyHours} hours planned: ${totals.biologyHours}h Biology and ${totals.physicsChemistryHours}h Physics + Chemistry, including ${totals.revisionHours}h revision. Breaks are separate; mixed blocks are split equally between the two streams.`;
}
