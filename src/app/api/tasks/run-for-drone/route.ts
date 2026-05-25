import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, taskItems, towers, drones, precomputedRoutes, waypoints } from "@/lib/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import OsrmRoutingEngine from "@/lib/osrm-engine";

// Distance threshold (meters) used to match a stop coordinate to a route coordinate
const STOP_MATCH_THRESHOLD_M = Number(process.env.STOP_MATCH_THRESHOLD_M ?? 50);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const droneId = body && body.droneId ? Number(body.droneId) : null;
    if (!droneId || Number.isNaN(droneId)) {
      return NextResponse.json(
        { ok: false, error: "droneId required" },
        { status: 400 },
      );
    }

    console.debug(
      "/api/tasks/run-for-drone: starting tasks for drone",
      droneId,
    );

    // Find pending tasks that are either unassigned or assigned to the drone
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "pending"),
          or(eq(tasks.droneId, droneId), sql`${tasks.droneId} IS NULL`),
        ),
      );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, started: [] });
    }

    const started: any[] = [];

    for (const t of rows) {
      try {
        const updateData: any = { status: "started", startedAt: new Date() };
        if (t.droneId == null) updateData.droneId = droneId;
        await db.update(tasks).set(updateData).where(eq(tasks.id, t.id));

        // Fetch items for this task
        const items = await db
          .select()
          .from(taskItems)
          .where(eq(taskItems.taskId, t.id));

        const itemsDto = (items || []).map((it: any) => ({
          id: it.id,
          itemId: it.itemId,
          quantity: Number(it.quantity),
          deliveryLatitude: it.deliveryLatitude
            ? String(it.deliveryLatitude)
            : null,
          deliveryLongitude: it.deliveryLongitude
            ? String(it.deliveryLongitude)
            : null,
          sequence: Number(it.sequence),
        }));

        started.push({
          task: {
            id: t.id,
            title: t.title,
            description: t.description,
            quantity: Number(t.quantity),
            droneId: updateData.droneId ?? t.droneId,
          },
          items: itemsDto,
        });
        console.debug("/api/tasks/run-for-drone: started task", { taskId: t.id, droneId, items: itemsDto });
      } catch (err) {
        console.error(
          `/api/tasks/run-for-drone: failed to start task ${t.id}`,
          err,
        );
      }
    }

    // Enrich started tasks with optimized route information per-drone where possible.
    try {
      const engine = new OsrmRoutingEngine();

      // fetch towers once for coverage checks / route engine
      const towerRows = await db.select().from(towers);
      const towerList = (towerRows || []).map((x: any) => ({ id: x.id, name: String(x.name ?? ""), latitude: Number(x.latitude), longitude: Number(x.longitude), rangeMeters: Number(x.rangeMeters) }));

      // Group started tasks by droneId
      const byDrone = new Map<number, Array<any>>();
      for (const s of started) {
        const dId = Number(s.task.droneId);
        if (!dId) continue;
        if (!byDrone.has(dId)) byDrone.set(dId, []);
        byDrone.get(dId)!.push(s);
      }

      for (const [dId, tasksForDrone] of byDrone.entries()) {
        try {
          // build stops: preserve first-seen order and dedupe by lat/lon
          const stopsMap = new Map<string, { lat: number; lon: number; origKeys: string[]; }>();
          const itemsList: Array<{ parentTask: any; item: any }> = [];
          for (const s of tasksForDrone) {
            for (const it of s.items || []) {
              let lat = it.deliveryLatitude ? Number(it.deliveryLatitude) : null;
              let lon = it.deliveryLongitude ? Number(it.deliveryLongitude) : null;
              if ((!lat || !lon) && it.itemId) {
                try {
                  const [wp] = await db.select().from(waypoints).where(eq(waypoints.id, Number(it.itemId)));
                  if (wp) {
                    lat = lat || Number(wp.latitude);
                    lon = lon || Number(wp.longitude);
                  }
                } catch (e) {
                  // ignore
                }
              }
              if (!lat || !lon) continue;
              const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
              if (!stopsMap.has(key)) {
                stopsMap.set(key, { lat, lon, origKeys: [key] });
              } else {
                stopsMap.get(key)!.origKeys.push(key);
              }
              itemsList.push({ parentTask: s.task, item: it });
            }
          }

          const stopsCoords = Array.from(stopsMap.values()).map((v) => ({ lat: v.lat, lon: v.lon }));
          if (stopsCoords.length === 0) {
            // nothing to route for this drone
            continue;
          }

          // get drone start
          const [drRow] = await db.select().from(drones).where(eq(drones.id, dId));
          if (!drRow || !drRow.latitude || !drRow.longitude) {
            console.debug("run-for-drone: drone not positioned, skipping route compute", { droneId: dId });
            continue;
          }
          const start = { lat: Number(drRow.latitude), lon: Number(drRow.longitude) };

          // compute optimized route (engine will try trip then fallback)
          const routeRes = await engine.computeOptimizedRoute(start, stopsCoords, { preserveCoverage: true, towers: towerList });
          if (!routeRes || !routeRes.coords || routeRes.coords.length === 0) {
            console.debug("run-for-drone: no route produced for drone", dId);
            continue;
          }

          // Determine ordered stops if waypointOrder present (osrm trip). waypointOrder refers to indices in [start, ...stops]
          let orderedStopIndices: number[] = [];
          if (routeRes.usedTrip && Array.isArray((routeRes as any).waypointOrder)) {
            const wpOrder = (routeRes as any).waypointOrder as number[];
            orderedStopIndices = wpOrder.filter((i) => i !== 0).map((i) => i - 1);
          } else {
            // fallback: use original stops order
            orderedStopIndices = stopsCoords.map((_, i) => i);
          }

          // Helper: haversine
          const hav = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const R = 6371000;
            const toRad = (d: number) => (d * Math.PI) / 180;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
          };

          // Map stopIndex -> routeCoordIndex by finding nearest route coord within threshold
          const stopToRouteIndex: Record<number, number> = {};
          for (const stopIdx of orderedStopIndices) {
            const stop = stopsCoords[stopIdx];
            let bestIdx = -1;
            let bestDist = Infinity;
            for (let i = 0; i < routeRes.coords.length; i++) {
              const rc = routeRes.coords[i];
              const d = hav(stop.lat, stop.lon, rc.lat, rc.lon);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
                if (bestDist <= STOP_MATCH_THRESHOLD_M) break;
              }
            }
            if (bestIdx >= 0) stopToRouteIndex[stopIdx] = bestIdx;
          }

          // Build persisted stopsHash and attempt to persist the computed route
          try {
            const stopsHash = JSON.stringify(stopsCoords.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`));
            // remove any existing entries for this drone (simple approach)
            await db.delete(precomputedRoutes).where(eq(precomputedRoutes.droneId, dId));
            await db.insert(precomputedRoutes).values({ droneId: dId, stopsJson: JSON.stringify(stopsCoords), startLat: String(start.lat), startLon: String(start.lon), routeJson: JSON.stringify(routeRes.coords), stopsHash } as any);
          } catch (e) {
            console.debug("run-for-drone: failed to persist precomputed route", e);
          }

          // Attach route and itemsRouteIndices back onto started task objects
          // For each original started task for this drone, compute indices for its items
          for (const s of tasksForDrone) {
            const items = s.items || [];
            const itemsRouteIndices: number[] = [];
            for (const it of items) {
              let lat = it.deliveryLatitude ? Number(it.deliveryLatitude) : null;
              let lon = it.deliveryLongitude ? Number(it.deliveryLongitude) : null;
              if ((!lat || !lon) && it.itemId) {
                try {
                  const [wp] = await db.select().from(waypoints).where(eq(waypoints.id, Number(it.itemId)));
                  if (wp) {
                    lat = lat || Number(wp.latitude);
                    lon = lon || Number(wp.longitude);
                  }
                } catch (e) {
                  // ignore
                }
              }
              if (!lat || !lon) {
                itemsRouteIndices.push(-1);
                continue;
              }
              const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
              // find stopIndex for this key in stopsCoords
              let stopIdx = -1;
              for (let i = 0; i < stopsCoords.length; i++) {
                if (Math.abs(stopsCoords[i].lat - lat) < 1e-6 && Math.abs(stopsCoords[i].lon - lon) < 1e-6) {
                  stopIdx = i;
                  break;
                }
              }
              if (stopIdx === -1) {
                // not found - try nearest
                let best = -1;
                let bestD = Infinity;
                for (let i = 0; i < stopsCoords.length; i++) {
                  const d = hav(lat, lon, stopsCoords[i].lat, stopsCoords[i].lon);
                  if (d < bestD) {
                    bestD = d; best = i;
                  }
                }
                stopIdx = best;
              }
              const routeIdx = stopIdx >= 0 && stopToRouteIndex[stopIdx] !== undefined ? stopToRouteIndex[stopIdx] : -1;
              itemsRouteIndices.push(routeIdx);
            }
            s.route = routeRes.coords;
            s.itemsRouteIndices = itemsRouteIndices;
          }
        } catch (e) {
          console.error("run-for-drone: per-drone routing error", e);
        }
      }
    } catch (e) {
      console.error("run-for-drone: route enrichment failed", e);
    }

    // Revalidate pages that list tasks and map
    try {
      revalidatePath("/dashboard/tasks");
      revalidatePath("/dashboard/map");
    } catch (e) {
      // ignore revalidation errors in dev
    }

    console.debug("/api/tasks/run-for-drone: response payload", { started });
    return NextResponse.json({ ok: true, started });
  } catch (err) {
    console.error("/api/tasks/run-for-drone error", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
