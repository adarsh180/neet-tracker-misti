export type RankAnchor = {
  score: number;
  rank: number;
};

export type RankCalibrationYear = {
  year: number;
  source: string;
  sourceUrl: string;
  sourceQuality: "official-published" | "published-analysis" | "compiled-analysis";
  notes: string;
  anchors: RankAnchor[];
};

export type PreviousAttempt = {
  year: number;
  score: number;
  label: string;
  takenOn?: string; // ISO date (YYYY-MM-DD) when a real attempt date is known
};

export const MISTI_PREVIOUS_ATTEMPTS: PreviousAttempt[] = [
  { year: 2023, score: 192, label: "Previous NEET attempt" },
  { year: 2024, score: 296, label: "Previous NEET attempt" },
  { year: 2025, score: 322, label: "Previous NEET attempt" },
  { year: 2026, score: 410, label: "Most recent real NEET attempt — best real score so far", takenOn: "2026-06-21" },
];

export const NEET_RANK_CALIBRATION: RankCalibrationYear[] = [
  {
    year: 2016,
    source: "Careers360 NEET 2016 marks vs rank",
    sourceUrl: "https://medicine.careers360.com/articles/neet-2016-marks-vs-rank",
    sourceQuality: "published-analysis",
    notes: "Published 2016 rank ranges; converted range endpoints into interpolation anchors.",
    anchors: [
      { score: 685, rank: 1 },
      { score: 650, rank: 50 },
      { score: 600, rank: 500 },
      { score: 550, rank: 2000 },
      { score: 500, rank: 7000 },
      { score: 450, rank: 20000 },
      { score: 400, rank: 40000 },
      { score: 350, rank: 70000 },
      { score: 300, rank: 100000 },
      { score: 250, rank: 150000 },
      { score: 200, rank: 250000 },
      { score: 150, rank: 400000 },
    ],
  },
  {
    year: 2017,
    source: "Collegedunia / Meridean NEET historical ranks",
    sourceUrl: "https://www.merideanoverseas.in/blog/neet-marks-vs-rank",
    sourceQuality: "compiled-analysis",
    notes: "Uses published topper and AIQ closing-rank anchors for broad calibration only.",
    anchors: [
      { score: 697, rank: 1 },
      { score: 563, rank: 8317 },
      { score: 442, rank: 52996 },
      { score: 405, rank: 76167 },
      { score: 138, rank: 514811 },
      { score: 134, rank: 531574 },
    ],
  },
  {
    year: 2018,
    source: "Collegedunia / Meridean NEET historical ranks",
    sourceUrl: "https://www.merideanoverseas.in/blog/neet-marks-vs-rank",
    sourceQuality: "compiled-analysis",
    notes: "Uses published topper and AIQ closing-rank anchors for broad calibration only.",
    anchors: [
      { score: 691, rank: 1 },
      { score: 537, rank: 10443 },
      { score: 417, rank: 64642 },
      { score: 399, rank: 77792 },
      { score: 210, rank: 379480 },
      { score: 184, rank: 397544 },
    ],
  },
  {
    year: 2019,
    source: "Collegedunia / Meridean NEET 2019 rank data",
    sourceUrl: "https://collegedunia.com/articles/e-457-neet-2017-marks-vs-rank",
    sourceQuality: "published-analysis",
    notes: "Detailed 2019 score-band table plus topper/closing-rank anchors.",
    anchors: [
      { score: 701, rank: 1 },
      { score: 650, rank: 32 },
      { score: 600, rank: 372 },
      { score: 550, rank: 1728 },
      { score: 500, rank: 8032 },
      { score: 450, rank: 19548 },
      { score: 400, rank: 38671 },
      { score: 350, rank: 68197 },
      { score: 300, rank: 109875 },
      { score: 250, rank: 168075 },
      { score: 200, rank: 246509 },
      { score: 150, rank: 352020 },
      { score: 120, rank: 428905 },
    ],
  },
  {
    year: 2020,
    source: "NEET Masters compiled marks vs AIR 2017-2023",
    sourceUrl: "https://neetmasters.com/assets/pdf/NEET-MARKS-VS-RANKS-2017-2023.pdf",
    sourceQuality: "compiled-analysis",
    notes: "Compiled anchors used only where public exact ranges were not available in accessible official format.",
    anchors: [
      { score: 720, rank: 1 },
      { score: 700, rank: 110 },
      { score: 650, rank: 3500 },
      { score: 600, rank: 20000 },
      { score: 550, rank: 48500 },
      { score: 500, rank: 86000 },
      { score: 147, rank: 682409 },
    ],
  },
  {
    year: 2021,
    source: "NEET Masters compiled marks vs AIR 2017-2023",
    sourceUrl: "https://neetmasters.com/assets/pdf/NEET-MARKS-VS-RANKS-2017-2023.pdf",
    sourceQuality: "compiled-analysis",
    notes: "Compiled anchors used only where public exact ranges were not available in accessible official format.",
    anchors: [
      { score: 720, rank: 1 },
      { score: 700, rank: 200 },
      { score: 650, rank: 4000 },
      { score: 600, rank: 19000 },
      { score: 550, rank: 46000 },
      { score: 500, rank: 85000 },
      { score: 138, rank: 770857 },
    ],
  },
  {
    year: 2022,
    source: "Jagran Josh NEET 2022 and 2021 marks vs rank",
    sourceUrl: "https://www.jagranjosh.com/articles/neet-marks-vs-rank-check-neet-ug-score-and-percentile-calculation-1686378062-1",
    sourceQuality: "published-analysis",
    notes: "Published 2022 score bands converted to midpoint/end-point anchors.",
    anchors: [
      { score: 715, rank: 1 },
      { score: 700, rank: 202 },
      { score: 690, rank: 512 },
      { score: 680, rank: 971 },
      { score: 670, rank: 1701 },
      { score: 660, rank: 2751 },
      { score: 650, rank: 4163 },
      { score: 640, rank: 6061 },
      { score: 630, rank: 8522 },
      { score: 620, rank: 11463 },
      { score: 610, rank: 15057 },
      { score: 600, rank: 19136 },
      { score: 550, rank: 46747 },
      { score: 500, rank: 85025 },
      { score: 117, rank: 1534697 },
    ],
  },
  {
    year: 2023,
    source: "Jagran Josh / Careers360 NEET 2023 marks vs rank",
    sourceUrl: "https://www.jagranjosh.com/articles/neet-marks-vs-rank-check-neet-ug-score-and-percentile-calculation-1686378062-1",
    sourceQuality: "published-analysis",
    notes: "Published 2023 ranges down to low scores; useful for prior-attempt calibration.",
    anchors: [
      { score: 720, rank: 1 },
      { score: 701, rank: 48 },
      { score: 651, rank: 4245 },
      { score: 601, rank: 20568 },
      { score: 551, rank: 48400 },
      { score: 451, rank: 125742 },
      { score: 401, rank: 177959 },
      { score: 351, rank: 241657 },
      { score: 301, rank: 320666 },
      { score: 251, rank: 417675 },
      { score: 201, rank: 540747 },
      { score: 151, rank: 710276 },
      { score: 101, rank: 990231 },
      { score: 51, rank: 1460741 },
      { score: 0, rank: 1750199 },
    ],
  },
  {
    year: 2024,
    source: "Careers360 NEET 2024 marks vs rank",
    sourceUrl: "https://medicine.careers360.com/articles/neet-2024-marks-vs-rank",
    sourceQuality: "published-analysis",
    notes: "2024 was an anomalous high-score year; retained but down-weighted in current prediction.",
    anchors: [
      { score: 720, rank: 1 },
      { score: 715, rank: 17 },
      { score: 700, rank: 2250 },
      { score: 665, rank: 17800 },
      { score: 638, rank: 40116 },
      { score: 615, rank: 65000 },
      { score: 592, rank: 90400 },
      { score: 550, rank: 144000 },
      { score: 500, rank: 209000 },
      { score: 414, rank: 351425 },
      { score: 380, rank: 420000 },
      { score: 287, rank: 657138 },
      { score: 251, rank: 774559 },
      { score: 142, rank: 1200000 },
    ],
  },
  {
    year: 2025,
    source: "JEEPredictor 2025 table plus published Assam state merit list check",
    sourceUrl: "https://jeepredictor.in/articles/neet-marks-vs-rank",
    sourceQuality: "published-analysis",
    notes: "Includes a low-score anchor from a published 2025 state merit list row: 322 marks, NEET rank 383681.",
    anchors: [
      { score: 686, rank: 1 },
      { score: 662, rank: 33 },
      { score: 625, rank: 158 },
      { score: 607, rank: 1022 },
      { score: 600, rank: 1386 },
      { score: 582, rank: 3200 },
      { score: 563, rank: 7497 },
      { score: 543, rank: 15000 },
      { score: 532, rank: 22000 },
      { score: 528, rank: 25000 },
      { score: 523, rank: 29000 },
      { score: 520, rank: 31450 },
      { score: 516, rank: 35000 },
      { score: 405, rank: 199000 },
      { score: 342, rank: 335000 },
      { score: 322, rank: 383681 },
    ],
  },
];

const CURRENT_YEAR_WEIGHTS: Record<number, number> = {
  2025: 0.4,
  2024: 0.12,
  2023: 0.28,
  2022: 0.1,
  2021: 0.06,
  2020: 0.04,
};

function interpolateRank(score: number, anchors: RankAnchor[]) {
  const sorted = [...anchors].sort((a, b) => b.score - a.score);
  if (score >= sorted[0].score) return sorted[0].rank;

  for (let i = 0; i < sorted.length - 1; i++) {
    const upper = sorted[i];
    const lower = sorted[i + 1];
    if (score <= upper.score && score >= lower.score) {
      const scoreSpan = upper.score - lower.score || 1;
      const rankSpan = lower.rank - upper.rank;
      const progress = (upper.score - score) / scoreSpan;
      return Math.round(upper.rank + progress * rankSpan);
    }
  }

  const last = sorted[sorted.length - 1];
  return Math.max(last.rank, Math.round(last.rank + (last.score - score) * 8500));
}

function weightedMedian(items: { value: number; weight: number }[]) {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  let running = 0;

  for (const item of sorted) {
    running += item.weight;
    if (running >= totalWeight / 2) return item.value;
  }

  return sorted[sorted.length - 1]?.value || 999999;
}

export function estimateRankForYear(score: number, year: number) {
  const table = NEET_RANK_CALIBRATION.find((item) => item.year === year);
  if (!table) return null;
  return interpolateRank(score, table.anchors);
}

export function estimateCalibratedRank(score: number) {
  const estimates = NEET_RANK_CALIBRATION
    .filter((table) => CURRENT_YEAR_WEIGHTS[table.year])
    .map((table) => ({
      year: table.year,
      rank: interpolateRank(score, table.anchors),
      weight: CURRENT_YEAR_WEIGHTS[table.year],
    }));

  const rank = Math.round(weightedMedian(estimates.map((item) => ({ value: item.rank, weight: item.weight }))));
  const ranks = estimates.map((item) => item.rank).sort((a, b) => a - b);
  const low = ranks[Math.floor(ranks.length * 0.2)] ?? rank;
  const high = ranks[Math.ceil(ranks.length * 0.8) - 1] ?? rank;

  return {
    rank,
    rankRange: {
      best: Math.min(low, rank),
      worst: Math.max(high, rank),
    },
    annualEstimates: estimates,
  };
}

export function getPreviousAttemptSummary() {
  return MISTI_PREVIOUS_ATTEMPTS.map((attempt) => ({
    ...attempt,
    // Prefer the year-specific anchor table; for years without a published
    // calibration table (e.g. the most recent attempt), fall back to the
    // blended recent-years model so the freshest real attempt still gets a
    // rank estimate instead of null.
    estimatedRank:
      estimateRankForYear(attempt.score, attempt.year)
      ?? estimateCalibratedRank(attempt.score).rank,
  }));
}

export function getRankCalibrationPromptSummary() {
  return {
    scoreSchema: "NEET UG is 720 marks total: Physics 180, Chemistry 180, Botany 180, Zoology 180.",
    sourcePolicy: "Only source-backed historical anchors are used. Missing exact ranks are represented as calibrated ranges, not fabricated exact truth.",
    currentYearWeighting: CURRENT_YEAR_WEIGHTS,
    previousAttempts: getPreviousAttemptSummary(),
    sources: NEET_RANK_CALIBRATION.map((table) => ({
      year: table.year,
      source: table.source,
      sourceQuality: table.sourceQuality,
      notes: table.notes,
    })),
  };
}
