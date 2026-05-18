import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { patrols, drones, towers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import computePatrolRoute from "@/lib/patrol-precomputer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const radius = Number(body?.radiusMeters ?? body?.patrolRadiusMeters ?? 80);
    const duration = Number(body?.durationSeconds ?? body?.patrolDurationSeconds ?? 300);
    if (Number.isNaN(radius) || Number.isNaN(duration)) return NextResponse.json({ ok: false, error: 'invalid parameters' }, { status: 400 });
    if (radius <= 0 || radius > 2000) return NextResponse.json({ ok: false, error: 'radius out of range' }, { status: 400 });
    if (duration <= 0 || duration > 7200) return NextResponse.json({ ok: false, error: 'duration out of range' }, { status: 400 });

    let startLat = body.startLat ?? null;
    let startLon = body.startLon ?? null;
    const droneId = body.droneId ? Number(body.droneId) : null;
    if ((!startLat || !startLon) && droneId) {
      const [dr] = await db.select().from(drones).where(eq(drones.id, droneId));
      if (dr && dr.latitude && dr.longitude) { startLat = Number(dr.latitude); startLon = Number(dr.longitude); }
    }

    if (!startLat || !startLon) return NextResponse.json({ ok: false, error: 'start location required' }, { status: 400 });

    const towerRows = await db.select().from(towers);
    const towerList = (towerRows || []).map((t: any) => ({ latitude: Number(t.latitude), longitude: Number(t.longitude), rangeMeters: Number(t.rangeMeters) }));

    const center = { lat: Number(startLat), lon: Number(startLon) };
    const pre = await computePatrolRoute(center, radius, duration, towerList, { anchors: 6, maxRadius: 2000, maxSnapDistance: 400 });
    if (!pre.ok) return NextResponse.json({ ok: false, error: pre.error, diagnostics: pre.diagnostics }, { status: 400 });

    try {
      const [ins] = await db.insert(patrols).values({
        droneId: droneId ?? null,
        radiusMeters: radius,
        durationSeconds: duration,
        status: 'precomputed',
        startLat: String(center.lat),
        startLon: String(center.lon),
        routeJson: JSON.stringify(pre.route),
        routeDistanceM: Math.round(pre.loopDistance ?? 0),
        routeDurationS: Math.round(pre.loopDuration ?? 0),
      } as any).returning();
      return NextResponse.json({ ok: true, patrolId: (ins as any).id, route: pre.route });
    } catch (e) {
      console.error('patrol persist failed', e);
      return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
    }
  } catch (err) {
    console.error('/api/patrols error', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
