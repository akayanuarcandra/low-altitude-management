export const OSRM_BASE = process.env.OSRM_BASE_URL || "http://router.project-osrm.org";

export type LatLon = { lat: number; lon: number };

async function safeFetchJson(
  url: string,
  timeoutMs = 20000,
  retries = 1,
): Promise<{ ok: boolean; status: number; json: unknown } | null> {
  // Simple retry loop with exponential backoff and jitter for transient errors
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const text = await res.text();
      try {
        return {
          ok: res.ok,
          status: res.status,
          json: text ? JSON.parse(text) : null,
        } as { ok: boolean; status: number; json: unknown };
      } catch {
        return { ok: res.ok, status: res.status, json: null } as {
          ok: boolean;
          status: number;
          json: unknown;
        };
      }
    } catch (err) {
      // If aborted or network error, we'll retry up to `retries` times
      if (attempt >= retries) throw err;
      const backoff = Math.min(1000 * 2 ** attempt, 5000);
      const jitter = Math.floor(Math.random() * 300);
      await new Promise((r) => setTimeout(r, backoff + jitter));
      attempt++;
    } finally {
      clearTimeout(id);
    }
  }
  return null;
}

/**
 * Call OSRM /route service for an ordered set of coordinates.
 * Points should be provided as [{lat, lon}, ...].
 * Returns { coords: Array<{lat, lon}>, distance, duration } on success.
 */
export async function osrmRoute(
  points: LatLon[],
  opts: { overview?: "full" | "simplified" | "false" } = { overview: "full" },
) {
  if (!points || points.length < 2)
    return { coords: [], distance: 0, duration: 0 };
  const coordStr = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const qs = new URLSearchParams({
    geometries: "geojson",
    overview: opts.overview ?? "full",
  });
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?${qs.toString()}`;

  const res = await safeFetchJson(url, 20000, 2);
  if (!res || !res.ok) {
    throw new Error(`OSRM route call failed (failed to fetch or non-ok response)`);
  }
  type OsrmRouteResponse = {
    code?: string;
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: Array<[number, number]> };
    }>;
  };

  const data = res.json as unknown as OsrmRouteResponse;
  if (!data || data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error(`OSRM route returned no route`);
  }

  const geom = data.routes![0].geometry;
  // geometry.coordinates is an array of [lon, lat]
  const coords = (geom && geom.coordinates ? geom.coordinates : []).map(
    (c: [number, number]) => ({ lat: c[1], lon: c[0] }),
  );
  const distance = Number(data.routes![0].distance ?? 0);
  const duration = Number(data.routes![0].duration ?? 0);
  return { coords, distance, duration, raw: data };
}

/**
 * Call OSRM /trip service to compute an optimized (TSP) route through points.
 * Options:
 *  - roundtrip: boolean (default true). If false, OSRM will return an open trip.
 *  - source: "first" | "last" | "any" - which coordinate should be treated as fixed source.
 */
export async function osrmTrip(
  points: LatLon[],
  opts: { roundtrip?: boolean; source?: "first" | "last" | "any" } = {},
) {
  if (!points || points.length < 2)
    return { coords: [], waypointOrder: [], distance: 0, duration: 0 };
  const coordStr = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const qs = new URLSearchParams({ geometries: "geojson", overview: "full" });
  if (opts.roundtrip === false) qs.set("roundtrip", "false");
  if (opts.source) qs.set("source", opts.source);

  const url = `${OSRM_BASE}/trip/v1/driving/${coordStr}?${qs.toString()}`;
  const res = await safeFetchJson(url, 20000, 2);
  if (!res || !res.ok) {
    throw new Error(`OSRM trip call failed (failed to fetch or non-ok response)`);
  }
  type OsrmTripResponse = {
    code?: string;
    trips?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: Array<[number, number]> };
    }>;
    waypoints?: Array<{ waypoint_index?: number }>;
  };

  const data = res.json as unknown as OsrmTripResponse;
  if (!data || data.code !== "Ok" || !data.trips || data.trips.length === 0) {
    throw new Error(`OSRM trip returned no trip`);
  }

  const trip = data.trips![0];
  const geom = trip.geometry; // geojson
  const coords = (geom && geom.coordinates ? geom.coordinates : []).map(
    (c: [number, number]) => ({ lat: c[1], lon: c[0] }),
  );
  const waypointOrder = Array.isArray(data.waypoints)
    ? data.waypoints.map((w) => w.waypoint_index ?? -1)
    : [];
  return {
    coords,
    waypointOrder,
    distance: Number(trip.distance ?? 0),
    duration: Number(trip.duration ?? 0),
    raw: data,
  };
}

/**
 * Call OSRM /nearest to snap a single coordinate to the nearest road point.
 * Returns { lat, lon } for the snapped point.
 */
export async function osrmNearest(point: LatLon) {
  const coordStr = `${point.lon},${point.lat}`;
  const url = `${OSRM_BASE}/nearest/v1/driving/${coordStr}?number=1&geometries=geojson`;
  const res = await safeFetchJson(url, 10000, 1);
  if (!res || !res.ok) {
    throw new Error(`OSRM nearest call failed (failed to fetch or non-ok response)`);
  }
  type OsrmNearestResponse = {
    code?: string;
    waypoints?: Array<{ location?: [number, number] }>;
  };
  const data = res.json as unknown as OsrmNearestResponse;
  if (!data || data.code !== "Ok" || !data.waypoints || data.waypoints.length === 0) {
    throw new Error(`OSRM nearest returned no waypoint`);
  }
  const loc = data.waypoints![0].location; // [lon, lat]
  return { lat: loc![1], lon: loc![0], raw: data };
}
