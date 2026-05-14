/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import { precomputedRoutes, tasks, taskItems, waypoints, towers, drones } from "@/lib/schema";
import { eq } from "drizzle-orm";
import OsrmRoutingEngine from "./osrm-engine";
import { LatLon } from "./osrm";
import { isWithinTowerCoverage } from "./map-utils/geometry";

const engine = new OsrmRoutingEngine();

export async function computeAndPersistForDroneV2(droneId: number) {
  // Behavior mirrors existing computeAndPersistForDrone but delegates to engine
  if (!droneId) return { ok: false, error: "invalid droneId" };

  const rows = await db.select().from(tasks).where(eq(tasks.status, "pending"));
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
    const stopsHash = JSON.stringify([]);
    await db.insert(precomputedRoutes).values({ droneId, stopsHash, routeJson: JSON.stringify([]) } as any);
    return { ok: true, route: [] };
  }

  // fetch towers
  const towerRows = await db.select().from(towers);
  const towerList = (towerRows || []).map((t: any) => ({ id: t.id, latitude: Number(t.latitude), longitude: Number(t.longitude), rangeMeters: Number(t.rangeMeters) }));

  // quick check: any stop outside coverage -> mark unavailable
  for (const s of stopsCoords) {
    if (!isWithinTowerCoverage(s.lat, s.lon, towerList as any)) {
      const stopsHash = JSON.stringify(stopsCoords);
      await db.insert(precomputedRoutes).values({ droneId, stopsHash, routeJson: JSON.stringify([]) } as any);
      return { ok: false, error: "stop outside coverage" };
    }
  }

  // determine drone start
  const [dr] = await db.select().from(drones).where(eq(drones.id, droneId));
  if (!dr || !dr.latitude || !dr.longitude) return { ok: false, error: "Drone not positioned" };
  const start = { lat: Number(dr.latitude), lon: Number(dr.longitude) } as LatLon;

  // Use engine to compute optimized route
  const route = await engine.computeOptimizedRoute(start, stopsCoords, { preserveCoverage: true, towers: towerList });
  if (!route || !route.coords || route.coords.length === 0) return { ok: false, error: "no coverage-preserving route" };

  const stopsHash = JSON.stringify(stopsCoords.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`));
  try {
    await db.delete(precomputedRoutes).where(eq(precomputedRoutes.droneId, droneId));
    await db.insert(precomputedRoutes).values({ droneId, startLat: String(start.lat), startLon: String(start.lon), stopsJson: JSON.stringify(stopsCoords), routeJson: JSON.stringify(route.coords) } as any);
    return { ok: true, route: route.coords, persisted: true };
  } catch (err) {
    return { ok: true, route: route.coords, persisted: false };
  }
}

export default computeAndPersistForDroneV2;
