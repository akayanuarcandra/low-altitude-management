/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import { precomputedRoutes, tasks, taskItems, waypoints, towers, drones } from "@/lib/schema";
import { eq } from "drizzle-orm";
import OsrmRoutingEngine from "@/lib/osrm-engine";
import { isWithinTowerCoverage } from "@/lib/map-utils/geometry";

import type { LatLon } from "@/lib/osrm";

function hashStops(stops: LatLon[]) {
  return JSON.stringify(stops.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`));
}

export async function getPersistedRoute(droneId: number, stops: LatLon[]) {
  try {
    const stopsHash = hashStops(stops);
    const rows = await db.select().from(precomputedRoutes).where(eq(precomputedRoutes.droneId, droneId));
    if (!rows || rows.length === 0) return null;
    // find matching hash
    for (const r of rows) {
      if (String((r as any).stopsHash) === stopsHash) {
        try {
          const parsed = JSON.parse((r as any).routeJson);
          return parsed as LatLon[];
        } catch {
          return null;
        }
      }
    }
    return null;
  } catch (err) {
    console.error("getPersistedRoute error", err);
    return null;
  }
}

export async function computeAndPersistForDrone(droneId: number) {
  try {
    if (!droneId) return { ok: false, error: "invalid droneId" };

    // fetch pending tasks for this drone (pending and either unassigned or assigned to this drone)
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.status, "pending"));

    // Filter rows to those assigned to this drone or unassigned
    const relevant = (rows || []).filter((r: any) => r.droneId === null || Number(r.droneId) === Number(droneId));

    const stopsCoords: LatLon[] = [];
    for (const t of relevant) {
      const its = await db.select().from(taskItems).where(eq(taskItems.taskId, t.id));
      for (const it of (its || [])) {
        let lat = it.deliveryLatitude ? Number(it.deliveryLatitude) : null;
        let lon = it.deliveryLongitude ? Number(it.deliveryLongitude) : null;
        if ((!lat || !lon) && it.itemId) {
          const [wp] = await db.select().from(waypoints).where(eq(waypoints.id, Number(it.itemId)));
          if (wp) {
            lat = Number((wp as any).latitude);
            lon = Number((wp as any).longitude);
          }
        }
        if (lat && lon) stopsCoords.push({ lat, lon });
      }
    }

    if (stopsCoords.length === 0) {
      // store empty/unavailable route
      const stopsHash = hashStops(stopsCoords);
      await db.insert(precomputedRoutes).values({ droneId, stopsHash, routeJson: JSON.stringify([]) } as any);
      return { ok: true, route: [] };
    }

    // fetch towers for coverage check
    const allTowers = await db.select().from(towers);
    const towerList = (allTowers || []).map((t: any) => ({
      id: t.id,
      latitude: Number(t.latitude),
      longitude: Number(t.longitude),
      rangeMeters: Number(t.rangeMeters),
    }));

    // quick check: any stop outside coverage -> mark unavailable
    for (const s of stopsCoords) {
      if (!isWithinTowerCoverage(s.lat, s.lon, towerList as any)) {
        const stopsHash = hashStops(stopsCoords);
        await db.insert(precomputedRoutes).values({ droneId, stopsHash, routeJson: JSON.stringify([]) } as any);
        return { ok: false, error: "stop outside coverage" };
      }
    }

    // compute route using centralized engine
    const engine = new OsrmRoutingEngine();
    let fullPathCoords: LatLon[] = [];
    try {
      const [droneRow] = await db.select().from(drones).where(eq(drones.id, droneId));
      const startCoord = droneRow && droneRow.latitude && droneRow.longitude ? { lat: Number(droneRow.latitude), lon: Number(droneRow.longitude) } : stopsCoords[0];
      const routeRes = await engine.computeOptimizedRoute(startCoord as LatLon, stopsCoords, { preserveCoverage: true, towers: towerList });
      if (routeRes && routeRes.coords && routeRes.coords.length) fullPathCoords = routeRes.coords;
    } catch (e) {
      // ignore and fall through
    }

    const stopsHash = hashStops(stopsCoords);
    if (fullPathCoords && fullPathCoords.length > 0) {
      const existing = await db
        .select()
        .from(precomputedRoutes)
        .where(eq(precomputedRoutes.droneId, droneId));
      if (existing && existing.length > 0) {
        // update first matching by hash or insert
        let found = false;
        for (const r of existing) {
          if (String((r as any).stopsHash) === stopsHash) {
            await db
              .update(precomputedRoutes)
              .set({ routeJson: JSON.stringify(fullPathCoords), updatedAt: new Date() } as any)
              .where(eq(precomputedRoutes.id, (r as any).id));
            found = true;
            break;
          }
        }
        if (!found) {
          await db.insert(precomputedRoutes).values({ droneId, stopsHash, routeJson: JSON.stringify(fullPathCoords) } as any);
        }
      } else {
        await db.insert(precomputedRoutes).values({ droneId, stopsHash, routeJson: JSON.stringify(fullPathCoords) } as any);
      }
      return { ok: true, route: fullPathCoords };
    }

    await db.insert(precomputedRoutes).values({ droneId, stopsHash, routeJson: JSON.stringify([]) } as any);
    return { ok: false, error: "no coverage-preserving route" };
  } catch (err) {
    console.error("computeAndPersistForDrone error", err);
    return { ok: false, error: String(err) };
  }
}
