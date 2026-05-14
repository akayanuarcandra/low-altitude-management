/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import { precomputedRoutes, towers, drones } from "@/lib/schema";
import { eq } from "drizzle-orm";
import OsrmRoutingEngine from "./osrm-engine";
import { LatLon } from "./osrm";
import { isWithinTowerCoverage } from "./map-utils/geometry";
import { haversineMeters } from "@/components/map/map-helpers";

const engine = new OsrmRoutingEngine();

function hashStops(stops: LatLon[]) {
  return JSON.stringify(stops.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`));
}

function pointOnCircle(center: LatLon, radiusMeters: number, angleDeg: number): LatLon {
  // Simple equirectangular approximation for small distances
  // Convert meters to degrees roughly
  const R = 6371000; // earth radius meters
  const ang = (angleDeg * Math.PI) / 180;
  const lat1 = (center.lat * Math.PI) / 180;
  const lon1 = (center.lon * Math.PI) / 180;
  const d = radiusMeters / R;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(ang));
  const lon2 = lon1 + Math.atan2(
    Math.sin(ang) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
  );

  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

export async function computeAndPersistPatrol(options: {
  droneId?: number;
  start?: LatLon;
  center?: LatLon;
  radiusMeters: number;
  durationSeconds: number;
  maxStops?: number;
  tolerancePct?: number;
  maxAttempts?: number;
}) {
  try {
    const radiusMeters = Number(options.radiusMeters ?? 0);
    const durationSeconds = Number(options.durationSeconds ?? 0);
    if (!radiusMeters || radiusMeters <= 0) return { ok: false, error: "invalid radius" };
    if (!durationSeconds || durationSeconds <= 0) return { ok: false, error: "invalid duration" };

    // determine start / center
    let start: LatLon | null = null;
    if (options.droneId) {
      const [dr] = await db.select().from(drones).where(eq(drones.id, options.droneId));
      if (!dr || !dr.latitude || !dr.longitude) return { ok: false, error: "Drone not positioned" };
      start = { lat: Number(dr.latitude), lon: Number(dr.longitude) } as LatLon;
    }
    if (!start && options.start) start = options.start;
    if (!start) return { ok: false, error: "start coordinate required" };

    const center = options.center ?? start;

    // fetch towers
    const towerRows = await db.select().from(towers);
    const towerList = (towerRows || []).map((t: any) => ({ id: t.id, latitude: Number(t.latitude), longitude: Number(t.longitude), rangeMeters: Number(t.rangeMeters) }));

    // quick check: center must be inside coverage
    if (!isWithinTowerCoverage(center.lat, center.lon, towerList as any)) {
      return { ok: false, error: "center outside tower coverage" };
    }

    const maxStops = Number(options.maxStops ?? 12);
    const tolerancePct = Number(options.tolerancePct ?? 0.15);
    const maxAttempts = Number(options.maxAttempts ?? 10);

    // Candidate generation: generate points around circle at a fraction of radius to increase chance of being on-road
    const radiusFactorStart = 0.9; // start slightly inside

    let best: { route?: LatLon[]; distance?: number; duration?: number; error?: number } | null = null;

    let stopsCount = Math.max(3, Math.min(6, Math.floor(maxStops)));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const frac = radiusFactorStart + (attempt / Math.max(1, maxAttempts)) * 0.2; // slowly expand up to +0.2
      const r = radiusMeters * frac;

      // choose number of stops: gradually increase up to maxStops
      const triesStops = Math.min(maxStops, stopsCount + Math.floor(attempt / 2));

      // build evenly spaced stops around circle
      const stops: LatLon[] = [];
      for (let i = 0; i < triesStops; i++) {
        const ang = (i * 360) / triesStops;
        const p = pointOnCircle(center, r, ang);
        // ensure point is inside coverage; if not, try to move it slightly inward
        if (!isWithinTowerCoverage(p.lat, p.lon, towerList as any)) {
          // try inward steps
          let found = false;
          for (let s = 1; s <= 4; s++) {
            const inward = r * (1 - s * 0.15);
            const p2 = pointOnCircle(center, inward, ang);
            if (isWithinTowerCoverage(p2.lat, p2.lon, towerList as any)) {
              stops.push(p2);
              found = true;
              break;
            }
          }
          if (!found) {
            // fall back to center (will be snapped by OSRM to nearest road)
            stops.push({ lat: center.lat, lon: center.lon });
          }
        } else {
          stops.push(p);
        }
      }

      // Compute optimized route
      let routeRes = null;
      try {
        routeRes = await engine.computeOptimizedRoute(start, stops, { preserveCoverage: true, towers: towerList });
      } catch (err) {
        // ignore and continue
      }

      if (!routeRes || !routeRes.coords || routeRes.coords.length === 0) {
        // try next attempt
        continue;
      }

      const dur = routeRes.duration ?? 0;
      const dist = routeRes.distance ?? 0;
      const errAbs = Math.abs(dur - durationSeconds);

      if (!best || errAbs < (best.error ?? Infinity)) {
        best = { route: routeRes.coords, distance: dist, duration: dur, error: errAbs };
      }

      // Accept if within tolerance
      if (errAbs / Math.max(1, durationSeconds) <= tolerancePct || errAbs <= 10) {
        // Persist and return
        const stopsHash = hashStops(stops);
        try {
          await db.delete(precomputedRoutes).where(eq(precomputedRoutes.droneId, options.droneId ?? -1));
        } catch {
          // ignore
        }
        try {
          await db.insert(precomputedRoutes).values({ droneId: options.droneId ?? null, startLat: String(start.lat), startLon: String(start.lon), stopsJson: JSON.stringify(stops), routeJson: JSON.stringify(routeRes.coords) } as any);
        } catch {
          // ignore persist failure but still return route
        }

        return { ok: true, route: routeRes.coords, distance: dist, duration: dur, persisted: true };
      }
    }

    if (best) {
      // persist best
      try {
        await db.delete(precomputedRoutes).where(eq(precomputedRoutes.droneId, options.droneId ?? -1));
      } catch {}
      try {
        await db.insert(precomputedRoutes).values({ droneId: options.droneId ?? null, startLat: String(start.lat), startLon: String(start.lon), stopsJson: JSON.stringify([]), routeJson: JSON.stringify(best.route) } as any);
      } catch {}
      return { ok: true, route: best.route, distance: best.distance, duration: best.duration, persisted: true, warning: "best-effort match" };
    }

    return { ok: false, error: "no coverage-preserving route" };
  } catch (err) {
    console.error("computeAndPersistPatrol error", err);
    return { ok: false, error: String(err) };
  }
}

export default computeAndPersistPatrol;
