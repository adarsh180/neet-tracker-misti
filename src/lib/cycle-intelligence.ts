import { addDays, differenceInCalendarDays, isWithinInterval } from "date-fns";
import { db } from "@/lib/db";

// India Standard Time offset (no DST). Cycle dates live in date-only (@db.Date)
// columns that Prisma reads back as UTC midnight, so day keys are derived from
// the UTC date. "Today", however, must reflect the user's local (IST) calendar
// day so the model never treats the early-morning hours as the previous day.
const IST_OFFSET_MS = 330 * 60 * 1000;

type CycleRow = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  flowLevel: string;
  symptoms: string | null;
  mood: string | null;
  notes: string | null;
  dayDetails: unknown | null;
  createdAt: Date;
};

type MoodRow = {
  id: string;
  date: Date;
  mood: string;
  energy: number;
  focus: number;
  stress: number;
  note: string | null;
};

export type CyclePhase = "menstrual" | "follicular" | "ovulatory" | "luteal" | "late" | "unknown";

export type CalendarDayKind =
  | "logged-period"
  | "predicted-period"
  | "pms-window"
  | "fertile-window"
  | "ovulation-window"
  | "mood"
  | "today";

export type CycleCalendarDay = {
  date: string;
  dayOfCycle: number | null;
  phase: CyclePhase;
  kinds: CalendarDayKind[];
  flowLevel?: string | null;
  symptoms?: string | null;
  periodDayDetail?: PeriodDayDetail | null;
  cycleEntryId?: string | null;
  mood?: {
    mood: string;
    energy: number;
    focus: number;
    stress: number;
    note: string | null;
  } | null;
};

export type PeriodDayDetail = {
  day: number;
  date: string | null;
  flowLevel: string | null;
  pain: number | null;
  energy: number | null;
  mood: string | null;
  symptoms: string[];
  notes: string | null;
};

export type CycleIntelligence = {
  generatedAt: string;
  currentPhase: CyclePhase;
  dayOfCycle: number | null;
  lastPeriodStart: string | null;
  lastPeriodEnd: string | null;
  predictedStart: string | null;
  predictedWindowStart: string | null;
  predictedWindowEnd: string | null;
  pmsWindowStart: string | null;
  pmsWindowEnd: string | null;
  ovulationWindowStart: string | null;
  ovulationWindowEnd: string | null;
  fertileWindowStart: string | null;
  fertileWindowEnd: string | null;
  expectedPeriodLength: number;
  averageCycleLength: number;
  cycleVariability: number;
  cycleLengths: number[];
  confidence: number;
  confidenceLabel: "Very low" | "Low" | "Medium" | "High";
  status: "needs_more_data" | "learning" | "ready" | "overdue";
  daysUntilPredictedStart: number | null;
  overdueDays: number | null;
  evidence: {
    cycleCount: number;
    completedCycleCount: number;
    moodEntriesMapped: number;
    periodDayDetailCount: number;
    ignoredOutliers: number[];
    recentTrendDays: number;
    accuracyMeanErrorDays: number | null;
    dataNeeded: string[];
    method: string;
    privacy: string;
  };
  predictionQuality: {
    averageMissDays: number | null;
    backtestedCycles: number;
    ignoredOutliers: number[];
    recentTrendDays: number;
    modelBlend: string;
  };
  healthSignals: {
    cycleRegularity: "learning" | "regular" | "variable" | "irregular";
    periodLengthPattern: string;
    flowPattern: string;
    symptomBurden: "learning" | "low" | "moderate" | "high";
    averagePain: number | null;
    heavyFlowDaysAverage: number | null;
    detailDaysLogged: number;
    redFlags: string[];
    insight: string;
  };
  studySignals: {
    avgEnergy: number | null;
    avgFocus: number | null;
    avgStress: number | null;
    lowEnergyCycleDays: number[];
    highFocusCycleDays: number[];
    mostCommonSymptoms: string[];
    recommendationTone: "protect" | "balanced" | "push";
    cycleDayInsight: string;
  };
  logs: {
    id: string;
    startDate: string;
    endDate: string | null;
    flowLevel: string;
    symptoms: string | null;
    mood: string | null;
    notes: string | null;
    lengthFromPrevious: number | null;
    periodDays: number | null;
    dayDetails: PeriodDayDetail[];
  }[];
  calendar: CycleCalendarDay[];
};

function toDateKey(date: Date) {
  // Stored cycle dates come back as UTC midnight, so the UTC date is the exact
  // calendar day the user logged — independent of the server timezone.
  return date.toISOString().slice(0, 10);
}

function dateOnly(date: Date) {
  // Normalize any instant to UTC midnight of its calendar day so all day-level
  // math (addDays / diff / intervals) is stable on both UTC (Vercel) and local.
  return new Date(`${toDateKey(date)}T00:00:00.000Z`);
}

function istToday() {
  // Current calendar day in IST, anchored to UTC midnight to match stored dates.
  const istKey = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return new Date(`${istKey}T00:00:00.000Z`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function smoothedRecent(values: number[]) {
  if (!values.length) return 28;

  // Exponentially weighted moving average over chronological cycle lengths
  // (oldest -> newest). Recent cycles lead the estimate, but the geometric decay
  // dampens any single unusual cycle, producing a smoother month-to-month
  // forecast than a hard linear weighting that lets the newest value dominate.
  const alpha = 0.4;
  return values.reduce(
    (acc, value, index) => (index === 0 ? value : alpha * value + (1 - alpha) * acc),
    values[0],
  );
}

function variability(values: number[]) {
  if (values.length < 2) return values.length === 1 ? 3 : 5;
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  return Math.max(1, median(deviations) * 1.4826);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizePeriodDayDetails(value: unknown): PeriodDayDetail[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const day = typeof row.day === "number" ? row.day : Number(row.day);
      if (!Number.isFinite(day) || day < 1 || day > 12) return null;

      const symptoms = Array.isArray(row.symptoms)
        ? row.symptoms.filter((symptom): symptom is string => typeof symptom === "string").map((symptom) => symptom.trim()).filter(Boolean)
        : typeof row.symptoms === "string"
          ? row.symptoms.split(",").map((symptom) => symptom.trim()).filter(Boolean)
          : [];

      const pain = typeof row.pain === "number" ? row.pain : Number(row.pain);
      const energy = typeof row.energy === "number" ? row.energy : Number(row.energy);

      return {
        day: Math.round(day),
        date: typeof row.date === "string" && row.date ? row.date : null,
        flowLevel: typeof row.flowLevel === "string" && row.flowLevel ? row.flowLevel : null,
        pain: Number.isFinite(pain) ? clamp(Math.round(pain), 0, 10) : null,
        energy: Number.isFinite(energy) ? clamp(Math.round(energy), 1, 10) : null,
        mood: typeof row.mood === "string" && row.mood ? row.mood : null,
        symptoms: [...new Set(symptoms)].slice(0, 10),
        notes: typeof row.notes === "string" && row.notes ? row.notes.slice(0, 360) : null,
      };
    })
    .filter((item): item is PeriodDayDetail => Boolean(item))
    .sort((a, b) => a.day - b.day);
}

// Each cycle row is parsed for day details several times per request (calendar,
// health signals, logs). Cache by row reference so the JSON is normalized once.
const dayDetailCache = new WeakMap<object, PeriodDayDetail[]>();

function getDayDetails(entry: CycleRow) {
  const cached = dayDetailCache.get(entry);
  if (cached) return cached;
  const details = normalizePeriodDayDetails(entry.dayDetails);
  dayDetailCache.set(entry, details);
  return details;
}

function buildCycleModel(lengths: number[]) {
  const valid = lengths.filter((days) => days >= 15 && days <= 60);
  if (!valid.length) {
    return {
      usableLengths: [] as number[],
      ignoredOutliers: [] as number[],
      recentTrendDays: 0,
      predictedLength: 28,
      variation: 5,
    };
  }

  const center = median(valid);
  const spread = variability(valid);
  const outlierThreshold = Math.max(7, spread * 2.6);
  const usableLengths = valid.length >= 4 ? valid.filter((days) => Math.abs(days - center) <= outlierThreshold) : valid;
  const ignoredOutliers = valid.filter((days) => !usableLengths.includes(days));
  const modelLengths = usableLengths.length >= 2 ? usableLengths : valid;
  const recent = modelLengths.slice(-3);
  const earlier = modelLengths.slice(0, -3);
  const recentTrendDays = earlier.length >= 2 ? round1(clamp(average(recent) - average(earlier), -4, 4)) : 0;
  const weighted = smoothedRecent(modelLengths);
  const robustCenter = median(modelLengths);
  const recentCenter = median(recent);
  const blended = (weighted * 0.54) + (robustCenter * 0.28) + (recentCenter * 0.18) + (recentTrendDays * 0.25);

  return {
    usableLengths: modelLengths,
    ignoredOutliers,
    recentTrendDays,
    predictedLength: clamp(blended, 21, 45),
    variation: variability(modelLengths),
  };
}

function backtestPredictionAccuracy(ascEntries: CycleRow[]) {
  const errors: number[] = [];

  for (let targetIndex = 3; targetIndex < ascEntries.length; targetIndex += 1) {
    const trainingLengths = ascEntries
      .slice(1, targetIndex)
      .map((entry, index) => differenceInCalendarDays(dateOnly(entry.startDate), dateOnly(ascEntries[index].startDate)))
      .filter((days) => days >= 15 && days <= 60);

    if (trainingLengths.length < 2) continue;

    const previousStart = dateOnly(ascEntries[targetIndex - 1].startDate);
    const actualStart = dateOnly(ascEntries[targetIndex].startDate);
    const model = buildCycleModel(trainingLengths);
    const predictedStart = addDays(previousStart, Math.round(model.predictedLength));
    errors.push(Math.abs(differenceInCalendarDays(actualStart, predictedStart)));
  }

  const recentErrors = errors.slice(-8);
  return {
    errors: recentErrors,
    averageMissDays: recentErrors.length ? round1(average(recentErrors)) : null,
  };
}

function buildDataNeeded(input: {
  completedCycleCount: number;
  periodDayDetailCount: number;
  logsWithEndDate: number;
  backtestedCycles: number;
}) {
  const needed: string[] = [];
  if (input.completedCycleCount < 6) needed.push("Log at least 6 completed cycles for a steadier personal rhythm.");
  if (input.logsWithEndDate < 3) needed.push("Add end dates for at least 3 periods to learn real period length.");
  if (input.periodDayDetailCount < 12) needed.push("Add Day 1, Day 2, Day 3 flow/pain/energy details for richer health patterns.");
  if (input.backtestedCycles < 3) needed.push("More cycles are needed before the app can measure its own prediction accuracy.");
  return needed;
}

function confidenceLabel(confidence: number): CycleIntelligence["confidenceLabel"] {
  if (confidence >= 78) return "High";
  if (confidence >= 56) return "Medium";
  if (confidence >= 35) return "Low";
  return "Very low";
}

function buildConfidence(completedCycleCount: number, variation: number, averageMissDays: number | null, detailDays: number) {
  const dataScore = clamp(completedCycleCount / 8, 0, 1) * 72;
  const stabilityPenalty = clamp((variation - 2) * 5, 0, 30);
  const accuracyPenalty = averageMissDays === null ? 6 : clamp((averageMissDays - 2) * 5, 0, 24);
  const detailBonus = clamp(detailDays / 20, 0, 1) * 5;
  const confidence = Math.round(clamp(18 + dataScore + detailBonus - stabilityPenalty - accuracyPenalty, 18, 94));
  return confidence;
}

function splitSymptoms(entries: CycleRow[]) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const symptom of (entry.symptoms || "").split(",")) {
      const normalized = symptom.trim();
      if (!normalized || normalized.toLowerCase() === "none") continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([symptom]) => symptom);
}

function getExpectedPeriodLength(entries: CycleRow[]) {
  const durations = entries
    .filter((entry) => entry.endDate)
    .map((entry) => differenceInCalendarDays(dateOnly(entry.endDate!), dateOnly(entry.startDate)) + 1)
    .filter((days) => days >= 2 && days <= 10);

  return Math.round(clamp(median(durations) || 5, 3, 8));
}

function buildHealthSignals(input: {
  entries: CycleRow[];
  cycleLengths: number[];
  usableCycleLengths: number[];
  expectedPeriodLength: number;
  cycleVariability: number;
}): CycleIntelligence["healthSignals"] {
  const details = input.entries.flatMap(getDayDetails);
  const painValues = details.map((detail) => detail.pain).filter((pain): pain is number => typeof pain === "number");
  const heavyDays = details.filter((detail) => detail.flowLevel === "HEAVY").length;
  const periodsWithDetails = input.entries.filter((entry) => getDayDetails(entry).length > 0).length;
  const symptomMentions = details.reduce((sum, detail) => sum + detail.symptoms.filter((symptom) => symptom.toLowerCase() !== "none").length, 0);
  const avgPain = painValues.length ? round1(average(painValues)) : null;
  const heavyFlowDaysAverage = periodsWithDetails ? round1(heavyDays / periodsWithDetails) : null;

  let cycleRegularity: CycleIntelligence["healthSignals"]["cycleRegularity"] = "learning";
  if (input.usableCycleLengths.length >= 3) {
    cycleRegularity = input.cycleVariability <= 3 ? "regular" : input.cycleVariability <= 6 ? "variable" : "irregular";
  }

  let symptomBurden: CycleIntelligence["healthSignals"]["symptomBurden"] = "learning";
  if (details.length >= 3) {
    const burdenScore = (avgPain ?? 0) + (heavyFlowDaysAverage ?? 0) + symptomMentions / Math.max(1, periodsWithDetails);
    symptomBurden = burdenScore >= 10 ? "high" : burdenScore >= 5 ? "moderate" : "low";
  }

  const periodLengths = input.entries
    .filter((entry) => entry.endDate)
    .map((entry) => differenceInCalendarDays(dateOnly(entry.endDate!), dateOnly(entry.startDate)) + 1)
    .filter((days) => days > 0 && days <= 14);
  const redFlags: string[] = [];
  if (periodLengths.some((days) => days > 8)) redFlags.push("Periods longer than 8 days appear in the log.");
  if (periodLengths.some((days) => days < 2)) redFlags.push("Very short bleeding windows appear in the log.");
  if (input.cycleLengths.some((days) => days < 21 || days > 45)) redFlags.push("Some cycle lengths are outside the common 21-45 day range.");
  if ((avgPain ?? 0) >= 8) redFlags.push("Pain has averaged very high on logged period days.");
  if ((heavyFlowDaysAverage ?? 0) >= 2) redFlags.push("Heavy flow is appearing across multiple days per period.");

  const periodLengthPattern = periodLengths.length
    ? `${Math.round(median(periodLengths))} day median from ${periodLengths.length} logged end date${periodLengths.length === 1 ? "" : "s"}`
    : "Learning from future end dates";
  const flowPattern = details.length
    ? `${heavyFlowDaysAverage ?? 0} heavy day${heavyFlowDaysAverage === 1 ? "" : "s"} per detailed period on average`
    : "Add optional day-by-day flow for stronger pattern reading";

  const insight = redFlags.length
    ? "The model can guide study load, but these logged body signals deserve careful attention and clinical help if they feel severe, new, or disruptive."
    : details.length
      ? "Day-level details are now part of the intelligence layer, improving period length, workload, and wellness pattern analysis."
      : "Prediction is active, but day-level period details will make the wellness analysis more personal.";

  return {
    cycleRegularity,
    periodLengthPattern,
    flowPattern,
    symptomBurden,
    averagePain: avgPain,
    heavyFlowDaysAverage,
    detailDaysLogged: details.length,
    redFlags,
    insight,
  };
}

function findCycleForDate(date: Date, ascEntries: CycleRow[]) {
  let candidate: CycleRow | null = null;

  for (const entry of ascEntries) {
    if (dateOnly(entry.startDate) <= dateOnly(date)) candidate = entry;
    else break;
  }

  return candidate;
}

function inferPhase(input: {
  date: Date;
  lastStart: Date | null;
  periodEnd: Date | null;
  expectedPeriodLength: number;
  averageCycleLength: number;
  predictedStart: Date | null;
}): { phase: CyclePhase; dayOfCycle: number | null } {
  const { date, lastStart, periodEnd, expectedPeriodLength, averageCycleLength, predictedStart } = input;
  if (!lastStart) return { phase: "unknown", dayOfCycle: null };

  const dayOfCycle = differenceInCalendarDays(dateOnly(date), dateOnly(lastStart)) + 1;
  if (dayOfCycle < 1) return { phase: "unknown", dayOfCycle: null };

  const actualPeriodEnd = periodEnd ? dateOnly(periodEnd) : addDays(dateOnly(lastStart), expectedPeriodLength - 1);
  if (dateOnly(date) <= actualPeriodEnd) return { phase: "menstrual", dayOfCycle };

  if (predictedStart && dateOnly(date) > addDays(dateOnly(predictedStart), 2)) {
    return { phase: "late", dayOfCycle };
  }

  const ovulationDay = Math.round(averageCycleLength - 14);
  if (dayOfCycle >= ovulationDay - 1 && dayOfCycle <= ovulationDay + 1) {
    return { phase: "ovulatory", dayOfCycle };
  }

  if (dayOfCycle < ovulationDay - 1) return { phase: "follicular", dayOfCycle };
  return { phase: "luteal", dayOfCycle };
}

function describeCycleDayPattern(
  mapped: Array<{ dayOfCycle: number; energy: number; focus: number; stress: number }>,
): string {
  if (mapped.length < 6) {
    return "Log mood, energy, and focus across more cycle days to reveal how each phase affects study capacity.";
  }

  // Bucket mood logs into rough cycle weeks and score each by a focus + energy
  // composite (lighter stress is better). The strongest and weakest windows turn
  // her own history into an actionable "study hard here / protect there" signal.
  const buckets = [
    { label: "days 1–7", lo: 1, hi: 7, scores: [] as number[] },
    { label: "days 8–14", lo: 8, hi: 14, scores: [] as number[] },
    { label: "days 15–21", lo: 15, hi: 21, scores: [] as number[] },
    { label: "days 22+", lo: 22, hi: 99, scores: [] as number[] },
  ];

  for (const mood of mapped) {
    const composite = mood.focus + mood.energy - (mood.stress - 5);
    const bucket = buckets.find((item) => mood.dayOfCycle >= item.lo && mood.dayOfCycle <= item.hi);
    if (bucket) bucket.scores.push(composite);
  }

  const filled = buckets.filter((item) => item.scores.length >= 2).map((item) => ({ label: item.label, avg: average(item.scores) }));
  if (filled.length < 2) {
    return "A bit more day-by-day mood logging will surface clear focus and energy phases across her cycle.";
  }

  const best = filled.reduce((a, b) => (b.avg > a.avg ? b : a));
  const worst = filled.reduce((a, b) => (b.avg < a.avg ? b : a));
  if (Math.abs(best.avg - worst.avg) < 1.5) {
    return "Energy and focus look fairly steady across her cycle so far — keep the current rhythm.";
  }

  return `Focus and energy peak around ${best.label} and dip around ${worst.label}. Schedule the hardest study in the strong window and protect the dip with revision.`;
}

function buildStudySignals(moods: MoodRow[], ascEntries: CycleRow[], entries: CycleRow[]): CycleIntelligence["studySignals"] {
  const mapped = moods
    .map((mood) => {
      const cycle = findCycleForDate(mood.date, ascEntries);
      if (!cycle) return null;
      const dayOfCycle = differenceInCalendarDays(dateOnly(mood.date), dateOnly(cycle.startDate)) + 1;
      if (dayOfCycle < 1 || dayOfCycle > 60) return null;
      return { ...mood, dayOfCycle };
    })
    .filter((item): item is MoodRow & { dayOfCycle: number } => Boolean(item));

  const lowEnergyCycleDays = mapped
    .filter((mood) => mood.energy <= 4 || mood.focus <= 4 || mood.stress >= 8)
    .map((mood) => mood.dayOfCycle);

  const highFocusCycleDays = mapped
    .filter((mood) => mood.energy >= 7 && mood.focus >= 7 && mood.stress <= 5)
    .map((mood) => mood.dayOfCycle);

  const avgEnergy = mapped.length ? Math.round(average(mapped.map((mood) => mood.energy)) * 10) / 10 : null;
  const avgFocus = mapped.length ? Math.round(average(mapped.map((mood) => mood.focus)) * 10) / 10 : null;
  const avgStress = mapped.length ? Math.round(average(mapped.map((mood) => mood.stress)) * 10) / 10 : null;

  let recommendationTone: CycleIntelligence["studySignals"]["recommendationTone"] = "balanced";
  if ((avgEnergy ?? 6) <= 4 || (avgStress ?? 4) >= 8) recommendationTone = "protect";
  if ((avgEnergy ?? 0) >= 7 && (avgFocus ?? 0) >= 7 && (avgStress ?? 10) <= 5) recommendationTone = "push";

  return {
    avgEnergy,
    avgFocus,
    avgStress,
    lowEnergyCycleDays: [...new Set(lowEnergyCycleDays)].sort((a, b) => a - b).slice(0, 10),
    highFocusCycleDays: [...new Set(highFocusCycleDays)].sort((a, b) => a - b).slice(0, 10),
    mostCommonSymptoms: splitSymptoms(entries),
    recommendationTone,
    cycleDayInsight: describeCycleDayPattern(mapped),
  };
}

function addKind(kinds: CalendarDayKind[], kind: CalendarDayKind) {
  if (!kinds.includes(kind)) kinds.push(kind);
}

function buildCalendar(input: {
  today: Date;
  entries: CycleRow[];
  moods: MoodRow[];
  lastStart: Date | null;
  lastEnd: Date | null;
  expectedPeriodLength: number;
  averageCycleLength: number;
  predictedStart: Date | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  pmsStart: Date | null;
  pmsEnd: Date | null;
  ovulationStart: Date | null;
  ovulationEnd: Date | null;
  fertileStart: Date | null;
  fertileEnd: Date | null;
}) {
  const {
    today,
    entries,
    moods,
    lastStart,
    lastEnd,
    expectedPeriodLength,
    averageCycleLength,
    predictedStart,
    windowStart,
    windowEnd,
    pmsStart,
    pmsEnd,
    ovulationStart,
    ovulationEnd,
    fertileStart,
    fertileEnd,
  } = input;

  const start = addDays(dateOnly(today), -45);
  const end = addDays(dateOnly(today), 75);
  const moodByDate = new Map(moods.map((mood) => [toDateKey(mood.date), mood]));
  const days: CycleCalendarDay[] = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = toDateKey(cursor);
    const kinds: CalendarDayKind[] = [];
    const loggedEntry = entries.find((entry) => {
      const entryStart = dateOnly(entry.startDate);
      const entryEnd = entry.endDate ? dateOnly(entry.endDate) : addDays(entryStart, expectedPeriodLength - 1);
      return isWithinInterval(cursor, { start: entryStart, end: entryEnd });
    });
    const loggedDetail = loggedEntry
      ? getDayDetails(loggedEntry).find((detail) => detail.date === key || detail.day === differenceInCalendarDays(cursor, dateOnly(loggedEntry.startDate)) + 1)
      : null;
    const mood = moodByDate.get(key);

    if (loggedEntry) addKind(kinds, "logged-period");
    if (windowStart && windowEnd && isWithinInterval(cursor, { start: windowStart, end: windowEnd })) {
      addKind(kinds, "predicted-period");
    }
    if (pmsStart && pmsEnd && !loggedEntry && isWithinInterval(cursor, { start: pmsStart, end: pmsEnd })) {
      addKind(kinds, "pms-window");
    }
    if (fertileStart && fertileEnd && isWithinInterval(cursor, { start: fertileStart, end: fertileEnd })) {
      addKind(kinds, "fertile-window");
    }
    if (ovulationStart && ovulationEnd && isWithinInterval(cursor, { start: ovulationStart, end: ovulationEnd })) {
      addKind(kinds, "ovulation-window");
    }
    if (mood) addKind(kinds, "mood");
    if (key === toDateKey(today)) addKind(kinds, "today");

    const phase = inferPhase({
      date: cursor,
      lastStart,
      periodEnd: lastEnd,
      expectedPeriodLength,
      averageCycleLength,
      predictedStart,
    });

    days.push({
      date: key,
      dayOfCycle: phase.dayOfCycle,
      phase: phase.phase,
      kinds,
      flowLevel: loggedDetail?.flowLevel ?? loggedEntry?.flowLevel ?? null,
      symptoms: loggedDetail?.symptoms.length ? loggedDetail.symptoms.join(", ") : loggedEntry?.symptoms ?? null,
      periodDayDetail: loggedDetail ?? null,
      cycleEntryId: loggedEntry?.id ?? null,
      mood: mood
        ? {
            mood: mood.mood,
            energy: mood.energy,
            focus: mood.focus,
            stress: mood.stress,
            note: mood.note,
          }
        : null,
    });
  }

  return days;
}

export async function buildCycleIntelligence(userId: string): Promise<CycleIntelligence> {
  const [entriesDesc, moods] = await Promise.all([
    db.cycleEntry.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
    }),
    db.moodEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 180,
    }),
  ]);

  const entries = entriesDesc as CycleRow[];
  const ascEntries = [...entries].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const today = istToday();
  const last = entries[0] ?? null;

  const rawCycleLengths = ascEntries
    .slice(1)
    .map((entry, index) => differenceInCalendarDays(dateOnly(entry.startDate), dateOnly(ascEntries[index].startDate)))
    .filter((days) => days >= 15 && days <= 60);

  const model = buildCycleModel(rawCycleLengths);
  const completedCycleCount = rawCycleLengths.length;
  const averageCycleLength = Math.round(model.predictedLength);
  const cycleVariability = round1(model.variation);
  const expectedPeriodLength = getExpectedPeriodLength(entries);
  const backtest = backtestPredictionAccuracy(ascEntries);
  const periodDayDetailCount = entries.reduce((sum, entry) => sum + getDayDetails(entry).length, 0);
  const confidence = buildConfidence(completedCycleCount, cycleVariability, backtest.averageMissDays, periodDayDetailCount);
  const accuracyWindow = backtest.averageMissDays ?? 0;
  // Adaptive prediction window: combine her cycle variability with the model's own
  // measured miss-rate (added in quadrature so two small sources don't overstate
  // each other), plus a shrinking penalty for sparse history. As she logs more
  // cycles and the backtest error falls, the window tightens automatically.
  const sparsityPadding = completedCycleCount < 3 ? 3 : completedCycleCount < 6 ? 1.5 : 0;
  const combinedSpread = Math.sqrt(cycleVariability ** 2 + accuracyWindow ** 2) + sparsityPadding;
  const halfWindow = Math.round(clamp(Math.max(2, combinedSpread), 2, 9));

  const lastStart = last ? dateOnly(last.startDate) : null;
  const lastEnd = last?.endDate ? dateOnly(last.endDate) : lastStart ? addDays(lastStart, expectedPeriodLength - 1) : null;
  const predictedStart = lastStart ? addDays(lastStart, averageCycleLength) : null;
  const windowStart = predictedStart ? addDays(predictedStart, -halfWindow) : null;
  const windowEnd = predictedStart ? addDays(predictedStart, halfWindow) : null;
  // Luteal / PMS dip: the few days before the predicted start, when energy and
  // mood commonly drop. Surfaced as a "protect energy" band on the calendar.
  const pmsStart = predictedStart ? addDays(predictedStart, -4) : null;
  const pmsEnd = predictedStart ? addDays(predictedStart, -1) : null;
  const daysUntilPredictedStart = predictedStart ? differenceInCalendarDays(predictedStart, today) : null;
  const overdueDays = windowEnd && today > windowEnd ? differenceInCalendarDays(today, windowEnd) : null;
  const ovulationCenter = lastStart ? addDays(lastStart, Math.round(averageCycleLength - 14) - 1) : null;
  const ovulationStart = ovulationCenter ? addDays(ovulationCenter, -1) : null;
  const ovulationEnd = ovulationCenter ? addDays(ovulationCenter, 1) : null;
  const fertileStart = ovulationCenter ? addDays(ovulationCenter, -5) : null;
  const fertileEnd = ovulationCenter ? addDays(ovulationCenter, 1) : null;
  const current = inferPhase({
    date: today,
    lastStart,
    periodEnd: lastEnd,
    expectedPeriodLength,
    averageCycleLength,
    predictedStart,
  });

  const studySignals = buildStudySignals(moods as MoodRow[], ascEntries, entries);
  const healthSignals = buildHealthSignals({
    entries,
    cycleLengths: rawCycleLengths,
    usableCycleLengths: model.usableLengths,
    expectedPeriodLength,
    cycleVariability,
  });
  const dataNeeded = buildDataNeeded({
    completedCycleCount,
    periodDayDetailCount,
    logsWithEndDate: entries.filter((entry) => entry.endDate).length,
    backtestedCycles: backtest.errors.length,
  });
  const calendar = buildCalendar({
    today,
    entries,
    moods: moods as MoodRow[],
    lastStart,
    lastEnd,
    expectedPeriodLength,
    averageCycleLength,
    predictedStart,
    windowStart,
    windowEnd,
    pmsStart,
    pmsEnd,
    ovulationStart,
    ovulationEnd,
    fertileStart,
    fertileEnd,
  });

  const logs = entries.map((entry, index) => {
    const previous = entries[index + 1];
    const lengthFromPrevious = previous
      ? differenceInCalendarDays(dateOnly(entry.startDate), dateOnly(previous.startDate))
      : null;
    const periodDays = entry.endDate
      ? differenceInCalendarDays(dateOnly(entry.endDate), dateOnly(entry.startDate)) + 1
      : null;

    return {
      id: entry.id,
      startDate: toDateKey(entry.startDate),
      endDate: entry.endDate ? toDateKey(entry.endDate) : null,
      flowLevel: entry.flowLevel,
      symptoms: entry.symptoms,
      mood: entry.mood,
      notes: entry.notes,
      lengthFromPrevious,
      periodDays,
      dayDetails: getDayDetails(entry),
    };
  });

  const status: CycleIntelligence["status"] =
    overdueDays && overdueDays > 0
      ? "overdue"
      : completedCycleCount < 2
        ? "needs_more_data"
        : completedCycleCount < 5
          ? "learning"
          : "ready";

  return {
    generatedAt: new Date().toISOString(),
    currentPhase: current.phase,
    dayOfCycle: current.dayOfCycle,
    lastPeriodStart: lastStart ? toDateKey(lastStart) : null,
    lastPeriodEnd: lastEnd ? toDateKey(lastEnd) : null,
    predictedStart: predictedStart ? toDateKey(predictedStart) : null,
    predictedWindowStart: windowStart ? toDateKey(windowStart) : null,
    predictedWindowEnd: windowEnd ? toDateKey(windowEnd) : null,
    pmsWindowStart: pmsStart ? toDateKey(pmsStart) : null,
    pmsWindowEnd: pmsEnd ? toDateKey(pmsEnd) : null,
    ovulationWindowStart: ovulationStart ? toDateKey(ovulationStart) : null,
    ovulationWindowEnd: ovulationEnd ? toDateKey(ovulationEnd) : null,
    fertileWindowStart: fertileStart ? toDateKey(fertileStart) : null,
    fertileWindowEnd: fertileEnd ? toDateKey(fertileEnd) : null,
    expectedPeriodLength,
    averageCycleLength,
    cycleVariability,
    cycleLengths: rawCycleLengths,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    status,
    daysUntilPredictedStart,
    overdueDays,
    evidence: {
      cycleCount: entries.length,
      completedCycleCount,
      moodEntriesMapped: moods.length,
      periodDayDetailCount,
      ignoredOutliers: model.ignoredOutliers,
      recentTrendDays: model.recentTrendDays,
      accuracyMeanErrorDays: backtest.averageMissDays,
      dataNeeded,
      method: "Robust personalized model using weighted recency, median stability, outlier filtering, backtested error, period end dates, day-level flow/pain details, and mood/focus signals.",
      privacy: "Computed server-side for the signed-in private session only.",
    },
    predictionQuality: {
      averageMissDays: backtest.averageMissDays,
      backtestedCycles: backtest.errors.length,
      ignoredOutliers: model.ignoredOutliers,
      recentTrendDays: model.recentTrendDays,
      modelBlend: "54% EWMA-smoothed recency, 28% robust median, 18% recent median, with limited drift adjustment.",
    },
    healthSignals,
    studySignals,
    logs,
    calendar,
  };
}
