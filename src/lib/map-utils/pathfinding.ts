import { manhattanDistance, haversineMeters } from "./geometry";

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
  adj: Map<string, string[]>,
) {
  const distances = new Map<string, number>();
  const prev = new Map<string, string | null>();
  // Priority queue stores [key, priority], where priority is f(n) = g(n) + h(n)
  const pq: [string, number][] = [];
  const visited = new Set<string>();

  for (const key of nodes.keys()) {
    distances.set(key, Infinity);
    prev.set(key, null);
  }

  distances.set(startKey, 0);
  const endNode = nodes.get(endKey)!;
  const startNode = nodes.get(startKey)!;

  pq.push([startKey, manhattanDistance(startNode.lat, startNode.lon, endNode.lat, endNode.lon)]);

  while (pq.length > 0) {
    // Sort to get the node with the lowest priority
    pq.sort((a, b) => a[1] - b[1]);
    const [currentKey] = pq.shift()!;

    if (visited.has(currentKey)) {
      continue;
    }
    visited.add(currentKey);

    if (currentKey === endKey) {
      break; // Path found
    }

    const neighbors = adj.get(currentKey) || [];
    const currentNode = nodes.get(currentKey)!;
    const currentDistance = distances.get(currentKey)!;

    for (const neighborKey of neighbors) {
      if (visited.has(neighborKey)) {
        continue;
      }

      const neighborNode = nodes.get(neighborKey)!;
      // g(n): Actual distance from start to neighbor
      const weight = haversineMeters(currentNode.lat, currentNode.lon, neighborNode.lat, neighborNode.lon);
      const newDist = currentDistance + weight;

      if (newDist < (distances.get(neighborKey) ?? Infinity)) {
        distances.set(neighborKey, newDist);
        prev.set(neighborKey, currentKey);

        // h(n): Heuristic distance from neighbor to end
        const priority = newDist + manhattanDistance(neighborNode.lat, neighborNode.lon, endNode.lat, endNode.lon);
        pq.push([neighborKey, priority]);
      }
    }
  }

  // Reconstruct the path from end to start
  const path: { lat: number; lon: number }[] = [];
  let currentKey: string | null = endKey;
  while (currentKey) {
    const node = nodes.get(currentKey);
    if (node) {
      path.unshift({ lat: node.lat, lon: node.lon });
    }
    currentKey = prev.get(currentKey) ?? null;
  }

  // If the path starts at the end node, a path was found
  if (path.length > 0 && path[0].lat === nodes.get(endKey)!.lat && path[0].lon === nodes.get(endKey)!.lon) {
    // This check is a bit redundant given the loop condition, but ensures we don't return a partial path
  }

  return path.length > 0 && prev.has(endKey) ? path : [];
}
