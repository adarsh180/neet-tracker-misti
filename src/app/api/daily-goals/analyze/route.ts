import { NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { buildAIContext } from "@/lib/ai-context-builder";
import { db } from "@/lib/db";

const DISTRACTION_KEYS = ["instagram", "whatsapp", "youtube", "facebook", "netflix", "hotstar", "mxPlayer", "google", "other"] as const;
const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function normalizeGoogleModelId(modelId: string) {
  const aliases: Record<string, string> = {
    "gemma-4-31b": "gemma-4-31b-it",
    "gemma-4-26b": "gemma-4-26b-it",
    "gemma-3-27b": "gemma-3-27b-it",
    "gemma-3-12b": "gemma-3-12b-it",
  };

  return aliases[modelId] ?? modelId;
}

function getGoogleApiKey() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return apiKey;
}

function cleanAnalysisText(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^\s*["']?analysis["']?\s*:\s*/i, "")
    .trim();
  const headlineMatches = [...cleaned.matchAll(/\*\*Headline:\*\*/gi)];
  const headlineIndex = headlineMatches.length
    ? headlineMatches[headlineMatches.length - 1].index
    : cleaned.search(/(?:^|\n)\s*(?:\*\s*)?\*?Headline:?\*?/i);
  if (headlineIndex && headlineIndex > 0) return cleaned.slice(headlineIndex).trim();
  return cleaned;
}

async function generateDailyAnalysis(prompt: string) {
  const candidates = [
    process.env.GOOGLE_AI_MODEL_ANALYTICS,
    process.env.GOOGLE_AI_MODEL_PRIMARY,
    "gemma-4-31b-it",
    "gemma-4-26b-it",
    "gemma-4-26b-a4b-it",
    process.env.GOOGLE_AI_MODEL_FALLBACK,
    process.env.GOOGLE_AI_MODEL_SECOND_FALLBACK,
    "gemma-3-27b-it",
    "gemma-3-12b-it",
    "gemini-2.5-flash",
  ].filter(Boolean) as string[];

  const uniqueCandidates = [...new Set(candidates.map(normalizeGoogleModelId))];
  const errors: string[] = [];

  for (const model of uniqueCandidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 50000);
      const response = await fetch(`${GOOGLE_API_BASE}/models/${model}:generateContent?key=${getGoogleApiKey()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 2600,
          },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        const body = await response.text();
        errors.push(`${model}: HTTP ${response.status} ${body.slice(0, 160)}`);
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("").trim();
      if (!text) {
        errors.push(`${model}: empty response`);
        continue;
      }

      return { content: cleanAnalysisText(text), model };
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Daily analyzer failed:\n${errors.join("\n")}`);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  try {
    const [context, goals, screenRows] = await Promise.all([
      buildAIContext("misti"),
      db.dailyGoal.findMany({
        include: { subject: true },
        orderBy: { date: "desc" },
        take: 120,
      }),
      db.screenTimeLog.findMany({
        where: { userId: "misti" },
        orderBy: { date: "desc" },
        take: 90,
      }),
    ]);

    const dailyMap = new Map<
      string,
      { date: string; hours: number; questions: number; discipline: number[]; completion: number[]; subjects: string[] }
    >();

    for (const goal of goals) {
      const key = dayKey(goal.date);
      const row = dailyMap.get(key) ?? { date: key, hours: 0, questions: 0, discipline: [], completion: [], subjects: [] };
      row.hours += goal.hoursStudied;
      row.questions += goal.questionsSolved;
      row.discipline.push(goal.disciplineScore);
      row.completion.push(goal.completionPercent);
      if (!row.subjects.includes(goal.subject.name)) row.subjects.push(goal.subject.name);
      dailyMap.set(key, row);
    }

    const daily = Array.from(dailyMap.values()).slice(0, 30).map((row) => ({
      date: row.date,
      hours: Number(row.hours.toFixed(1)),
      questions: row.questions,
      discipline: row.discipline.length ? Math.round(row.discipline.reduce((s, v) => s + v, 0) / row.discipline.length) : 0,
      completion: row.completion.length ? Math.round(row.completion.reduce((s, v) => s + v, 0) / row.completion.length) : 0,
      subjects: row.subjects,
    }));

    const screen = screenRows.map((row) => {
      const distraction = DISTRACTION_KEYS.reduce((sum, key) => sum + Number(row[key] ?? 0), 0);
      return {
        date: dayKey(row.date),
        distraction: Number(distraction.toFixed(1)),
        youtubeStudy: row.youtubeStudy,
        topApp: DISTRACTION_KEYS.map((key) => ({ key, value: Number(row[key] ?? 0) })).sort((a, b) => b.value - a.value)[0],
      };
    });

    const seven = daily.slice(0, 7);
    const localSummary = {
      avgHours7: seven.length ? Number((seven.reduce((s, d) => s + d.hours, 0) / 7).toFixed(1)) : 0,
      questions7: seven.reduce((s, d) => s + d.questions, 0),
      avgDiscipline7: seven.length ? Math.round(seven.reduce((s, d) => s + d.discipline, 0) / seven.length) : 0,
      avgCompletion7: seven.length ? Math.round(seven.reduce((s, d) => s + d.completion, 0) / seven.length) : 0,
      good8hDays7: seven.filter((d) => d.hours >= 8).length,
      peak12hDays7: seven.filter((d) => d.hours >= 12).length,
      distraction7: Number(screen.slice(0, 7).reduce((s, d) => s + d.distraction, 0).toFixed(1)),
      studyYoutube7: Number(screen.slice(0, 7).reduce((s, d) => s + d.youtubeStudy, 0).toFixed(1)),
    };

    const prompt = `You are NEET-GURU's discipline analyst for Misti's daily-goals page.
Hard standards: under 8 study hours is not a good day, 8h+ is good, 12h+ is excellent. For NEET, questions solved, discipline score, completion %, and screen-time leakage must all be read together.
YouTube-study is allowed. YouTube entertainment, Instagram, WhatsApp, Facebook, Netflix, Hotstar, MX Player, browsing, and other apps are distraction debt.

Return concise Markdown only. Do not use code fences. Do not return JSON.
Do not restate these instructions, the grading standards, or the prompt. Your first characters must be: **Headline:**
Use exactly this shape and keep the whole answer under 220 words:
**Headline:** one sharp sentence
**Study read:** 2-3 sentences using the real numbers
**Discipline read:** 1-2 sentences about discipline and completion
**Screen-time read:** 1-2 sentences; name the top app if distraction is high
**Next 3 actions:**
1. action
2. action
3. action
**Focus subjects:** subject - reason; subject - reason

Local summary:
${JSON.stringify(localSummary, null, 2)}

Recent daily rows:
${JSON.stringify(daily, null, 2)}

Screen-time rows:
${JSON.stringify(screen.slice(0, 30), null, 2)}

Full NEET context:
${JSON.stringify(
      {
        subjects: context.subjects,
        last7DaysSummary: context.last7DaysSummary,
        recentTests: context.recentTests.slice(0, 5),
        moodSummary: context.moodSummary,
        overallCompletion: context.overallCompletion,
        consistencyStreak: context.consistencyStreak,
        performanceScore: context.performanceScore,
        errorTopicAnalysis: context.errorTopicAnalysis?.slice(0, 10) ?? [],
        srsTopicsDue: context.srsTopicsDue?.slice(0, 10) ?? [],
      },
      null,
      2,
    )}`;

    const ai = await generateDailyAnalysis(prompt);
    return NextResponse.json({ localSummary, content: ai.content, model: ai.model });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
