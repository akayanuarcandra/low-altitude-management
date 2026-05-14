import computeAndPersistPatrol from "@/lib/patrol-precomputer";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const droneId = body.droneId ?? null;
    const start = body.start ?? null;
    const center = body.center ?? null;
    const radiusMeters = Number(body.radiusMeters ?? 0);
    const durationSeconds = Number(body.durationSeconds ?? 0);

    if (!radiusMeters || !durationSeconds) {
      return NextResponse.json({ ok: false, error: "radiusMeters and durationSeconds required" }, { status: 400 });
    }

    const res = await computeAndPersistPatrol({ droneId, start, center, radiusMeters, durationSeconds, maxStops: body.maxStops ?? 12, tolerancePct: body.tolerancePct ?? 0.15, maxAttempts: body.maxAttempts ?? 10 });
    return NextResponse.json(res);
  } catch (err) {
    console.error("/api/routes/patrol error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
