/* Client-side patrol planner (Dijkstra over local waypoints) */
import { haversineMeters as _haversine } from "./map-utils/geometry";

type LatLon = { lat: number; lon: number };

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  return _haversine(aLat, aLon, bLat, bLon);
}

function toRad(d: number) { return (d * Math.PI) / 180; }
function toDeg(r: number) { return (r * 180) / Math.PI; }

function pointOnCircle(center: LatLon, radiusMeters: number, angleDeg: number): LatLon {
  const R = 6371000;
  const ang = toRad(angleDeg);
  const dByR = radiusMeters / R;
  const lat1 = toRad(center.lat);
  const lon1 = toRad(center.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(ang));
  const lon2 = lon1 + Math.atan2(Math.sin(ang) * Math.sin(dByR) * Math.cos(lat1), Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lon: toDeg(lon2) };
}

class MinHeap {
  heap: Array<{key:number, val:number}> = [];
  push(k:number, v:number) { this.heap.push({key:k,val:v}); this._siftUp(); }
  pop(): {key:number, val:number} | null { if (this.heap.length===0) return null; const top=this.heap[0]; const last=this.heap.pop()!; if(this.heap.length>0){this.heap[0]=last; this._siftDown();} return top; }
  _siftUp(){ let i=this.heap.length-1; while(i>0){ const p=Math.floor((i-1)/2); if(this.heap[p].val<=this.heap[i].val) break; [this.heap[p], this.heap[i]]=[this.heap[i], this.heap[p]]; i=p; } }
  _siftDown(){ let i=0; const n=this.heap.length; while(true){ let l=2*i+1, r=2*i+2, smallest=i; if(l<n && this.heap[l].val < this.heap[smallest].val) smallest=l; if(r<n && this.heap[r].val < this.heap[smallest].val) smallest=r; if(smallest===i) break; [this.heap[i], this.heap[smallest]]=[this.heap[smallest], this.heap[i]]; i=smallest; } }
}

function dijkstra(graph: Map<number, Array<{to:number,weight:number}>>, start: number, goal: number) {
  const dist = new Map<number, number>();
  const prev = new Map<number, number | null>();
  const heap = new MinHeap();
  dist.set(start, 0);
  prev.set(start, null);
  heap.push(start, 0);
  while(true){ const popped = heap.pop(); if(!popped) break; const u = popped.key; const d = popped.val; if(d !== dist.get(u)) continue; if(u === goal) break;
    const neighbors = graph.get(u) || [];
    for(const nb of neighbors){ const alt = d + nb.weight; if(!dist.has(nb.to) || alt < (dist.get(nb.to) as number)){ dist.set(nb.to, alt); prev.set(nb.to, u); heap.push(nb.to, alt); } }
  }
  if(!dist.has(goal)) return null;
  const path: number[] = []; let cur: number | null = goal; while(cur !== null){ path.push(cur); cur = prev.get(cur) ?? null; } path.reverse(); return path;
}

export async function computePatrolRouteClient(center: LatLon, radiusMeters: number, opts: {
  anchors?: number;
  edgeThresholdMeters?: number;
  maxNodes?: number;
  droneSpeed?: number;
  waypoints: Array<{ id:number; latitude:number; longitude:number }>
  aerialFallback?: boolean;
}) {
  const anchorsN = opts?.anchors ?? 6;
  const edgeThreshold = opts?.edgeThresholdMeters ?? 300;
  const maxNodes = opts?.maxNodes ?? 500;
  const droneSpeed = opts?.droneSpeed ?? 10;
  const waypoints = opts.waypoints ?? [];

  // bbox
  const latDegPerMeter = 1/111111;
  const lonDegPerMeter = 1/(111111 * Math.cos(toRad(center.lat) || 1));
  const latDelta = (radiusMeters * 1.5) * latDegPerMeter;
  const lonDelta = (radiusMeters * 1.5) * lonDegPerMeter;
  const minLat = center.lat - latDelta; const maxLat = center.lat + latDelta; const minLon = center.lon - lonDelta; const maxLon = center.lon + lonDelta;

  // filter candidate waypoints from provided list
  let candidates = (waypoints || []).filter((w:any) => {
    const la = Number(w.latitude); const lo = Number(w.longitude);
    if(Number.isNaN(la) || Number.isNaN(lo)) return false;
    return la >= minLat && la <= maxLat && lo >= minLon && lo <= maxLon;
  });

  candidates.sort((a:any,b:any) => {
    const da = haversineMeters(center.lat, center.lon, Number(a.latitude), Number(a.longitude));
    const db = haversineMeters(center.lat, center.lon, Number(b.latitude), Number(b.longitude));
    return da - db;
  });
  const limited = candidates.slice(0, maxNodes);
  const nodes: { id:number, lat:number, lon:number }[] = limited.map((r:any) => ({ id: Number(r.id), lat: Number(r.latitude), lon: Number(r.longitude) }));
  if(nodes.length < 3) {
    if(opts.aerialFallback) {
      // build circular polyline
      const pts: LatLon[] = [];
      const samples = 32;
      for(let i=0;i<samples;i++) pts.push(pointOnCircle(center, radiusMeters, (360/samples)*i));
      let loopDistance = 0; for(let i=0;i<pts.length;i++){ const a=pts[i]; const b=pts[(i+1)%pts.length]; loopDistance += haversineMeters(a.lat,a.lon,b.lat,b.lon); }
      const loopDuration = loopDistance / Math.max(0.1, droneSpeed);
      return { ok: true, route: pts, loopDistance, loopDuration, diagnostics: { nodes: nodes.length, candidates: candidates.length } };
    }
    return { ok: false, error: 'insufficient waypoints for dijkstra patrol', diagnostics: { nodes: nodes.length, candidates: candidates.length } };
  }

  // build adjacency
  const graph = new Map<number, Array<{to:number, weight:number}>>();
  for(let i=0;i<nodes.length;i++){
    const a = nodes[i];
    for(let j=i+1;j<nodes.length;j++){
      const b = nodes[j];
      const d = haversineMeters(a.lat, a.lon, b.lat, b.lon);
      if(d <= edgeThreshold){ if(!graph.has(a.id)) graph.set(a.id, []); if(!graph.has(b.id)) graph.set(b.id, []); graph.get(a.id)!.push({ to: b.id, weight: d }); graph.get(b.id)!.push({ to: a.id, weight: d }); }
    }
  }

  const anchors: LatLon[] = [];
  for(let i=0;i<anchorsN;i++) anchors.push(pointOnCircle(center, radiusMeters, (360/anchorsN)*i));
  const snappedNodes: Array<number | null> = anchors.map(a => {
    let bestId: number | null = null; let bestD = Infinity;
    for(const n of nodes){ const d = haversineMeters(a.lat, a.lon, n.lat, n.lon); if(d < bestD){ bestD = d; bestId = n.id; }}
    if(bestD <= edgeThreshold * 1.2) return bestId; return null;
  });

  const validAnchors = snappedNodes.filter(x=>x!==null) as number[];
  if(validAnchors.length < 3) return { ok: false, error: 'insufficient snapped anchors for dijkstra patrol', diagnostics: { snapped: snappedNodes } };

  const routeCoords: LatLon[] = [];
  for(let i=0;i<validAnchors.length;i++){
    const aId = validAnchors[i];
    const bId = validAnchors[(i+1) % validAnchors.length];
    if(aId === null || bId === null) continue;
    const path = dijkstra(graph, aId, bId);
    if(!path || path.length === 0){ const aNode = nodes.find(n=>n.id===aId); const bNode = nodes.find(n=>n.id===bId); if(aNode && bNode){ if(routeCoords.length===0 || routeCoords[routeCoords.length-1].lat !== aNode.lat || routeCoords[routeCoords.length-1].lon !== aNode.lon) routeCoords.push({lat: aNode.lat, lon: aNode.lon}); routeCoords.push({lat: bNode.lat, lon: bNode.lon}); } continue; }
    for(const nid of path){ const n = nodes.find(x=>x.id===nid); if(!n) continue; if(routeCoords.length===0 || routeCoords[routeCoords.length-1].lat !== n.lat || routeCoords[routeCoords.length-1].lon !== n.lon) routeCoords.push({ lat: n.lat, lon: n.lon }); }
  }

  if(routeCoords.length < 3) return { ok: false, error: 'computed route too small', diagnostics: { routeLen: routeCoords.length } };

  let loopDistance = 0; for(let i=0;i<routeCoords.length;i++){ const a = routeCoords[i]; const b = routeCoords[(i+1)%routeCoords.length]; loopDistance += haversineMeters(a.lat,a.lon,b.lat,b.lon); }
  const loopDuration = loopDistance / Math.max(0.1, droneSpeed);

  return { ok: true, route: routeCoords, loopDistance, loopDuration, diagnostics: { nodes: nodes.length, anchorsSnapped: validAnchors.length } };
}

export default computePatrolRouteClient;
