import { NextRequest, NextResponse } from "next/server";
import { requirePrivateApiSession } from "@/lib/api-auth";
import { getNeetPrepConfidence } from "@/lib/prep-confidence";
import { isPrismaConnectionError } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

const UPSC_CONFIDENCE_URL =
  process.env.UPSC_CONFIDENCE_URL ?? "https://upsc-cse-tracker-adarsh.vercel.app/api/prep-confidence";

async function fetchRemoteConfidence(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Remote confidence endpoint returned ${response.status}`);
  }

  return response.json();
}

function getUnavailableConfidence(exam: "UPSC CSE 2027" | "NEET UG 2027", note: string) {
  return {
    exam,
    score: 0,
    label: "pending live sync",
    reliability: 0,
    updatedAt: new Date().toISOString(),
    source: "unavailable",
    formulaVersion: "unavailable",
    components: [],
    signals: [note],
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requirePrivateApiSession();
  if (unauthorized) return unauthorized;

  const target = request.nextUrl.searchParams.get("target");

  try {
    if (target === "upsc") {
      try {
        const data = await fetchRemoteConfidence(UPSC_CONFIDENCE_URL);
        return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        console.warn("[prep-confidence:upsc]", error);
        return NextResponse.json(
          getUnavailableConfidence(
            "UPSC CSE 2027",
            "The UPSC live confidence endpoint is not available yet. Deploy the UPSC project or set UPSC_CONFIDENCE_URL.",
          ),
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    const data = await getNeetPrepConfidence();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[prep-confidence]", error);

    if (isPrismaConnectionError(error)) {
      return NextResponse.json(
        getUnavailableConfidence(
          target === "upsc" ? "UPSC CSE 2027" : "NEET UG 2027",
          "Live confidence cannot be computed because the database is unreachable.",
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { error: "Failed to load live prep confidence" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
