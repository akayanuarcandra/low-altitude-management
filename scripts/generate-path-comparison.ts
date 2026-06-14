#!/usr/bin/env ts-node
import fs from "fs";
import path from "path";
import { db } from "./../src/lib/db";
import { waypoints } from "./../src/lib/schema";
import { desc } from "drizzle-orm";
import { buildAdjacency, bfs, dijkstra } from "./../src/lib/graph-paths";

async function main() {
  const startId = 1;
  const goalId = 2;
  const threshold = 1000; // meters

  const rows = await db.select().from(waypoints).orderBy(desc(waypoints.createdAt));
  const nodes = rows
    .map((r: any) => ({ id: r.id, latitude: Number(r.latitude), longitude: Number(r.longitude) }))
    .filter((r: any) => !Number.isNaN(r.latitude) && !Number.isNaN(r.longitude));

  const adj = buildAdjacency(nodes, threshold);
  const pathBfs = bfs(adj, startId, goalId);
  const pathDij = dijkstra(nodes, adj, startId, goalId);

  if (!pathBfs && !pathDij) {
    console.error("No path found by either algorithm");
    process.exit(1);
  }

  // Build coordinate arrays
  const idToNode = new Map(nodes.map((n: any) => [n.id, n]));
  const coordsBfs = pathBfs ? pathBfs.map((id) => idToNode.get(id)) : [];
  const coordsDij = pathDij ? pathDij.map((id) => idToNode.get(id)) : [];

  const allCoords = [...coordsBfs, ...coordsDij].filter(Boolean) as { latitude: number; longitude: number }[];
  const lats = allCoords.map((p) => p.latitude);
  const lons = allCoords.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const width = 1200;
  const height = 600;

  const proj = (p: { latitude: number; longitude: number }) => {
    const x = (p.longitude - minLon) / (maxLon - minLon || 1) * width;
    const y = height - (p.latitude - minLat) / (maxLat - minLat || 1) * height;
    return [x, y];
  };

  const line = (coords: any[]) => coords.map((c) => proj(c).join(",")).join(" ");

  const svgParts: string[] = [];
  svgParts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`);
  svgParts.push(`<rect width="100%" height="100%" fill="white"/>`);
  if (coordsDij.length) svgParts.push(`<polyline points="${line(coordsDij)}" fill="none" stroke="#2563eb" stroke-width="4" opacity="0.9"/>`);
  if (coordsBfs.length) svgParts.push(`<polyline points="${line(coordsBfs)}" fill="none" stroke="#ef4444" stroke-width="4" opacity="0.7"/>`);
  // markers
  if (coordsDij.length) {
    const [sx, sy] = proj(coordsDij[0]);
    const [ex, ey] = proj(coordsDij[coordsDij.length - 1]);
    svgParts.push(`<circle cx="${sx}" cy="${sy}" r="6" fill="#10b981"/>`);
    svgParts.push(`<circle cx="${ex}" cy="${ey}" r="6" fill="#f59e0b"/>`);
  }
  svgParts.push(`<g font-family="sans-serif" font-size="12">`);
  svgParts.push(`<text x="10" y="20" fill="#2563eb">Dijkstra</text>`);
  svgParts.push(`<text x="10" y="36" fill="#ef4444">BFS</text>`);
  svgParts.push(`</g>`);
  svgParts.push(`</svg>`);

  const out = path.join(process.cwd(), "public", "path-comparison.svg");
  fs.writeFileSync(out, svgParts.join("\n"), "utf8");
  console.log("Wrote", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
