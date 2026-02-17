import { TowerDTO } from "@/components/map/types";
import { isWithinTowerCoverage, haversineMeters } from "./geometry";

const MAX_BOUNDS_SPAN_DEG = 0.2;
const REQUEST_TIMEOUT_MS = 12000;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

function clampBounds(bounds: any) {
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
export async function getRoadNetwork(bounds: any) {
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

  try {
    const body = "data=" + encodeURIComponent(query);
    for (const endpoint of OVERPASS_ENDPOINTS) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetchWithTimeout(endpoint, body);
          if (!response.ok) {
            console.error("Overpass API request failed:", response.statusText);
            await new Promise((resolve) => setTimeout(resolve, 600 + attempt * 700));
            continue;
          }
          return await response.json();
        } catch (error) {
          await new Promise((resolve) => setTimeout(resolve, 600 + attempt * 700));
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error fetching road network:", error);
    return null;
  }
}

/**
 * Builds a graph from the OSM road data.
 * Adds nodes with inCoverage flag and creates edges for roads.
 * An edge is added if at least one endpoint is in coverage.
 */
export function buildGraph(osmData: any, towers: TowerDTO[]) {
  const nodes = new Map<string, { lat: number; lon: number; inCoverage: boolean }>();
  const adj = new Map<string, Set<string>>();

  if (!osmData || !osmData.elements) {
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
      adj.set(key, new Set<string>());
    } else if (inCoverage) {
      const existing = nodes.get(key);
      if (existing && !existing.inCoverage) {
        existing.inCoverage = true;
      }
    }
    return key;
  };

  const addEdge = (uKey: string, vKey: string) => {
    if (uKey !== vKey) {
      adj.get(uKey)?.add(vKey);
      adj.get(vKey)?.add(uKey);
    }
  };

  // Process each way (road)
  let segmentsInCoverage = 0;

  for (const element of osmData.elements) {
    if (element.type === "way" && element.geometry && Array.isArray(element.geometry)) {
      for (let i = 0; i < element.geometry.length - 1; i++) {
        const u = element.geometry[i];
        const v = element.geometry[i + 1];

        if (u && v && u.lat && u.lon && v.lat && v.lon) {
          const midLat = (u.lat + v.lat) / 2;
          const midLon = (u.lon + v.lon) / 2;
          const segmentInCoverage = isWithinTowerCoverage(midLat, midLon, towers);

          // Add nodes, marking inCoverage if segment midpoint is covered
          const uKey = addNode(u.lat, u.lon, segmentInCoverage);
          const vKey = addNode(v.lat, v.lon, segmentInCoverage);

          // Connect nodes if the segment midpoint is within coverage
          if (segmentInCoverage) {
            segmentsInCoverage++;
            addEdge(uKey, vKey);
          }
        }
      }
    }
  }

  const nodesInCoverage = Array.from(nodes.values()).filter(n => n.inCoverage).length;
  console.log(`Road network: ${nodesInCoverage} nodes in coverage, ${segmentsInCoverage} road segments`);

  return { nodes, adj };
}
