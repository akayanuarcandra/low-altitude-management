/* eslint-disable @typescript-eslint/no-explicit-any */
import OsrmRoutingEngine from "./osrm-engine";
import { LatLon } from "./osrm";
import { isGeometryInsideCoverage } from "./coverage";
import { haversineMeters } from "./map-utils/geometry";

const engine = new OsrmRoutingEngine();

import { db } from "./db";
import { precomputedRoutes } from "./schema";

async function snapPoint(p: LatLon) {
  try {
    return await engine.snapToRoad(p);
  } catch {
    return null;
  }
}

function pointOnCircle(center: LatLon, radiusMeters: number, angleDeg: number): LatLon {
  const R = 6371000;
  const ang = (angleDeg * Math.PI) / 180;
  const dByR = radiusMeters / R;
  const lat1 = (center.lat * Math.PI) / 180;
  const lon1 = (center.lon * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(ang));
  const lon2 = lon1 + Math.atan2(Math.sin(ang) * Math.sin(dByR) * Math.cos(lat1), Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

export async function computePatrolRoute(center: LatLon, radiusMeters: number, durationSeconds: number, towers: Array<{ latitude: number; longitude: number; rangeMeters: number }>, opts?: { anchors?: number; maxRadius?: number; maxSnapDistance?: number }) {
  const requestedAnchors = opts?.anchors ?? 6;
  const anchorOptions = [requestedAnchors, Math.max(3, Math.floor(requestedAnchors / 2)), 3];
  const maxRadius = Math.min(opts?.maxRadius ?? 2000, 2000);
  const maxSnapDistance = opts?.maxSnapDistance ?? 300; // meters
  let r = Math.min(radiusMeters, maxRadius);

  if (r <= 0 || durationSeconds <= 0) return { ok: false, error: 'invalid parameters' };

  const diagnostics: any[] = [];

  // Try precomputedRoutes fallback first — look for recent routes that pass through the circle
  try {
    const rows: any[] = await db.select().from(precomputedRoutes).orderBy().limit(30) as any;
    // Note: orderBy() without args returns unspecific order in drizzle; limit reduces cost
    for (const r of rows || []) {
      try {
        if (!r || !r.routeJson) continue;
        const coords: LatLon[] = JSON.parse(r.routeJson as string || "[]");
        if (!Array.isArray(coords) || coords.length === 0) continue;

        // find contiguous runs of points inside the requested circle
        let runs: LatLon[][] = [];
        let current: LatLon[] = [];
        for (const p of coords) {
          const d = haversineMeters(center.lat, center.lon, Number(p.lat), Number(p.lon));
          if (d <= radiusMeters) {
            current.push({ lat: Number(p.lat), lon: Number(p.lon) });
          } else {
            if (current.length) { runs.push(current); current = []; }
          }
        }
        if (current.length) runs.push(current);

        // choose the longest run
        runs.sort((a, b) => b.length - a.length);
        const best = runs[0];
        diagnostics.push({ fallbackPrecomputedChecked: true, precomputedId: r.id, runsFound: runs.length, bestLength: best ? best.length : 0 });
        if (!best || best.length < 3) continue;

        // attempt to create a closed loop by taking the run and appending the first point
        const loopPoints = best.slice();
        loopPoints.push(best[0]);

        try {
          const res = await engine.computeRouteOrdered(loopPoints, { preserveCoverage: true, towers });
          if (res && res.coords && res.coords.length > 0) {
            if (!isGeometryInsideCoverage(res.coords, towers, 20)) {
              diagnostics.push({ fallbackPrecomputedId: r.id, reason: 'precomputed segment not fully in coverage' });
            } else {
              const repeats = Math.max(1, Math.ceil(durationSeconds / Math.max(1, res.duration)));
              let finalCoords: LatLon[] = [];
              for (let k = 0; k < repeats; k++) finalCoords = finalCoords.concat(res.coords);
              return { ok: true, route: finalCoords, loopDistance: res.distance, loopDuration: res.duration, radiusUsed: radiusMeters, diagnostics };
            }
          }
        } catch (e: any) {
          diagnostics.push({ fallbackPrecomputedId: r.id, error: String(e?.message ?? e) });
        }
      } catch (e) {
        // ignore parsing errors per-row
        diagnostics.push({ precomputedParseError: String(e) });
      }
    }
  } catch (e) {
    diagnostics.push({ precomputedQueryError: String(e) });
  }

  // Try different anchor counts and shrinking radius
  for (const anchorsN of anchorOptions) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const anchors: LatLon[] = [];
      for (let i = 0; i < anchorsN; i++) anchors.push(pointOnCircle(center, r, (360 / anchorsN) * i));

      // snap anchors to road and record distances
      const snapped: Array<LatLon | null> = [];
      const snapInfo: Array<{ anchor: LatLon; snapped?: LatLon | null; dist?: number | null }> = [];
      for (const a of anchors) {
        let s = null;
        try { s = await snapPoint(a); } catch { s = null; }
        if (!s) {
          snapped.push(null);
          snapInfo.push({ anchor: a, snapped: null, dist: null });
          continue;
        }
        const d = haversineMeters(a.lat, a.lon, s.lat, s.lon);
        snapped.push(s);
        snapInfo.push({ anchor: a, snapped: s, dist: d });
      }

      const validCount = snapped.filter(Boolean).length;
      diagnostics.push({ anchorsN, radiusTried: r, snapInfo });

      // Reject if too many missing anchors or too-far snaps
      const tooFar = snapInfo.filter((s) => s.dist !== null && (s.dist as number) > maxSnapDistance).length;
      if (validCount < Math.max(2, Math.floor(anchorsN / 2)) || tooFar > Math.floor(anchorsN / 3)) {
        r = Math.max(30, Math.floor(r * 0.7));
        continue;
      }

      // attempt to compute segments
      const segments: any[] = [];
      let failed = false;
      let failReason: string | null = null;
      for (let i = 0; i < anchorsN; i++) {
        const a = snapped[i];
        const b = snapped[(i + 1) % anchorsN];
        if (!a || !b) { failed = true; failReason = 'missing anchor snaps'; break; }
        try {
          const res = await engine.computeRouteOrdered([a, b], { preserveCoverage: true, towers });
          if (!res || !res.coords || res.coords.length === 0) { failed = true; failReason = 'no route from osrm between anchors'; break; }
          // store res
          segments.push({ coords: res.coords, distance: res.distance, duration: res.duration });
        } catch (e: any) {
          failed = true; failReason = String(e?.message ?? e);
          break;
        }
      }

      diagnostics.push({ anchorsN, radiusTried: r, segmentsCount: segments.length, failed, failReason });

      if (failed) { r = Math.max(30, Math.floor(r * 0.8)); continue; }

      // assemble loop
      let loopCoords: LatLon[] = [];
      let loopDistance = 0;
      let loopDuration = 0;
      for (const s of segments) {
        if (loopCoords.length > 0) loopCoords = loopCoords.concat(s.coords.slice(1)); else loopCoords = s.coords.slice();
        loopDistance += s.distance;
        loopDuration += s.duration;
      }

      // final coverage check
      if (!isGeometryInsideCoverage(loopCoords, towers, 20)) {
        diagnostics.push({ reason: 'geometry not inside coverage', radiusTried: r });
        r = Math.max(30, Math.floor(r * 0.8));
        continue;
      }

      const repeats = Math.max(1, Math.ceil(durationSeconds / Math.max(1, loopDuration)));
      let finalCoords: LatLon[] = [];
      for (let k = 0; k < repeats; k++) finalCoords = finalCoords.concat(loopCoords);

      return { ok: true, route: finalCoords, loopDistance, loopDuration, radiusUsed: r, diagnostics };
    }
  }

  return { ok: false, error: 'unable to compute patrol route within coverage', diagnostics };
}

export default computePatrolRoute;
