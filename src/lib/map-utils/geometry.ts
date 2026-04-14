import { TowerDTO } from "@/components/map/types";

/**
 * Calculates the Manhattan distance between two points.
 * This is a simple heuristic and not a true distance on a sphere,
 * but it's what the user requested for the pathfinding heuristic.
 */
export function manhattanDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const latDiff = Math.abs(lat1 - lat2);
  const lonDiff = Math.abs(lon1 - lon2);
  // A simple conversion factor to make the numbers more like meters, not to be taken as accurate.
  const factor = 111000;
  return (latDiff + lonDiff) * factor;
}

/**
 * Calculates the Haversine distance between two points on the Earth.
 * @returns Distance in meters.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Checks if a point is within the coverage of any of the given towers.
 */
export function isWithinTowerCoverage(
  lat: number,
  lon: number,
  towers: TowerDTO[],
): boolean {
  for (const tower of towers) {
    const distance = haversineMeters(lat, lon, tower.latitude, tower.longitude);
    if (distance <= tower.rangeMeters) {
      return true;
    }
  }
  return false;
}
