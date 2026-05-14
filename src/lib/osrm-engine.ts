/* eslint-disable @typescript-eslint/no-explicit-any */
import { osrmRoute, osrmTrip, osrmNearest, LatLon } from "./osrm";
import { isWithinTowerCoverage } from "./map-utils/geometry";
import { RouteResult, RoutingEngine, RoutingOpts } from "./routing-engine";

export class OsrmRoutingEngine implements RoutingEngine {
  async computeOptimizedRoute(start: LatLon, stops: LatLon[], opts: RoutingOpts = {}) {
    // Attempt Trip optimization first (open trip with source=start)
    try {
      const trip = await osrmTrip([start, ...stops], { roundtrip: false, source: "first" });
      if (trip && Array.isArray(trip.coords) && trip.coords.length) {
        const towers = (opts.towers || []) as any[];
        if (!opts.preserveCoverage || trip.coords.every((p) => isWithinTowerCoverage(p.lat, p.lon, towers))) {
          return {
            coords: trip.coords,
            distance: trip.distance,
            duration: trip.duration,
            usedTrip: true,
            raw: trip.raw,
          } as RouteResult;
        }
      }
    } catch (e) {
      // ignore and fallback
    }

    // Fallback: compute ordered route (start + stops in given order)
    try {
      const points = [start, ...stops];
      const res = await this.computeRouteOrdered(points, opts);
      if (res) return { ...res, usedTrip: false };
    } catch (e) {
      // ignore
    }
    return null;
  }

  async computeRouteOrdered(points: LatLon[], opts: RoutingOpts = {}) {
    if (!points || points.length < 2) return { coords: [], distance: 0, duration: 0 } as RouteResult;
    // Use osrmRoute which returns full geometry
    const route = await osrmRoute(points as LatLon[], { overview: "full" });
    const towers = (opts.towers || []) as any[];
    if (opts.preserveCoverage) {
      const ok = route.coords.every((p) => isWithinTowerCoverage(p.lat, p.lon, towers));
      if (!ok) return null;
    }
    return { coords: route.coords, distance: route.distance, duration: route.duration, raw: route.raw } as RouteResult;
  }

  async snapToRoad(p: LatLon) {
    const snapped: any = await osrmNearest(p);
    return { lat: snapped.lat, lon: snapped.lon } as LatLon;
  }
}

export default OsrmRoutingEngine;
