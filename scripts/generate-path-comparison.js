#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildAdjacency(nodes, thresholdMeters = 1000) {
  const adj = new Map();
  for (const a of nodes) {
    const arr = [];
    for (const b of nodes) {
      if (a.id === b.id) continue;
      const d = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
      if (d <= thresholdMeters) arr.push(b.id);
    }
    adj.set(a.id, arr);
  }
  return adj;
}

function bfs(adj, start, goal) {
  const q = [start];
  const prev = new Map();
  prev.set(start, null);
  while (q.length) {
    const u = q.shift();
    if (u === goal) break;
    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (!prev.has(v)) {
        prev.set(v, u);
        q.push(v);
      }
    }
  }
  if (!prev.has(goal)) return null;
  const path = [];
  let cur = goal;
  while (cur !== null) {
    path.push(cur);
    cur = prev.get(cur) ?? null;
  }
  return path.reverse();
}

function dijkstra(nodes, adj, start, goal) {
  const dist = new Map();
  const prev = new Map();
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    dist.set(n.id, Infinity);
    prev.set(n.id, null);
  }
  dist.set(start, 0);
  const visited = new Set();
  while (true) {
    let u = null;
    let best = Infinity;
    for (const [id, d] of dist.entries()) {
      if (visited.has(id)) continue;
      if (d < best) { best = d; u = id; }
    }
    if (u === null) break;
    if (u === goal) break;
    visited.add(u);
    const neighbors = adj.get(u) || [];
    const un = idToNode.get(u);
    for (const v of neighbors) {
      if (visited.has(v)) continue;
      const vn = idToNode.get(v);
      const w = haversineMeters(un.latitude, un.longitude, vn.latitude, vn.longitude);
      const alt = (dist.get(u) || Infinity) + w;
      if (alt < (dist.get(v) || Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
      }
    }
  }
  if ((dist.get(goal) || Infinity) === Infinity) return null;
  const path = [];
  let cur = goal;
  while (cur !== null) {
    path.push(cur);
    cur = prev.get(cur) ?? null;
  }
  return path.reverse();
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const startId = 1;
  const goalId = 2;
  const threshold = 1000;
  const client = await pool.connect();
  try {
    const res = await client.query('select id, latitude::text as latitude, longitude::text as longitude from "Waypoint"');
    const nodes = res.rows.map(r => ({ id: Number(r.id), latitude: Number(r.latitude), longitude: Number(r.longitude) }))
      .filter(r => !Number.isNaN(r.latitude) && !Number.isNaN(r.longitude));
    const adj = buildAdjacency(nodes, threshold);
    const pathBfs = bfs(adj, startId, goalId);
    const pathDij = dijkstra(nodes, adj, startId, goalId);
    const idToNode = new Map(nodes.map(n => [n.id, n]));
    const coordsBfs = pathBfs ? pathBfs.map(id => idToNode.get(id)).filter(Boolean) : [];
    const coordsDij = pathDij ? pathDij.map(id => idToNode.get(id)).filter(Boolean) : [];
    if (coordsBfs.length===0 && coordsDij.length===0) {
      console.error('no path found');
      process.exit(1);
    }
    const allCoords = [...coordsBfs, ...coordsDij];
    const lats = allCoords.map(p => p.latitude);
    const lons = allCoords.map(p => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const width = 1200, height = 600;
    const proj = p => {
      const x = (p.longitude - minLon) / (maxLon - minLon || 1) * width;
      const y = height - (p.latitude - minLat) / (maxLat - minLat || 1) * height;
      return [x,y];
    };
    const line = coords => coords.map(c => proj(c).join(',')).join(' ');
    const svg = [];
    svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`);
    svg.push(`<rect width="100%" height="100%" fill="white"/>`);
    if (coordsDij.length) svg.push(`<polyline points="${line(coordsDij)}" fill="none" stroke="#2563eb" stroke-width="4" opacity="0.9"/>`);
    if (coordsBfs.length) svg.push(`<polyline points="${line(coordsBfs)}" fill="none" stroke="#ef4444" stroke-width="4" opacity="0.7"/>`);
    if (coordsDij.length) {
      const [sx, sy] = proj(coordsDij[0]);
      const [ex, ey] = proj(coordsDij[coordsDij.length-1]);
      svg.push(`<circle cx="${sx}" cy="${sy}" r="6" fill="#10b981"/>`);
      svg.push(`<circle cx="${ex}" cy="${ey}" r="6" fill="#f59e0b"/>`);
    }
    svg.push(`<g font-family="sans-serif" font-size="12">`);
    svg.push(`<text x="10" y="20" fill="#2563eb">Dijkstra</text>`);
    svg.push(`<text x="10" y="36" fill="#ef4444">BFS</text>`);
    svg.push(`</g>`);
    svg.push(`</svg>`);
    const out = path.join(process.cwd(), 'public', 'path-comparison.svg');
    fs.writeFileSync(out, svg.join('\n'), 'utf8');
    console.log('Wrote', out);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
