import { haversineMeters } from "./map-helpers";

const SPEED_METERS_PER_SECOND = 1000; // 25 meters per second
const STEP_DURATION = 50; // 50ms per animation step

/**
 * BFS pathfinding to find a path from start to target along road network
 * Only considers roads within tower coverage
 * Returns the full path including start position -> nearest road -> path -> target nearest road
 */
/* findPathBFS removed — use findPathBidirectionalDijkstra for weighted shortest paths by distance */

/**
 * Bidirectional Dijkstra pathfinding (weighted shortest path by distance).
 * Returns full path including potential move-to-road and final move off-road, similar to BFS behavior.
 */
export function findPathBidirectionalDijkstra(
  startLat: number,
  startLng: number,
  targetLat: number,
  targetLng: number,
  nodes: Map<string, { lat: number; lon: number; inCoverage: boolean }>,
  adj: Map<string, Array<{ to: string; weight: number }>>,
): { lat: number; lon: number }[] {
  // Snap start & end to nearest in-coverage nodes
  const startResult = findNearestNodeInCoverage(startLat, startLng, nodes);
  const endResult = findNearestNodeInCoverage(targetLat, targetLng, nodes);

  if (!startResult) {
    console.log("Dijkstra: Could not find start node in coverage");
    return [];
  }
  if (!endResult) {
    console.log("Dijkstra: Could not find end node in coverage");
    return [];
  }

  const startKey = startResult.nodeKey;
  const endKey = endResult.nodeKey;

  if (startKey === endKey) {
    // Same node - just go direct (including start/end offset if needed)
    const node = nodes.get(startKey)!;
    const path = [{ lat: node.lat, lon: node.lon }];
    if (endResult.distance > 10) path.push({ lat: targetLat, lon: targetLng });
    if (startResult.distance > 10)
      path.unshift({ lat: startLat, lon: startLng });
    return path;
  }

  // Min-heap priority queue
  class MinHeap {
    heap: Array<{ key: string; dist: number }>;
    index: Map<string, number>;
    constructor() {
      this.heap = [];
      this.index = new Map();
    }
    size() {
      return this.heap.length;
    }
    peekDist(): number {
      return this.heap.length > 0 ? this.heap[0].dist : Infinity;
    }
    push(key: string, dist: number) {
      const node = { key, dist };
      this.heap.push(node);
      this.index.set(key, this.heap.length - 1);
      this._siftUp(this.heap.length - 1);
    }
    pop() {
      if (this.heap.length === 0) return null;
      const top = this.heap[0];
      const last = this.heap.pop()!;
      this.index.delete(top.key);
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this.index.set(last.key, 0);
        this._siftDown(0);
      }
      return top;
    }
    decrease(key: string, dist: number) {
      const idx = this.index.get(key);
      if (idx === undefined) {
        this.push(key, dist);
        return;
      }
      if (dist < this.heap[idx].dist) {
        this.heap[idx].dist = dist;
        this._siftUp(idx);
      }
    }
    _siftUp(i: number) {
      while (i > 0) {
        const p = Math.floor((i - 1) / 2);
        if (this.heap[p].dist <= this.heap[i].dist) break;
        this._swap(i, p);
        i = p;
      }
    }
    _siftDown(i: number) {
      const n = this.heap.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this.heap[l].dist < this.heap[smallest].dist) smallest = l;
        if (r < n && this.heap[r].dist < this.heap[smallest].dist) smallest = r;
        if (smallest === i) break;
        this._swap(i, smallest);
        i = smallest;
      }
    }
    _swap(a: number, b: number) {
      const A = this.heap[a];
      const B = this.heap[b];
      this.heap[a] = B;
      this.heap[b] = A;
      this.index.set(A.key, b);
      this.index.set(B.key, a);
    }
  }

  // edge weights are provided by the weighted adjacency list (adj) returned from buildGraph
  // (no on-the-fly haversine computation here)

  // Data structures
  const distF = new Map<string, number>();
  const distB = new Map<string, number>();
  const prevF = new Map<string, string | null>();
  const prevB = new Map<string, string | null>();
  const visitedF = new Set<string>();
  const visitedB = new Set<string>();

  const pqF = new MinHeap();
  const pqB = new MinHeap();

  distF.set(startKey, 0);
  prevF.set(startKey, null);
  pqF.push(startKey, 0);

  distB.set(endKey, 0);
  prevB.set(endKey, null);
  pqB.push(endKey, 0);

  let bestMeet: string | null = null;
  let bestDist = Infinity;

  // Main loop: expand alternately or the smaller frontier
  while (pqF.size() > 0 && pqB.size() > 0) {
    // Expand forward frontier
    const topF = pqF.pop();
    if (topF) {
      const u = topF.key;
      const du = topF.dist;
      if (du <= (distF.get(u) ?? Infinity)) {
        visitedF.add(u);
        if (visitedB.has(u)) {
          const total = (distF.get(u) ?? Infinity) + (distB.get(u) ?? Infinity);
          if (total < bestDist) {
            bestDist = total;
            bestMeet = u;
          }
        }
        const neighbors = adj.get(u);
        if (neighbors) {
          for (const nb of neighbors) {
            const v = nb.to;
            const w = nb.weight;
            if (!nodes.has(v)) continue;
            if (!nodes.get(v)!.inCoverage) continue;
            const alt = du + w;
            if (alt < (distF.get(v) ?? Infinity)) {
              distF.set(v, alt);
              prevF.set(v, u);
              pqF.decrease(v, alt);
            }
          }
        }
      }
    }

    // Expand backward frontier
    const topB = pqB.pop();
    if (topB) {
      const u = topB.key;
      const du = topB.dist;
      if (du <= (distB.get(u) ?? Infinity)) {
        visitedB.add(u);
        if (visitedF.has(u)) {
          const total = (distF.get(u) ?? Infinity) + (distB.get(u) ?? Infinity);
          if (total < bestDist) {
            bestDist = total;
            bestMeet = u;
          }
        }
        const neighbors = adj.get(u);
        if (neighbors) {
          for (const nb of neighbors) {
            const v = nb.to;
            const w = nb.weight;
            if (!nodes.has(v)) continue;
            if (!nodes.get(v)!.inCoverage) continue;
            const alt = du + w;
            if (alt < (distB.get(v) ?? Infinity)) {
              distB.set(v, alt);
              prevB.set(v, u);
              pqB.decrease(v, alt);
            }
          }
        }
      }
    }

    // Termination condition: lower bounds can't beat bestDist
    const minF = pqF.peekDist();
    const minB = pqB.peekDist();
    if (minF + minB >= bestDist) break;
  }

  if (bestMeet === null) {
    console.log("Dijkstra: no meeting point found");
    return [];
  }

  // Reconstruct path: start -> ... -> meet
  const pathF: string[] = [];
  let cur: string | null = bestMeet;
  while (cur !== null) {
    pathF.push(cur);
    cur = prevF.get(cur) ?? null;
  }
  pathF.reverse(); // now start ... meet

  // Reconstruct meet -> ... -> end using prevB
  const pathB: string[] = [];
  cur = prevB.get(bestMeet) ?? null; // skip bestMeet to avoid duplicate
  while (cur !== null) {
    pathB.push(cur);
    cur = prevB.get(cur) ?? null;
  }

  const nodePath = [...pathF, ...pathB]; // keys from start -> end

  // Convert to coordinates
  const result: { lat: number; lon: number }[] = nodePath.map((k) => {
    const n = nodes.get(k)!;
    return { lat: n.lat, lon: n.lon };
  });

  // Add exact end / start offsets if necessary (consistent with BFS behavior)
  if (endResult.distance > 10) {
    result.push({ lat: targetLat, lon: targetLng });
  }
  if (startResult.distance > 10) {
    result.unshift({ lat: startLat, lon: startLng });
  }

  return result;
}

/**
 * Find the nearest node that is within tower coverage
 * Returns both the node key and the distance
 */
export function findNearestNodeInCoverage(
  lat: number,
  lon: number,
  nodes: Map<string, { lat: number; lon: number; inCoverage: boolean }>,
  maxDistance: number = 5000, // Accept nodes within 5km
): {
  nodeKey: string;
  distance: number;
  node: { lat: number; lon: number };
} | null {
  let nearest: string | null = null;
  let minDist = Infinity;

  for (const [key, node] of nodes.entries()) {
    if (!node.inCoverage) continue;

    const dist = haversineMeters(lat, lon, node.lat, node.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = key;
    }
  }

  if (nearest && minDist < maxDistance) {
    const node = nodes.get(nearest)!;
    return {
      nodeKey: nearest,
      distance: minDist,
      node: { lat: node.lat, lon: node.lon },
    };
  }
  return null;
}

/**
 * Animate drone movement along a path
 */
export function animateDroneAlongPath(
  droneMarker: {
    getLatLng: () => { lat: number; lng: number };
    setLatLng: (pos: [number, number] | { lat: number; lng: number }) => void;
  },
  path: { lat: number; lon: number }[],
  onComplete: () => void,
) {
  if (path.length === 0) {
    onComplete();
    return;
  }

  const startPos = droneMarker.getLatLng();

  // Add current position as first point if not already in path
  const fullPath = [{ lat: startPos.lat, lon: startPos.lng }, ...path];

  const animateSegment = (fromIndex: number, toIndex: number) => {
    if (toIndex >= fullPath.length) {
      onComplete();
      return;
    }

    const from = fullPath[fromIndex];
    const to = fullPath[toIndex];

    // Calculate distance and time needed
    const distance = haversineMeters(from.lat, from.lon, to.lat, to.lon);
    const duration = (distance / SPEED_METERS_PER_SECOND) * 1000; // in milliseconds
    const steps = Math.max(Math.floor(duration / STEP_DURATION), 1);

    let currentStep = 0;

    const animate = () => {
      currentStep++;
      const progress = currentStep / steps;

      const lat = from.lat + (to.lat - from.lat) * progress;
      const lng = from.lon + (to.lon - from.lon) * progress;

      droneMarker.setLatLng([lat, lng]);

      if (currentStep < steps) {
        setTimeout(animate, STEP_DURATION);
      } else {
        // Move to next segment
        animateSegment(toIndex, toIndex + 1);
      }
    };

    animate();
  };

  // Start animation from first to second point
  animateSegment(0, 1);
}
