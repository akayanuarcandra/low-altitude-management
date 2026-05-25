import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { waypoints, towers } from "@/lib/schema";
import { isWithinTowerCoverage } from "@/lib/map-utils/geometry";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    // fetch towers
    const towerRows = await db.select().from(towers);
    const towerList = (towerRows || []).map((t: any) => ({ latitude: Number(t.latitude), longitude: Number(t.longitude), rangeMeters: Number(t.rangeMeters) }));

    const outOfCoverage: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let lat: number | null = null;
      let lon: number | null = null;
      if (it?.waypointId) {
        const [wp] = await db.select().from(waypoints).where(eq(waypoints.id, Number(it.waypointId)));
        if (wp) {
          lat = Number(wp.latitude);
          lon = Number(wp.longitude);
        }
      }
      if ((lat === null || lon === null) && it?.latitude && it?.longitude) {
        const la = Number(it.latitude);
        const lo = Number(it.longitude);
        if (!Number.isNaN(la) && !Number.isNaN(lo)) {
          lat = la; lon = lo;
        }
      }

      if (lat === null || lon === null) {
        return NextResponse.json({ ok: false, error: `Item at index ${i} missing coordinates` }, { status: 400 });
      }

      const inCov = isWithinTowerCoverage(lat, lon, towerList as any);
      if (!inCov) {
        outOfCoverage.push({ index: i, latitude: lat, longitude: lon, waypointId: it?.waypointId ?? null });
      }
    }

    if (outOfCoverage.length > 0) {
      return NextResponse.json({ ok: false, error: "One or more task stops are outside tower coverage", details: outOfCoverage }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('/api/coverage/check error', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
