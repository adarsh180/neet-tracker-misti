import { addDays, differenceInCalendarDays, format, isWithinInterval, startOfDay } from "date-fns";
import { db } from "@/lib/db";

type CycleRow = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  flowLevel: string;
  symptoms: string | null;
  mood: string | null;
  notes: string | null;
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
  cycleEntryId?: string | null;
  mood?: {
    mood: string;
    energy: number;
    focus: number;
    stress: number;
    note: string | null;
  } | null;
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
    method: string;
    privacy: string;
  };
  studySignals: {
    avgEnergy: number | null;
    avgFocus: number | null;
    avgStress: number | null;
    lowEnergyCycleDays: number[];
    highFocusCycleDays: number[];
    mostCommonSymptoms: string[];
    recommendationTone: "protect" | "balanced" | "push";
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
  }[];
  calendar: CycleCalendarDay[];
};

function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function dateOnly(date: Date) {
  return startOfDay(date);
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

function weightedAverageRecent(values: number[]) {
  if (!values.length) return 28;

  let weightedSum = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    const weight = index + 1;
    weightedSum += value * weight;
    totalWeight += weight;
  });

  return weightedSum / totalWeight;
}

function variability(values: number[]) {
  if (values.length < 2) return values.length === 1 ? 3 : 5;
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  return Math.max(1, median(deviations) * 1.4826);
}

function confidenceLabel(confidence: number): CycleIntelligence["confidenceLabel"] {
  if (confidence >= 78) return "High";
  if (confidence >= 56) return "Medium";
  if (confidence >= 35) return "Low";
  return "Very low";
}

function buildConfidence(completedCycleCount: number, variation: number) {
  const dataScore = clamp(completedCycleCount / 8, 0, 1) * 72;
  const stabilityPenalty = clamp((variation - 2) * 5, 0, 30);
  const confidence = Math.round(clamp(18 + dataScore - stabilityPenalty, 18, 92));
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
    const mood = moodByDate.get(key);

    if (loggedEntry) addKind(kinds, "logged-period");
    if (windowStart && windowEnd && isWithinInterval(cursor, { start: windowStart, end: windowEnd })) {
      addKind(kinds, "predicted-period");
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
      flowLevel: loggedEntry?.flowLevel ?? null,
      symptoms: loggedEntry?.symptoms ?? null,
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
  const today = dateOnly(new Date());
  const last = entries[0] ?? null;

  const cycleLengths = ascEntries
    .slice(1)
    .map((entry, index) => differenceInCalendarDays(dateOnly(entry.startDate), dateOnly(ascEntries[index].startDate)))
    .filter((days) => days >= 15 && days <= 60);

  const completedCycleCount = cycleLengths.length;
  const rawAverageLength = weightedAverageRecent(cycleLengths);
  const averageCycleLength = Math.round(clamp(rawAverageLength, 21, 45));
  const cycleVariability = Math.round(variability(cycleLengths) * 10) / 10;
  const expectedPeriodLength = getExpectedPeriodLength(entries);
  const confidence = buildConfidence(completedCycleCount, cycleVariability);
  const halfWindow = Math.round(clamp(Math.max(2, cycleVariability, completedCycleCount < 3 ? 5 : 2), 2, 8));

  const lastStart = last ? dateOnly(last.startDate) : null;
  const lastEnd = last?.endDate ? dateOnly(last.endDate) : lastStart ? addDays(lastStart, expectedPeriodLength - 1) : null;
  const predictedStart = lastStart ? addDays(lastStart, averageCycleLength) : null;
  const windowStart = predictedStart ? addDays(predictedStart, -halfWindow) : null;
  const windowEnd = predictedStart ? addDays(predictedStart, halfWindow) : null;
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
    ovulationWindowStart: ovulationStart ? toDateKey(ovulationStart) : null,
    ovulationWindowEnd: ovulationEnd ? toDateKey(ovulationEnd) : null,
    fertileWindowStart: fertileStart ? toDateKey(fertileStart) : null,
    fertileWindowEnd: fertileEnd ? toDateKey(fertileEnd) : null,
    expectedPeriodLength,
    averageCycleLength,
    cycleVariability,
    cycleLengths,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    status,
    daysUntilPredictedStart,
    overdueDays,
    evidence: {
      cycleCount: entries.length,
      completedCycleCount,
      moodEntriesMapped: moods.length,
      method: "Personalized deterministic model using only logged start dates, end dates, symptoms, and mood/focus signals.",
      privacy: "Computed server-side for the signed-in private session only.",
    },
    studySignals,
    logs,
    calendar,
  };
}
