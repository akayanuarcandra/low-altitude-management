import { haversineMeters } from "./map-utils/geometry";

export function isPointInTowerCoverage(lat: number, lon: number, towers: Array<{ latitude: number; longitude: number; rangeMeters: number }>): boolean {
  for (const t of towers) {
    const d = haversineMeters(lat, lon, t.latitude, t.longitude);
    if (d <= t.rangeMeters) return true;
  }
  return false;
}

/**
 * Sample a polyline (array of {lat, lon}) at roughly every sampleMeters and ensure
 * each sampled point is within tower coverage.
 */
export function isGeometryInsideCoverage(poly: { lat: number; lon: number }[], towers: Array<{ latitude: number; longitude: number; rangeMeters: number }>, sampleMeters = 20) {
  if (!poly || poly.length === 0) return false;
  // Check vertices first
  for (const p of poly) {
    if (!isPointInTowerCoverage(p.lat, p.lon, towers)) return false;
  }
  // Sample between vertices
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const dist = haversineMeters(a.lat, a.lon, b.lat, b.lon);
    const steps = Math.max(1, Math.floor(dist / sampleMeters));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      if (!isPointInTowerCoverage(lat, lon, towers)) return false;
    }
  }
  return true;
}

const coverage = { isPointInTowerCoverage, isGeometryInsideCoverage };
export default coverage;
