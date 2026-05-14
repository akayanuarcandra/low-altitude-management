import { LatLon } from "./osrm";

export type RouteResult = {
  coords: LatLon[];
  distance: number;
  duration: number;
  usedTrip?: boolean;
  warnings?: string[];
  raw?: unknown;
};

export type RoutingOpts = { preserveCoverage?: boolean; towers?: unknown[] };

export type RoutingEngine = {
  computeOptimizedRoute: (start: LatLon, stops: LatLon[], opts?: RoutingOpts) => Promise<RouteResult | null>;
  computeRouteOrdered: (points: LatLon[], opts?: RoutingOpts) => Promise<RouteResult | null>;
  snapToRoad: (p: LatLon) => Promise<LatLon>;
};

export default RoutingEngine;
