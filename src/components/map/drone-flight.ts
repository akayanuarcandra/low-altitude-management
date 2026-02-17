import { haversineMeters } from "./map-helpers";

const SPEED_METERS_PER_SECOND = 1000; // 25 meters per second
const STEP_DURATION = 50; // 50ms per animation step

/**
 * BFS pathfinding to find a path from start to target along road network
 * Only considers roads within tower coverage
 * Returns the full path including start position -> nearest road -> path -> target nearest road
 */
export function findPathBFS(
    startLat: number,
    startLng: number,
    targetLat: number,
    targetLng: number,
    nodes: Map<string, { lat: number; lon: number; inCoverage: boolean }>,
    adj: Map<string, Set<string>>
): { lat: number; lon: number }[] {
    // Find nearest nodes to start and target positions
    const startResult = findNearestNodeInCoverage(startLat, startLng, nodes);
    const endResult = findNearestNodeInCoverage(targetLat, targetLng, nodes);

    if (!startResult) {
        console.log('Could not find start node in coverage');
        return [];
    }
    
    if (!endResult) {
        console.log('Could not find end node in coverage');
        return [];
    }

    console.log(`BFS: Moving to nearest road (${startResult.distance.toFixed(0)}m away)`);
    console.log(`BFS: Target is ${endResult.distance.toFixed(0)}m from nearest road`);

    const startNode = startResult.nodeKey;
    const endNode = endResult.nodeKey;

    // BFS to find path
    const queue: string[] = [startNode];
    const visited = new Set<string>([startNode]);
    const parent = new Map<string, string>();
    let found = false;

    while (queue.length > 0 && !found) {
        const current = queue.shift()!;
        
        if (current === endNode) {
            found = true;
            break;
        }

        const neighbors = adj.get(current);
        if (!neighbors) continue;

        for (const neighbor of neighbors) {
            const neighborNode = nodes.get(neighbor);
            // Only traverse nodes that are in coverage and not visited
            if (!neighborNode || !neighborNode.inCoverage || visited.has(neighbor)) {
                continue;
            }

            visited.add(neighbor);
            parent.set(neighbor, current);
            queue.push(neighbor);
        }
    }

    if (!found) {
        console.log(`BFS: No path found (visited ${visited.size} nodes)`);
        return [];
    }

    // Reconstruct path
    const roadPath: { lat: number; lon: number }[] = [];
    let current: string | undefined = endNode;
    
    while (current) {
        const node = nodes.get(current);
        if (node) {
            roadPath.unshift({ lat: node.lat, lon: node.lon });
        }
        current = parent.get(current);
    }

    console.log(`BFS: Path found with ${roadPath.length} road waypoints`);
    
    // Build full path: current position -> nearest road -> road path -> target waypoint
    const fullPath: { lat: number; lon: number }[] = [];
    
    // Add move to nearest road if drone is not already on it
    if (startResult.distance > 10) { // More than 10m away
        fullPath.push(startResult.node);
    }
    
    // Add the road path
    fullPath.push(...roadPath);
    
    // Add final move from nearest road to actual waypoint position
    if (endResult.distance > 10) { // More than 10m away from road
        fullPath.push({ lat: targetLat, lon: targetLng });
        console.log(`BFS: Will move final ${endResult.distance.toFixed(0)}m from road to waypoint`);
    }
    
    return fullPath;
}

/**
 * Find the nearest node that is within tower coverage
 * Returns both the node key and the distance
 */
export function findNearestNodeInCoverage(
    lat: number,
    lon: number,
    nodes: Map<string, { lat: number; lon: number; inCoverage: boolean }>,
    maxDistance: number = 5000 // Accept nodes within 5km
): { nodeKey: string; distance: number; node: { lat: number; lon: number } } | null {
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
        return { nodeKey: nearest, distance: minDist, node: { lat: node.lat, lon: node.lon } };
    }
    return null;
}

/**
 * Animate drone movement along a path
 */
export function animateDroneAlongPath(
    droneMarker: any,
    path: { lat: number; lon: number }[],
    onComplete: () => void
) {
    if (path.length === 0) {
        onComplete();
        return;
    }

    let currentIndex = 0;
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
