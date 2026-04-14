import { TowerDTO, WaypointDTO } from "./types";

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function isWithinTowerCoverage(lat: number, lng: number, towers: TowerDTO[]): boolean {
    return towers.some((t) => {
        const dist = haversineMeters(lat, lng, t.latitude, t.longitude);
        return dist <= t.rangeMeters;
    });
}

export function isPathWithinCoverage(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
    towers: TowerDTO[]
): boolean {
    const distance = haversineMeters(lat1, lng1, lat2, lng2);
    const steps = Math.max(20, Math.ceil(distance / 100)); // Check at least every 100m
    for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const lat = lat1 + (lat2 - lat1) * progress;
        const lng = lng1 + (lng2 - lng1) * progress;
        if (!isWithinTowerCoverage(lat, lng, towers)) {
            return false;
        }
    }
    return true;
}

export function findPath(
    startLat: number,
    startLng: number,
    targetWaypoint: WaypointDTO,
    waypoints: WaypointDTO[],
    towers: TowerDTO[]
): WaypointDTO[] {
    if (!isWithinTowerCoverage(startLat, startLng, towers)) return [];
    if (!isWithinTowerCoverage(targetWaypoint.latitude, targetWaypoint.longitude, towers)) return [];

    const allWaypoints = waypoints.filter(w => isWithinTowerCoverage(w.latitude, w.longitude, towers));
    if (!allWaypoints.find(w => w.id === targetWaypoint.id)) {
        allWaypoints.push(targetWaypoint);
    }

    // Dijkstra's algorithm
    const distances = new Map<number, number>();
    const previous = new Map<number, number | null>();
    const unvisited = new Set<number>();

    // Initialize
    const START_ID = -1;
    distances.set(START_ID, 0);
    previous.set(START_ID, null);

    for (const wp of allWaypoints) {
        distances.set(wp.id, Infinity);
        previous.set(wp.id, null);
        unvisited.add(wp.id);
    }
    unvisited.add(START_ID);

    while (unvisited.size > 0) {
        // Find unvisited node with minimum distance
        let minDistance = Infinity;
        let currentId: number | null = null;

        for (const id of unvisited) {
            const dist = distances.get(id)!;
            if (dist < minDistance) {
                minDistance = dist;
                currentId = id;
            }
        }

        if (currentId === null || minDistance === Infinity) break;
        if (currentId === targetWaypoint.id) break;

        unvisited.delete(currentId);

        // Get current position
        let currentLat: number, currentLng: number;
        if (currentId === START_ID) {
            currentLat = startLat;
            currentLng = startLng;
        } else {
            const currentWp = allWaypoints.find(w => w.id === currentId)!;
            currentLat = currentWp.latitude;
            currentLng = currentWp.longitude;
        }

        // Check all neighbors
        for (const neighbor of allWaypoints) {
            if (!unvisited.has(neighbor.id)) continue;

            // Check if path is within coverage
            if (!isPathWithinCoverage(currentLat, currentLng, neighbor.latitude, neighbor.longitude, towers)) {
                continue;
            }

            const distance = haversineMeters(currentLat, currentLng, neighbor.latitude, neighbor.longitude);
            const totalDistance = distances.get(currentId)! + distance;

            if (totalDistance < distances.get(neighbor.id)!) {
                distances.set(neighbor.id, totalDistance);
                previous.set(neighbor.id, currentId);
            }
        }
    }

    // Reconstruct path
    const path: WaypointDTO[] = [];
    let currentId: number | null = targetWaypoint.id;

    while (currentId !== null && currentId !== START_ID) {
        const wp = allWaypoints.find(w => w.id === currentId);
        if (!wp) break;
        path.unshift(wp);
        currentId = previous.get(currentId) ?? null;
    }

    if (path.length === 0 || path[path.length - 1].id !== targetWaypoint.id) {
        return [];
    }

    // Validate entire path stays within coverage
    let prevLat = startLat;
    let prevLng = startLng;
    for (const wp of path) {
        if (!isPathWithinCoverage(prevLat, prevLng, wp.latitude, wp.longitude, towers)) {
            return [];
        }
        prevLat = wp.latitude;
        prevLng = wp.longitude;
    }

    return path;
}
