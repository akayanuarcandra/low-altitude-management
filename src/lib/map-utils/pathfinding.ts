import { haversineMeters } from "./geometry";

/**
 * Finds the nearest node in the graph to a given latitude and longitude.
 */
export function findNearestNode(
  lat: number,
  lon: number,
  nodes: Map<string, { lat: number; lon: number }>,
): string | null {
  let nearestNodeKey: string | null = null;
  let minDistance = Infinity;

  for (const [key, node] of nodes.entries()) {
    // Use Haversine for accuracy in finding the closest real-world point
    const distance = haversineMeters(lat, lon, node.lat, node.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestNodeKey = key;
    }
  }
  return nearestNodeKey;
}

/**
 * Implements Dijkstra's algorithm to find the shortest path between two nodes in the graph.
 * Uses Manhattan distance as the heuristic for the priority queue.
 */
export function dijkstra(
  startKey: string,
  endKey: string,
  nodes: Map<string, { lat: number; lon: number }>,
  adj: Map<string, Array<{ to: string; weight: number }>>,
): { lat: number; lon: number }[] {
  // Use a binary min-heap for priority queue for efficiency
  class MinHeap {
    heap: Array<{ key: string; priority: number }> = [];
    index = new Map<string, number>();

    size() {
      return this.heap.length;
    }

    push(key: string, priority: number) {
      const node = { key, priority };
      this.heap.push(node);
      this.index.set(key, this.heap.length - 1);
      this._siftUp(this.heap.length - 1);
    }

    pop(): { key: string; priority: number } | null {
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

    decrease(key: string, priority: number) {
      const idx = this.index.get(key);
      if (idx === undefined) {
        this.push(key, priority);
        return;
      }
      if (priority < this.heap[idx].priority) {
        this.heap[idx].priority = priority;
        this._siftUp(idx);
      }
    }

    _siftUp(i: number) {
      while (i > 0) {
        const p = Math.floor((i - 1) / 2);
        if (this.heap[p].priority <= this.heap[i].priority) break;
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
        if (l < n && this.heap[l].priority < this.heap[smallest].priority)
          smallest = l;
        if (r < n && this.heap[r].priority < this.heap[smallest].priority)
          smallest = r;
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

  const distances = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const pq = new MinHeap();
  const visited = new Set<string>();

  // Initialize distances
  for (const key of nodes.keys()) {
    distances.set(key, Infinity);
    prev.set(key, null);
  }

  distances.set(startKey, 0);
  const startNode = nodes.get(startKey)!;
  const endNode = nodes.get(endKey)!;
  pq.push(
    startKey,
    haversineMeters(startNode.lat, startNode.lon, endNode.lat, endNode.lon),
  );

  while (pq.size() > 0) {
    const top = pq.pop();
    if (!top) break;
    const currentKey = top.key;
    const currentDist = top.priority;

    // stale entry check
    if (currentDist > (distances.get(currentKey) ?? Infinity)) continue;

    if (currentKey === endKey) {
      break; // found shortest distance to end
    }

    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    const neighbors = adj.get(currentKey) ?? [];
    for (const edge of neighbors) {
      const neighborKey = edge.to;
      const weight = edge.weight;

      if (!nodes.has(neighborKey)) continue;
      const alt = (distances.get(currentKey) ?? Infinity) + weight;
      if (alt < (distances.get(neighborKey) ?? Infinity)) {
        distances.set(neighborKey, alt);
        prev.set(neighborKey, currentKey);
        const neighborNode = nodes.get(neighborKey)!;
        const heur = haversineMeters(
          neighborNode.lat,
          neighborNode.lon,
          endNode.lat,
          endNode.lon,
        );
        pq.decrease(neighborKey, alt + heur);
      }
    }
  }

  // Reconstruct the path from end to start
  const path: { lat: number; lon: number }[] = [];
  let cur: string | null = endKey;
  while (cur) {
    const node = nodes.get(cur);
    if (node) {
      path.unshift({ lat: node.lat, lon: node.lon });
    }
    cur = prev.get(cur) ?? null;
  }

  return path.length > 0 &&
    (prev.get(endKey) !== undefined || endKey === startKey)
    ? path
    : [];
}
