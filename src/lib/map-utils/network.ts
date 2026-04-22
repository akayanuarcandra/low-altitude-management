import { TowerDTO } from "@/components/map/types";
import { isWithinTowerCoverage, haversineMeters } from "./geometry";

const MAX_BOUNDS_SPAN_DEG = 0.2;
const REQUEST_TIMEOUT_MS = 25000;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

function clampBounds(bounds: {
  getSouth: () => number;
  getWest: () => number;
  getNorth: () => number;
  getEast: () => number;
}) {
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();

  const latSpan = north - south;
  const lonSpan = east - west;
  if (latSpan <= MAX_BOUNDS_SPAN_DEG && lonSpan <= MAX_BOUNDS_SPAN_DEG) {
    return { south, west, north, east };
  }

  const latCenter = (south + north) / 2;
  const lonCenter = (west + east) / 2;
  const halfLat = Math.min(latSpan, MAX_BOUNDS_SPAN_DEG) / 2;
  const halfLon = Math.min(lonSpan, MAX_BOUNDS_SPAN_DEG) / 2;

  return {
    south: latCenter - halfLat,
    north: latCenter + halfLat,
    west: lonCenter - halfLon,
    east: lonCenter + halfLon,
  };
}

async function fetchWithTimeout(url: string, body: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches road network data from the Overpass API for a given map bounds.
 */
export async function getRoadNetwork(bounds: {
  getSouth: () => number;
  getWest: () => number;
  getNorth: () => number;
  getEast: () => number;
}) {
  const clamped = clampBounds(bounds);

  // Query for ways (roads) within the bounding box
  const query = `
    [out:json][timeout:25];
    (
      way["highway"](
        ${clamped.south},
        ${clamped.west},
        ${clamped.north},
        ${clamped.east}
      );
    );
    out geom;
  `;
  const body = "data=" + encodeURIComponent(query);

  // Simple sessionStorage-backed cache to reduce repeated Overpass calls
  const CACHE_TTL = 1000 * 60 * 10; // 10 minutes
  type CacheEntry = { ts: number; data: unknown };
  function cacheKeyForBounds(c: {
    south: number;
    west: number;
    north: number;
    east: number;
  }) {
    return `overpass_${c.south.toFixed(4)}_${c.west.toFixed(4)}_${c.north.toFixed(4)}_${c.east.toFixed(4)}`;
  }

  // Try cached result first
  try {
    const key = cacheKeyForBounds(clamped);
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.ts < CACHE_TTL) {
          console.log("Using cached Overpass data for", key);
          return entry.data;
        } else {
          sessionStorage.removeItem(key);
        }
      }
    }
  } catch (err: unknown) {
    // sessionStorage may throw in some environments (SSR / blocked), ignore cache if it does
    const errMsg =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message?: unknown }).message)
        : String(err);
    console.warn("Overpass cache read error", errMsg);
  }

  // Try endpoints with retries and backoff, rotate through endpoints
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        console.log(
          `Overpass: fetching from ${endpoint} (attempt ${attempt + 1})`,
        );
        const response = await fetchWithTimeout(endpoint, body);
        if (!response.ok) {
          console.warn(
            `Overpass API ${endpoint} returned ${response.status} ${response.statusText}`,
          );
          // For server errors, 429 or 504, backoff and retry this endpoint
          if (
            response.status === 504 ||
            response.status === 429 ||
            response.status >= 500
          ) {
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            continue;
          } else {
            // Unrecoverable client error for this endpoint/query; break attempts and try next endpoint
            break;
          }
        }

        const json: unknown = await response.json();

        // Cache the successful result
        try {
          const key = cacheKeyForBounds(clamped);
          const entry: CacheEntry = { ts: Date.now(), data: json };
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(key, JSON.stringify(entry));
          }
        } catch {
          // ignore cache write errors
        }

        return json;
      } catch (err: unknown) {
        // Network error or timeout (AbortError)
        let errName = String(err);
        if (typeof err === "object" && err !== null && "name" in err) {
          errName = String((err as { name?: unknown }).name ?? errName);
        }
        console.warn(
          `Overpass fetch error from ${endpoint} (attempt ${attempt + 1}):`,
          errName,
        );
        // small exponential-ish backoff and retry
        await new Promise((resolve) =>
          setTimeout(resolve, 600 + attempt * 700),
        );
        // continue to next attempt for the same endpoint
      }
    }
    // move to next endpoint after attempts exhausted for this one
  }

  console.error("Overpass API: all endpoints failed or timed out");
  return null;
}

/**
 * Builds a graph from the OSM road data.
 * Adds nodes with inCoverage flag and creates edges for roads.
 * An edge is added if at least one endpoint is in coverage.
 */
export function buildGraph(
  osmData: unknown,
  towers: TowerDTO[],
): {
  nodes: Map<string, { lat: number; lon: number; inCoverage: boolean }>;
  adj: Map<string, Array<{ to: string; weight: number }>>;
} {
  const nodes = new Map<
    string,
    { lat: number; lon: number; inCoverage: boolean }
  >();
  const adj = new Map<string, Array<{ to: string; weight: number }>>();

  const elements = (osmData as { elements?: unknown[] })?.elements ?? [];
  if (elements.length === 0) {
    console.error("BuildGraph: OSM data is invalid or empty.");
    return { nodes, adj };
  }

  // Helper to create unique node key from coordinates
  const getNodeKey = (lat: number, lon: number) => {
    return `${lat.toFixed(6)}_${lon.toFixed(6)}`;
  };

  // Add node to graph with coverage check
  const addNode = (lat: number, lon: number, inCoverage: boolean) => {
    const key = getNodeKey(lat, lon);
    if (!nodes.has(key)) {
      nodes.set(key, { lat, lon, inCoverage });
      adj.set(key, []); // initialize empty weighted adjacency list
    } else if (inCoverage) {
      const existing = nodes.get(key);
      if (existing && !existing.inCoverage) {
        existing.inCoverage = true;
      }
    }
    return key;
  };

  const addEdge = (uKey: string, vKey: string) => {
    if (uKey === vKey) return;
    const uNode = nodes.get(uKey);
    const vNode = nodes.get(vKey);
    if (!uNode || !vNode) return;
    // weight is the haversine distance between endpoints (meters)
    const weight = haversineMeters(uNode.lat, uNode.lon, vNode.lat, vNode.lon);
    const a = adj.get(uKey);
    if (a) a.push({ to: vKey, weight });
    const b = adj.get(vKey);
    if (b) b.push({ to: uKey, weight });
  };

  // Process each way (road)
  let segmentsInCoverage = 0;

  for (const element of elements) {
    const type = (element as { type?: string }).type;
    const geometry = (element as { geometry?: unknown }).geometry;
    if (type === "way" && Array.isArray(geometry)) {
      const geom = geometry as Array<Record<string, unknown>>;
      for (let i = 0; i < geom.length - 1; i++) {
        const u = geom[i];
        const v = geom[i + 1];

        const uLat = u.lat;
        const uLon = u.lon;
        const vLat = v.lat;
        const vLon = v.lon;

        if (
          typeof uLat === "number" &&
          typeof uLon === "number" &&
          typeof vLat === "number" &&
          typeof vLon === "number"
        ) {
          // Determine coverage more strictly: require both endpoints to be within tower coverage.
          const uInCoverage = isWithinTowerCoverage(uLat, uLon, towers);
          const vInCoverage = isWithinTowerCoverage(vLat, vLon, towers);

          // Mark nodes as inCoverage based on their actual endpoint coverage
          const uKey = addNode(uLat, uLon, uInCoverage);
          const vKey = addNode(vLat, vLon, vInCoverage);

          // Only connect nodes (add the road segment) if both endpoints are within coverage.
          if (uInCoverage && vInCoverage) {
            segmentsInCoverage++;
            addEdge(uKey, vKey);
          }
        }
      }
    }
  }

  const nodesInCoverage = Array.from(nodes.values()).filter(
    (n) => n.inCoverage,
  ).length;
  console.log(
    `Road network: ${nodesInCoverage} nodes in coverage, ${segmentsInCoverage} road segments`,
  );

  return { nodes, adj };
}
