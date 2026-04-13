import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAIContext, buildSystemPrompt } from "@/lib/ai-context-builder";
import { chatWithAI } from "@/lib/openrouter";

export async function POST() {
  try {
    const context = await buildAIContext();
    const systemPrompt = buildSystemPrompt(context, "rank");

    const analysisPrompt = `Based on all the data provided about Divyani, perform a comprehensive NEET rank prediction analysis. Include:

1. Estimated NEET score range (out of 720)
2. Predicted rank range
3. Subject-wise strength/weakness analysis
4. Comparison with AIIMS Delhi cutoff (~700+ score, rank ~50) and AIIMS Rishikesh (~660+, rank ~200-500)
5. Time remaining vs. preparation gap analysis  
6. Specific weekly action plan to close the gap
7. Bluff check: flag any inconsistencies between claimed progress and actual data

Write without asterisks, dashes, or markdown. Use clean paragraphs. Be precise with numbers. Be strict but constructive.

Return a JSON object with this structure:
{
  "currentScore": 450,
  "predictedScoreMin": 440,
  "predictedScoreMax": 520,
  "predictedRankMin": 15000,
  "predictedRankMax": 40000,
  "confidence": 72,
  "aimsRishikeshGap": 150,
  "aimsDelhiGap": 200,
  "subjectBreakdown": [
    {"subject": "Physics", "currentLevel": 45, "targetLevel": 90, "priority": "HIGH"},
    {"subject": "Chemistry", "currentLevel": 50, "targetLevel": 90, "priority": "HIGH"},
    {"subject": "Botany", "currentLevel": 60, "targetLevel": 90, "priority": "MEDIUM"},
    {"subject": "Zoology", "currentLevel": 55, "targetLevel": 90, "priority": "HIGH"}
  ],
  "bluffFlags": [],
  "weeklyPlan": "Study plan text here",
  "overallAnalysis": "Detailed analysis paragraph here",
  "strictMessage": "Your honest mentor message here"
}`;

    const res = await chatWithAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: analysisPrompt },
    ], 4096, 0.5);

    // Extract JSON from response
    let parsed;
    try {
      const jsonMatch = res.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON in response");
      }
    } catch {
      parsed = {
        currentScore: 0,
        predictedScoreMin: 0,
        predictedScoreMax: 0,
        predictedRankMin: 999999,
        predictedRankMax: 999999,
        confidence: 0,
        aimsRishikeshGap: 200,
        aimsDelhiGap: 300,
        subjectBreakdown: [],
        bluffFlags: [],
        weeklyPlan: "Unable to generate plan.",
        overallAnalysis: res.content,
        strictMessage: "Please provide more study data for accurate prediction.",
      };
    }

    // Save prediction
    await db.rankPrediction.create({
      data: {
        predictedRank: parsed.predictedRankMin || 999999,
        predictedScore: parsed.predictedScoreMin || 0,
        confidence: parsed.confidence || 0,
        analysisJson: JSON.stringify(parsed),
      },
    });

    return NextResponse.json({ ...parsed, model: res.model });
  } catch (err) {
    console.error("[rank-predict]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const predictions = await db.rankPrediction.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json(predictions.map((p) => ({
      ...p,
      analysis: JSON.parse(p.analysisJson),
    })));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
