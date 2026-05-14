import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  precomputedRoutes,
  tasks,
  taskItems,
  waypoints,
  towers,
  drones,
} from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import computeAndPersistForDroneV2 from "@/lib/route-precomputer";
import { isWithinTowerCoverage } from "@/lib/map-utils/geometry";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const droneId = body && body.droneId ? Number(body.droneId) : null;
    if (!droneId || Number.isNaN(droneId)) {
      return NextResponse.json(
        { ok: false, error: "droneId required" },
        { status: 400 },
      );
    }

    // fetch tower list once to avoid await in sync callbacks
    const towerRows = await db.select().from(towers);
    const towerList = (towerRows || []).map((x: any) => ({
      id: x.id,
      name: String(x.name ?? ""),
      latitude: Number(x.latitude),
      longitude: Number(x.longitude),
      rangeMeters: Number(x.rangeMeters),
    }));

    // Gather pending tasks for this drone
    const rows = await db
      .select()
      .from(tasks)
      .where(
        sql`${tasks.status} = 'pending' AND (${tasks.droneId} = ${droneId} OR ${tasks.droneId} IS NULL)`,
      );

    const stops: Array<{ lat: number; lon: number }> = [];

    for (const t of rows) {
      const items = await db
        .select()
        .from(taskItems)
        .where(eq(taskItems.taskId, t.id));
      for (const it of items) {
        let targetLat = it.deliveryLatitude
          ? Number(it.deliveryLatitude)
          : null;
        let targetLon = it.deliveryLongitude
          ? Number(it.deliveryLongitude)
          : null;
        if ((!targetLat || !targetLon) && it.itemId) {
          const [wp] = await db
            .select()
            .from(waypoints)
            .where(eq(waypoints.id, Number(it.itemId)));
          if (wp) {
            targetLat = Number(wp.latitude);
            targetLon = Number(wp.longitude);
          }
        }
        if (targetLat && targetLon) {
          // verify coverage
          const inCov = isWithinTowerCoverage(targetLat, targetLon, towerList);
          if (!inCov) {
            return NextResponse.json(
              {
                ok: false,
                error: "One or more task stops are outside tower coverage",
              },
              { status: 400 },
            );
          }
          stops.push({ lat: targetLat, lon: targetLon });
        }
      }
    }

    if (stops.length === 0) {
      return NextResponse.json({ ok: true, route: [], persisted: false });
    }

    // determine drone start
    const [dr] = await db.select().from(drones).where(eq(drones.id, droneId));
    if (!dr || !dr.latitude || !dr.longitude)
      return NextResponse.json(
        { ok: false, error: "Drone not positioned" },
        { status: 400 },
      );
    const start = { lat: Number(dr.latitude), lon: Number(dr.longitude) };

    // Delegate to centralized precomputer
    try {
      const res = await computeAndPersistForDroneV2(droneId);
      if (res && (res as any).ok) return NextResponse.json(res);
      return NextResponse.json(res, { status: 400 });
    } catch (e) {
      console.warn("precompute server route failed", e);
      return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
    }
  } catch (err) {
    console.error("/api/routes/precompute error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
