"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateDrone, createWaypoint, createStation } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import "leaflet/dist/leaflet.css";
import { TowerDTO, DroneDTO, WaypointDTO, StationDTO } from "./types";
import { MapControls } from "./map-controls";
import { buildGraph, getRoadNetwork } from "@/lib/map-utils/network";
import {
  haversineMeters,
  isWithinTowerCoverage,
} from "@/lib/map-utils/geometry";
import { setupMapLayers } from "./map-setup";
import computePatrolRouteClient from "@/lib/patrol-client";
import TaskModal from "@/components/tasks/task-modal";
import {
  findPathBidirectionalDijkstra,
  findNearestNodeInCoverage,
} from "./drone-flight";
import { animateDroneMovement } from "./drone-animations";

// Dynamic imports for Leaflet (client-side only)
// Strongly-typed references to Leaflet and image modules to avoid `any`
declare global {
  interface Window {
    moveDroneToWaypoint?: (droneId: number) => void;
    returnDroneToInventory?: (droneId: number) => void;
    isDroneAnimating?: (droneId: number) => boolean;
    stopDroneOperation?: (
      droneId: number,
      skipConfirm?: boolean,
    ) => Promise<{ ok: boolean; message?: string }>;
    // (Patrol removed)
  }
}
let L: typeof import("leaflet") | null = null;
let markerIcon2x: { src?: string } | null = null;
let markerIcon: { src?: string } | null = null;
let markerShadow: { src?: string } | null = null;

// (Patrol feature removed)

// Pause duration at each task stop in milliseconds. Configurable via env var.
const TASK_STOP_PAUSE_MS = Number(process.env.NEXT_PUBLIC_TASK_STOP_PAUSE_MS ?? 3000);

  export function InteractiveMapView({
  towers,
  drones,
  waypoints,
  stations,
  inventoryDrones,
  }: {
  towers: TowerDTO[];
  drones: DroneDTO[];
  waypoints: WaypointDTO[];
  stations: StationDTO[];
  inventoryDrones: DroneDTO[];
  }) {
    const router = useRouter();
  // Leaflet map reference (typed)
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInventoryDrone, setSelectedInventoryDrone] = useState<
    number | null
  >(null);
  const [isPlacingDrone, setIsPlacingDrone] = useState(false);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [isAddingStation, setIsAddingStation] = useState(false);
  const [, setAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Deployed drones store typed to Leaflet marker types (nullable to avoid any)
  const deployedDronesRef = useRef<
    Map<
      number,
      {
        marker: import("leaflet").Marker | null;
        circleMarker: import("leaflet").CircleMarker | null;
      }
    >
  >(new Map());

  // Animation state controller (unchanged semantics)
  const droneAnimationStateRef = useRef<
    Map<number, { animating: boolean; cancel: () => void }>
  >(new Map());

  // Track whether a patrol loop is active for a given drone. This is a higher-level
  // cancellation token so the patrol runner can stop starting new loops when another
  // operation (Fly/Stop/Return) requests cancellation.
  const patrolActiveRef = useRef<Map<number, boolean>>(new Map());

  // (Patrol controllers removed)

    

  const [graph, setGraph] = useState<{
    nodes: Map<string, { lat: number; lon: number; inCoverage: boolean }>;
    adj: Map<string, Array<{ to: string; weight: number }>>;
  } | null>(null);
  const roadNetworkFetchedRef = useRef(false);

  // Handler called when TaskListModal reports tasks were started for a drone.
  // This will attempt to animate each started task on the map using the road network.
  const handleRunStarted = (started: Array<any> | undefined) => {
    console.debug("handleRunStarted invoked", { started });
    if (!started || started.length === 0) return;
    const canAnimate = !!(
      L &&
      graph &&
      graph.nodes &&
      graph.nodes.size > 0 &&
      mapRef.current
    );
    if (!canAnimate) {
      // Fallback: graph not ready => persist final positions without animation
      try {
        setAlert({
          type: "error",
          message:
            "Road network not ready — persisting task destinations without animation",
        });
        setTimeout(() => setAlert(null), 3500);
      } catch {}

        for (const s of started) {
          try {
            console.debug("handleRunStarted fallback processing start", { s });
            const task = s.task || {};
            const items = s.items || [];
            const droneId = Number(task.droneId);
          if (!droneId) continue;
          const item = items[0];
          if (!item) continue;

          let targetLat = item.deliveryLatitude
            ? Number(item.deliveryLatitude)
            : null;
          let targetLng = item.deliveryLongitude
            ? Number(item.deliveryLongitude)
            : null;
          if ((!targetLat || !targetLng) && item.itemId) {
            const wp = waypoints.find((w) => w.id === Number(item.itemId));
            if (wp) {
              targetLat = wp.latitude;
              targetLng = wp.longitude;
            }
          }
          if (!targetLat || !targetLng) continue;

          // update marker immediately if present
          try {
            const entry = deployedDronesRef.current.get(droneId);
            if (entry && entry.marker) {
              entry.marker.setLatLng([targetLat, targetLng]);
            }
          } catch (e) {
            // ignore
          }

          try {
            updateDrone(droneId, {
              latitude: targetLat,
              longitude: targetLng,
              status: "deployed",
            });
          } catch (e) {
            // ignore
          }
        } catch (e) {
          console.error("handleRunStarted fallback error", e);
        }
      }

      return;
    }

    // Group started tasks by droneId so we can render a combined route per drone
    const droneGroups = new Map<number, Array<{ task: any; item: any }>>();
    for (const s of started) {
      try {
        const task = s.task || {};
        const items = Array.isArray(s.items) ? s.items : [];
        const droneId = Number(task.droneId);
        if (!droneId) continue;

        for (const it of items) {
          // push each item as a separate stop
          if (!droneGroups.has(droneId)) droneGroups.set(droneId, []);
          droneGroups.get(droneId)!.push({ task, item: it });
        }
      } catch (e) {
        console.error("handleRunStarted grouping error", e);
      }
    }

    // For each drone, compute the full concatenated path and display it immediately
    const polylineMap = new Map<number, any>();
    const colorPalette = [
      "#3b82f6",
      "#ef4444",
      "#10b981",
      "#f59e0b",
      "#8b5cf6",
      "#06b6d4",
      "#f97316",
    ];

    for (const [droneId, stops] of droneGroups.entries()) {
      try {
        const entry = deployedDronesRef.current.get(droneId);
        const droneMarker = entry?.marker;
        if (!droneMarker) {
          console.debug("handleRunStarted: no marker for drone", droneId);
          continue;
        }
        const drone = drones.find((d) => d.id === droneId);
        if (!drone) {
          console.debug("handleRunStarted: drone metadata not found", droneId);
          continue;
        }

        // Build concatenated path coords
        const fullPathCoords: Array<{ lat: number; lon: number }> = [];
        // Track indices in fullPathCoords that correspond to task stops so we can pause there
        const stopIndices: number[] = [];
        let lastLat = droneMarker.getLatLng().lat;
        let lastLon = droneMarker.getLatLng().lng;

        for (const stop of stops) {
          let targetLat = stop.item.deliveryLatitude
            ? Number(stop.item.deliveryLatitude)
            : null;
          let targetLng = stop.item.deliveryLongitude
            ? Number(stop.item.deliveryLongitude)
            : null;
          if ((!targetLat || !targetLng) && stop.item.itemId) {
            const wp = waypoints.find((w) => w.id === Number(stop.item.itemId));
            if (wp) {
              targetLat = wp.latitude;
              targetLng = wp.longitude;
            }
          }
          if (!targetLat || !targetLng) continue;

          const segment = findPathBidirectionalDijkstra(
            lastLat,
            lastLon,
            targetLat,
            targetLng,
            graph.nodes,
            graph.adj,
          );

          const partial =
            segment && segment.length > 0
              ? segment
              : [{ lat: targetLat, lon: targetLng }];

          // Append partial, avoid duplicate point at junction
          const beforeAppendIdx = fullPathCoords.length;
          if (fullPathCoords.length > 0) {
            const first = partial[0];
            const last = fullPathCoords[fullPathCoords.length - 1];
            if (
              !(
                Math.abs(first.lat - last.lat) < 1e-9 &&
                Math.abs(first.lon - last.lon) < 1e-9
              )
            ) {
              fullPathCoords.push(...partial);
            } else {
              fullPathCoords.push(...partial.slice(1));
            }
          } else {
            fullPathCoords.push(...partial);
          }

          // The final coordinate of this partial corresponds to the task stop. Record its index.
          const stopIndex = fullPathCoords.length - 1;
          stopIndices.push(stopIndex);

          const lastPoint = partial[partial.length - 1];
          lastLat = lastPoint.lat;
          lastLon = lastPoint.lon;
        }

        // Draw polyline on map
        if (fullPathCoords.length === 0) continue;
        const coords = fullPathCoords.map((p) =>
          (L as any).latLng(p.lat, p.lon),
        );
        // Make the path color purple for all drones
        const color = "#8b5cf6";
        const polyline = (L as any)
          .polyline(coords, { color, weight: 3, opacity: 0.7 })
          .addTo(mapRef.current as any);
        polylineMap.set(droneId, polyline);

        // Build WaypointDTO-like array for animation, marking stop waypoints with pauseMs
        const pathWaypoints = fullPathCoords.map((p, i) => {
          const wp: any = {
            id: i,
            name: `drone-${droneId}-step-${i}`,
            latitude: p.lat,
            longitude: p.lon,
          };
          if (stopIndices.includes(i)) {
            wp.pauseMs = TASK_STOP_PAUSE_MS;
          }
          return wp;
        });
        const finalPt = fullPathCoords[fullPathCoords.length - 1];
        const targetWaypoint = {
          id:
            stops[stops.length - 1].item.itemId ??
            stops[stops.length - 1].task.id,
          name:
            stops[stops.length - 1].task.title ??
            `task-${stops[stops.length - 1].task.id}`,
          latitude: finalPt.lat,
          longitude: finalPt.lon,
        };

        // Animate along the full route (do not await) and remove polyline when done
        animateDroneMovement(
          L as typeof import("leaflet"),
          droneId,
          drone,
          droneMarker as import("leaflet").Marker,
          pathWaypoints,
          targetWaypoint,
          {
            lat: (droneMarker as any).getLatLng().lat,
            lng: (droneMarker as any).getLatLng().lng,
          },
          droneAnimationStateRef,
          setAlert,
        )
          .catch((e) => console.error("animateDroneMovement error", e))
          .finally(() => {
            try {
              const pl = polylineMap.get(droneId);
              if (pl && mapRef.current) (mapRef.current as any).removeLayer(pl);
            } catch (e) {
              // ignore
            }
          });
      } catch (e) {
        console.error("handleRunStarted per-drone error", e);
      }
    }
  };

  // Modal state for inline Task creation
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskModalDroneId, setTaskModalDroneId] = useState<number | undefined>(
    undefined,
  );

  // (Patrol UI state removed; prompting flow used instead)

  // Tasks list modal state
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [tasksModalDroneId, setTasksModalDroneId] = useState<
    number | undefined
  >(undefined);

  // Helper: compute destination lat/lng given start lat/lng, bearing (degrees), and distance (m)
  function destinationLatLng(
    latDeg: number,
    lonDeg: number,
    bearingDeg: number,
    distanceMeters: number,
  ) {
    const R = 6371000; // Earth radius meters
    const bearing = (bearingDeg * Math.PI) / 180;
    const lat1 = (latDeg * Math.PI) / 180;
    const lon1 = (lonDeg * Math.PI) / 180;

    const dDivR = distanceMeters / R;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dDivR) +
        Math.cos(lat1) * Math.sin(dDivR) * Math.cos(bearing),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(dDivR) * Math.cos(lat1),
        Math.cos(dDivR) - Math.sin(lat1) * Math.sin(lat2),
      );

    return {
      latitude: (lat2 * 180) / Math.PI,
      longitude: (lon2 * 180) / Math.PI,
    };
  }

  // Click-to-station matching threshold (meters). Exported as a constant so it's
  // easy to change in one place later.
  const STATION_MATCH_THRESHOLD_METERS = Number(
    process.env.NEXT_PUBLIC_STATION_MATCH_THRESHOLD_METERS ?? 20,
  );

  useEffect(() => {
    const initializeMap = async () => {
      try {
        if (!L) {
          L = (await import("leaflet")).default;
          markerIcon2x = (
            await import("leaflet/dist/images/marker-icon-2x.png")
          ).default;
          markerIcon = (await import("leaflet/dist/images/marker-icon.png"))
            .default;
          markerShadow = (await import("leaflet/dist/images/marker-shadow.png"))
            .default;

          (
            L.Icon.Default as unknown as typeof import("leaflet").Icon.Default
          ).mergeOptions({
            iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
            iconUrl: markerIcon.src ?? markerIcon,
            shadowUrl: markerShadow.src ?? markerShadow,
          });
        }

        if (containerRef.current && !mapRef.current && L) {
          mapRef.current = L.map(containerRef.current);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
            maxZoom: 19,
          }).addTo(mapRef.current);
        }

        const map = mapRef.current!;

        const onMapMoveEnd = async () => {
          if (roadNetworkFetchedRef.current) return;
          roadNetworkFetchedRef.current = true;

          const bounds = map.getBounds();
          const osmData = await getRoadNetwork(bounds);
          if (osmData) {
            const { nodes, adj } = buildGraph(osmData, towers);
            setGraph({ nodes, adj });
          } else {
            roadNetworkFetchedRef.current = false;
          }
          map.off("moveend", onMapMoveEnd);
        };

        map.on("moveend", onMapMoveEnd);

        if (towers.length > 0) {
          const towerBounds = L!.latLngBounds(
            towers.map((t) => [t.latitude, t.longitude]),
          );
          map.fitBounds(towerBounds.pad(0.1));
        } else {
          map.setView([40.7128, -74.006], 5);
        }

        setTimeout(() => {
          if (!roadNetworkFetchedRef.current && map.getBounds()) {
            onMapMoveEnd();
          }
        }, 1000);

        // Expose a handler to open the Add Task UI for a drone.
        (window as any).openAddTaskForDrone = (droneId: number) => {
          try {
            setShowTaskModal(true);
            setTaskModalDroneId(droneId);
          } catch (err) {
            console.error("openAddTaskForDrone failed", err);
            try {
              const url = `/dashboard/tasks/new?droneId=${droneId}`;
              window.open(url, "_blank");
            } catch {}
          }
        };

        // Expose a handler to open the Task list modal for a drone
        (window as any).openTasksForDrone = (droneId: number) => {
          try {
            setShowTasksModal(true);
            setTasksModalDroneId(droneId);
          } catch (err) {
            console.error("openTasksForDrone failed", err);
            try {
              window.open(`/dashboard/tasks/new?droneId=${droneId}`, "_blank");
            } catch {}
          }
        };

        // Expose a handler to start a Patrol for a drone using simple prompts
        (window as any).openPatrolForDrone = async (droneId: number) => {
          try {
            const drone = drones.find((d) => d.id === droneId);
            const entry = deployedDronesRef.current.get(droneId);
            const marker = entry?.marker;
            let center: { lat: number; lon: number } | null = null;
            if (marker) {
              const ll = marker.getLatLng();
              center = { lat: ll.lat, lon: ll.lng };
            } else if (drone && drone.latitude && drone.longitude) {
              center = { lat: drone.latitude, lon: drone.longitude };
            }
            if (!center) {
              window.alert("Drone has no valid position for patrol");
              return;
            }

            const radiusStr = window.prompt("Patrol radius in meters:", "80");
            if (!radiusStr) return;
            const durationStr = window.prompt("Patrol duration (seconds):", "300");
            if (!durationStr) return;
            const speedStr = window.prompt("Drone speed (m/s):", "10");
            if (!speedStr) return;
            const edgeStr = window.prompt("Edge threshold (meters):", "300");
            if (!edgeStr) return;

            const radius = Number(radiusStr);
            const duration = Number(durationStr);
            const speed = Number(speedStr);
            const edgeThreshold = Number(edgeStr);

            // Prefer to compute a road-following patrol using the loaded road graph
            let res: any = null;
            let routeSource = "waypoints";
            try {
              if (graph && graph.nodes && graph.adj && graph.nodes.size > 0) {
                // Build a local subgraph limited to a bbox around the center to keep Dijkstra fast
                const latDegPerMeter = 1 / 111111;
                const lonDegPerMeter = 1 / (111111 * Math.cos((center.lat * Math.PI) / 180 || 1));
                const bboxMultiplier = 1.5;
                const latDelta = (radius * bboxMultiplier) * latDegPerMeter;
                const lonDelta = (radius * bboxMultiplier) * lonDegPerMeter;
                const minLat = center.lat - latDelta;
                const maxLat = center.lat + latDelta;
                const minLon = center.lon - lonDelta;
                const maxLon = center.lon + lonDelta;

                const filteredNodes = new Map<string, { lat: number; lon: number; inCoverage: boolean }>();
                for (const [k, v] of graph.nodes.entries()) {
                  if (v.lat >= minLat && v.lat <= maxLat && v.lon >= minLon && v.lon <= maxLon) {
                    filteredNodes.set(k, { lat: v.lat, lon: v.lon, inCoverage: v.inCoverage });
                  }
                }

                // If too few nodes, fall back to waypoint planner
                if (filteredNodes.size >= 3) {
                  // Build filtered adjacency only for nodes present
                  const filteredAdj = new Map<string, Array<{ to: string; weight: number }>>();
                  for (const [k, neighbors] of graph.adj.entries()) {
                    if (!filteredNodes.has(k)) continue;
                    const arr: Array<{ to: string; weight: number }> = [];
                    for (const nb of neighbors) {
                      if (filteredNodes.has(nb.to)) arr.push({ to: nb.to, weight: nb.weight });
                    }
                    filteredAdj.set(k, arr);
                  }

                  // Generate anchors around circle
                  const anchorsN = 6;
                  const anchors: Array<{ lat: number; lon: number }> = [];
                  for (let i = 0; i < anchorsN; i++) {
                    const ang = (360 / anchorsN) * i;
                    const R = 6371000;
                    const angRad = (ang * Math.PI) / 180;
                    const dByR = radius / R;
                    const lat1 = (center.lat * Math.PI) / 180;
                    const lon1 = (center.lon * Math.PI) / 180;
                    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(angRad));
                    const lon2 = lon1 + Math.atan2(Math.sin(angRad) * Math.sin(dByR) * Math.cos(lat1), Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2));
                    anchors.push({ lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI });
                  }

                  // Snap anchors to nearest nodes in filteredNodes using distance threshold
                  const snappedNodes: Array<string | null> = [];
                  const snapThreshold = edgeThreshold * 1.2;
                  for (const a of anchors) {
                    let bestKey: string | null = null;
                    let bestD = Infinity;
                    for (const [k, n] of filteredNodes.entries()) {
                      const d = haversineMeters(a.lat, a.lon, n.lat, n.lon);
                      if (d < bestD) {
                        bestD = d;
                        bestKey = k;
                      }
                    }
                    if (bestD <= snapThreshold) snappedNodes.push(bestKey); else snappedNodes.push(null);
                  }

                  const validAnchors = snappedNodes.filter((x) => x !== null) as string[];
                  if (validAnchors.length >= 3) {
                    // Use Dijkstra (findPathBidirectionalDijkstra) on filteredNodes/filteredAdj for each segment
                    const routeCoords: Array<{ lat: number; lon: number }> = [];
                    let failed = false;
                    for (let i = 0; i < validAnchors.length; i++) {
                      const aKey = validAnchors[i];
                      const bKey = validAnchors[(i + 1) % validAnchors.length];
                      const aNode = filteredNodes.get(aKey)!;
                      const bNode = filteredNodes.get(bKey)!;
                      const segment = findPathBidirectionalDijkstra(aNode.lat, aNode.lon, bNode.lat, bNode.lon, filteredNodes, filteredAdj);
                      if (!segment || segment.length === 0) { failed = true; break; }
                      // Append segment avoiding duplicate junctions
                      if (routeCoords.length === 0) {
                        routeCoords.push(...segment.map((p: any) => ({ lat: p.lat, lon: p.lon })));
                      } else {
                        const first = segment[0];
                        const last = routeCoords[routeCoords.length - 1];
                        if (Math.abs(first.lat - last.lat) < 1e-9 && Math.abs(first.lon - last.lon) < 1e-9) {
                          routeCoords.push(...segment.slice(1).map((p: any) => ({ lat: p.lat, lon: p.lon })));
                        } else {
                          routeCoords.push(...segment.map((p: any) => ({ lat: p.lat, lon: p.lon })));
                        }
                      }
                    }
                    if (!failed && routeCoords.length >= 3) {
                      // success
                      let loopDistance = 0;
                      for (let i = 0; i < routeCoords.length; i++) {
                        const a = routeCoords[i];
                        const b = routeCoords[(i + 1) % routeCoords.length];
                        loopDistance += haversineMeters(a.lat, a.lon, b.lat, b.lon);
                      }
                      const loopDuration = loopDistance / Math.max(0.1, speed);
                      res = { ok: true, route: routeCoords, loopDistance, loopDuration, diagnostics: { source: "graph", nodesConsidered: filteredNodes.size, anchorsSnapped: validAnchors.length } };
                      routeSource = "graph";
                    }
                  }
                }
              }
            } catch (e) {
              console.debug("graph-based patrol planning failed", e);
            }

            // If graph planner didn't produce a route, fall back to waypoint-based client planner
            if (!res) {
              res = await computePatrolRouteClient(center, radius, { anchors: 6, edgeThresholdMeters: edgeThreshold, maxNodes: 500, droneSpeed: speed, waypoints, aerialFallback: true });
              routeSource = res.ok ? (res.diagnostics && res.diagnostics.nodes ? "waypoints" : "aerial") : "error";
            }

            if (!res.ok) {
              window.alert(`Patrol planning failed: ${res.error || 'unknown'}`);
              return;
            }

            // show a brief preview
            try {
              const map = mapRef.current;
              if (map && L && Array.isArray(res.route)) {
                const coords = (res.route as any[]).map((p) => (L as any).latLng(p.lat, p.lon));
                const poly = (L as any).polyline(coords, { color: '#3b82f6', weight: 3, opacity: 0.8 }).addTo(map);
                setTimeout(() => { try { map.removeLayer(poly); } catch {} }, 3000);
              }
            } catch (e) {
              console.debug('patrol preview failed', e);
            }

            // run patrol loops until duration or cancelled via patrolActiveRef
            patrolActiveRef.current.set(droneId, true);
            try {
              const endAt = Date.now() + Math.max(0, duration) * 1000;
              while (Date.now() < endAt) {
                if (!marker) break;
                // stop if external cancellation requested
                if (!patrolActiveRef.current.get(droneId)) break;
                const routeCoords = res.route as any[];
                const pathWaypoints = routeCoords.map((p: any, i: number) => ({ id: i, name: `patrol-${i}`, latitude: p.lat, longitude: p.lon }));
                const lastWp = pathWaypoints[pathWaypoints.length - 1];
                try {
                  await animateDroneMovement(
                    L,
                    droneId,
                    drone,
                    marker,
                    pathWaypoints,
                    lastWp,
                    { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng },
                    droneAnimationStateRef,
                    setAlert,
                  );
                } catch (e) {
                  console.error('patrol animation error', e);
                  break;
                }
              }
            } finally {
              try { patrolActiveRef.current.delete(droneId); } catch {}
            }
          } catch (err) {
            console.error("openPatrolForDrone failed", err);
            try { window.alert(`Patrol failed: ${String(err)}`); } catch {}
          }
        };

        // (deploySelectedInventoryDroneToStation is set in the map-effect so
        // that it captures fresh isPlacingDrone/selectedInventoryDrone values.)

        setIsLoading(false);
      } catch (error) {
        console.error("Error initializing map and graph:", error);
        setIsLoading(false);
      }
    };

    initializeMap();
  }, [towers]);

  // Keep a stable function on window that delegates to the latest placement state.
  // We expose this outside the initializeMap effect so station marker event
  // handlers can call it even if they were created earlier.
  useEffect(() => {
    (window as any).deploySelectedInventoryDroneToStation = async (
      stationId: number,
    ) => {
      console.log("deploySelectedInventoryDroneToStation called", {
        stationId,
        isPlacingDrone,
        selectedInventoryDrone,
      });
      try {
        if (!isPlacingDrone || !selectedInventoryDrone) {
          return { handled: false };
        }

        const station = stations.find((s) => s.id === stationId);
        if (!station) {
          setAlert({ type: "error", message: "Station not found" });
          setTimeout(() => setAlert(null), 3000);
          return { handled: false };
        }

        const droneToPlace = inventoryDrones.find(
          (d) => d.id === selectedInventoryDrone,
        );
        if (!droneToPlace) return { handled: false };

        await updateDrone(selectedInventoryDrone, {
          latitude: Number(station.latitude),
          longitude: Number(station.longitude),
          status: "deployed",
        });

        // Immediately update UI: refresh server props and also update marker locally
        try {
          router.refresh();
        } catch (e) {
          console.error("router.refresh failed", e);
        }

        // Local marker update: ensure deployedDronesRef updated so map shows drone without reload
        try {
          const entry = deployedDronesRef.current.get(selectedInventoryDrone);
          if (entry && entry.marker) {
            entry.marker.setLatLng([Number(station.latitude), Number(station.longitude)]);
            // update popup content if present
            try {
              const popup = entry.marker.getPopup ? entry.marker.getPopup() : undefined;
              const content = popup ? popup.getContent() : undefined;
              if (content !== undefined && content !== null) {
                // Leaflet setPopupContent expects Content | Popup; cast to any to satisfy TS
                entry.marker.setPopupContent(content as any);
              }
            } catch {}
          }
        } catch (e) {
          // ignore local update failures
        }

        setAlert({
          type: "success",
          message: `${droneToPlace.name} deployed successfully at station "${station.name}"!`,
        });
        setIsPlacingDrone(false);
        setSelectedInventoryDrone(null);
        setTimeout(() => setAlert(null), 3000);
        return { handled: true };
      } catch (err) {
        setAlert({ type: "error", message: "Failed to deploy drone" });
        setTimeout(() => setAlert(null), 3000);
        return { handled: false };
      }
    };
  }, [isPlacingDrone, selectedInventoryDrone, stations, inventoryDrones]);

  useEffect(() => {
    if (!mapRef.current || !L || isLoading) return;

    const map = mapRef.current!;
    const isInitialRender = drones.length === 0;
    setupMapLayers(
      L,
      map,
      towers,
      drones,
      waypoints,
      stations,
      deployedDronesRef,
      isInitialRender,
      droneAnimationStateRef,
    );

    let isDragging = false;

    const handleDragStart = () => {
      isDragging = true;
    };

    const handleDragEnd = () => {
      setTimeout(() => {
        isDragging = false;
      }, 100);
    };

    const handleMapClick = async (e: import("leaflet").LeafletMouseEvent) => {
      if (isDragging) return;

      const { lat, lng } = e.latlng;

      if (isAddingWaypoint) {
        const name = prompt(
          `Create waypoint at (${lat.toFixed(6)}, ${lng.toFixed(6)})?\nEnter waypoint name:`,
        );
        if (name && name.trim()) {
          const formData = new FormData();
          formData.append("name", name.trim());
          formData.append("latitude", String(lat));
          formData.append("longitude", String(lng));
          await createWaypoint(formData);
          setAlert({
            type: "success",
            message: `Waypoint "${name}" created successfully!`,
          });
          setIsAddingWaypoint(false);
          setTimeout(() => setAlert(null), 3000);
        }
        return;
      }

      if (isAddingStation) {
        const name = prompt(
          `Create station at (${lat.toFixed(6)}, ${lng.toFixed(6)})?\nEnter station name:`,
        );
        if (name && name.trim()) {
          const formData = new FormData();
          formData.append("name", name.trim());
          formData.append("latitude", String(lat));
          formData.append("longitude", String(lng));
          await createStation(formData);
          setAlert({
            type: "success",
            message: `Station "${name}" created successfully!`,
          });
          setIsAddingStation(false);
          setTimeout(() => setAlert(null), 3000);
        }
        return;
      }

      if (!isPlacingDrone || !selectedInventoryDrone) return;

      const droneToPlace = inventoryDrones.find(
        (d) => d.id === selectedInventoryDrone,
      );

      if (!droneToPlace) return;

      // Station-only deployment: find a station within the matching threshold.
      if (!stations || stations.length === 0) {
        setAlert({
          type: "error",
          message: "No stations available, please add station first",
        });
        setTimeout(() => setAlert(null), 3000);
        return;
      }

      let matchedStation: StationDTO | null = null;
      for (const s of stations) {
        const d = haversineMeters(lat, lng, Number(s.latitude), Number(s.longitude));
        if (d <= STATION_MATCH_THRESHOLD_METERS) {
          matchedStation = s;
          break;
        }
      }

      if (!matchedStation) {
        setAlert({ type: "error", message: "please deploy on station" });
        setTimeout(() => setAlert(null), 3000);
        return;
      }

      // Deploy exactly to the station coordinates. Do not modify towerId here.
      await updateDrone(selectedInventoryDrone, {
        latitude: Number(matchedStation.latitude),
        longitude: Number(matchedStation.longitude),
        status: "deployed",
      });

      // Refresh server props and update marker locally for instant feedback.
      try {
        router.refresh();
      } catch (e) {
        console.error("router.refresh failed", e);
      }

      try {
        const entry = deployedDronesRef.current.get(selectedInventoryDrone);
        if (entry && entry.marker) {
          entry.marker.setLatLng([Number(matchedStation.latitude), Number(matchedStation.longitude)]);
            try {
              const popup = entry.marker.getPopup ? entry.marker.getPopup() : undefined;
              const content = popup ? popup.getContent() : undefined;
              if (content !== undefined && content !== null) {
                entry.marker.setPopupContent(content as any);
              }
            } catch {}
        }
      } catch (e) {
        // ignore
      }

      setAlert({
        type: "success",
        message: `${droneToPlace.name} deployed successfully at station "${matchedStation.name}"!`,
      });
      setIsPlacingDrone(false);
      setSelectedInventoryDrone(null);
      setTimeout(() => setAlert(null), 3000);
    };

    // Always attach handlers; the handler itself guards on isPlacingDrone/isAddingWaypoint.
    map.on("click", handleMapClick);
    map.on("dragstart", handleDragStart);
    map.on("dragend", handleDragEnd);

    window.moveDroneToWaypoint = async (droneId: number) => {
      const waypointSelectEl = document.getElementById(
        `waypoint-select-${droneId}`,
      ) as HTMLSelectElement;
      if (!waypointSelectEl || !waypointSelectEl.value) {
        window.alert("Please select a waypoint first");
        return;
      }

      const waypointId = parseInt(waypointSelectEl.value, 10);
      const targetWaypoint = waypoints.find((w) => w.id === waypointId);
      const drone = drones.find((d) => d.id === droneId);

      if (!targetWaypoint || !drone || !drone.latitude || !drone.longitude) {
        return;
      }

      const droneMarker = deployedDronesRef.current.get(droneId)?.marker;
      if (!droneMarker) return;

      // If a patrol is running for this drone, cancel it so the fly command can take over
      try {
        patrolActiveRef.current.set(droneId, false);
      } catch {}

      if (
        !isWithinTowerCoverage(
          targetWaypoint.latitude,
          targetWaypoint.longitude,
          towers,
        )
      ) {
        window.alert("Target waypoint is outside tower coverage!");
        return;
      }

      if (!graph || graph.nodes.size === 0) {
        window.alert(
          "Road network is not loaded yet. Please wait a moment and try again.",
        );
        return;
      }

      const currentPos = droneMarker.getLatLng();

      const path = findPathBidirectionalDijkstra(
        currentPos.lat,
        currentPos.lng,
        targetWaypoint.latitude,
        targetWaypoint.longitude,
        graph.nodes,
        graph.adj,
      );

      if (path.length === 0) {
        window.alert(
          "No path found! Possible reasons:\n• No continuous road path exists within tower coverage\n• Start or end point too far from any roads (>5km)\n• Towers don't cover the route",
        );
        return;
      }

      const firstPathPoint = path[0];
      const distanceToFirstPoint = haversineMeters(
        currentPos.lat,
        currentPos.lng,
        firstPathPoint.lat,
        firstPathPoint.lon,
      );

      if (distanceToFirstPoint > 10) {
        console.log(
          `Drone will first move ${distanceToFirstPoint.toFixed(0)}m to nearest road`,
        );
      }

      droneMarker.closePopup();

      const pathCoords = [
        currentPos,
        // Ensure Leaflet namespace and mapRef are non-null before calling methods
        ...(L
          ? path.map((p) =>
              (L as typeof import("leaflet")).latLng(p.lat, p.lon),
            )
          : []),
      ];
      const polyline = (L as typeof import("leaflet"))
        .polyline(pathCoords, {
          color: "blue",
          weight: 3,
          opacity: 0.7,
        })
        .addTo(mapRef.current as import("leaflet").Map);

      // Convert path points to WaypointDTO-like objects expected by animateDroneMovement
      const pathWaypoints = path.map((p, i) => ({
        id: i,
        name: `step-${i}`,
        latitude: p.lat,
        longitude: p.lon,
      }));

      // Animate the drone along the computed path. animateDroneMovement will manage a controller
      // in droneAnimationStateRef so server-driven updates won't overwrite the marker while animating.
      await animateDroneMovement(
        L as typeof import("leaflet"),
        droneId,
        drone,
        droneMarker as import("leaflet").Marker,
        pathWaypoints,
        {
          id: targetWaypoint.id,
          name: targetWaypoint.name,
          latitude: targetWaypoint.latitude,
          longitude: targetWaypoint.longitude,
        },
        { lat: currentPos.lat, lng: currentPos.lng },
        droneAnimationStateRef,
        setAlert,
      );

      // Remove the visual path polyline when animation completes (animateDroneMovement handles persisting)
      if (mapRef.current && polyline) {
        mapRef.current.removeLayer(polyline);
      }
    };

    // Expose a small public API for UI controls to check/cancel drone movement
    window.isDroneAnimating = (droneId: number) => {
      try {
        const ctrl = droneAnimationStateRef.current.get(droneId);
        return !!(ctrl && ctrl.animating);
      } catch {
        return false;
      }
    };

    // stopDroneOperation performs cancellation and persistence without prompting.
    // It returns an object describing the result so callers can surface a single alert to the user.
    window.stopDroneOperation = async (
      droneId: number,
      _skipConfirm: boolean = false,
    ): Promise<{ ok: boolean; message?: string }> => {
      const drone = drones.find((d) => d.id === droneId);
      if (!drone) return { ok: false, message: "Drone not found" };

      // Inspect current controllers
      const animCtrl = droneAnimationStateRef.current.get(droneId);
      const isAnimating = !!(animCtrl && animCtrl.animating);

      // If nothing is running, return status
      if (!isAnimating) {
        return { ok: false, message: `${drone.name} is not currently moving` };
      }

      // Cancel animation controller (if any). Set suppression flag so the animation
      // routine does not display its own cancellation alert — callers are expected
      // to surface a single consolidated message to the user.
      if (isAnimating) {
        try {
          // signal patrol loop (if any) to stop starting new iterations
          try { patrolActiveRef.current.set(droneId, false); } catch {}
          if (animCtrl && typeof animCtrl === "object") {
            try {
              // mark the registered controller to suppress its internal cancel alert
              (animCtrl as any).suppressCancelAlert = true;
            } catch {
              // ignore if we can't set it for any reason
            }
          }
          animCtrl!.cancel();
        } catch {
          // ignore
        }
        try {
          // allow animateDroneMovement cleanup logic to run; remove entry proactively
          droneAnimationStateRef.current.delete(droneId);
        } catch {
          // ignore
        }
      }

      // Persist the current marker position (if available) so server reflects stopped location
      try {
        const entry = deployedDronesRef.current.get(droneId);
        const marker = entry?.marker;
        if (marker) {
          const ll = marker.getLatLng();
          await updateDrone(droneId, {
            latitude: Number(ll.lat),
            longitude: Number(ll.lng),
            status: "deployed",
          });
          return { ok: true, message: `${drone.name} stopped and persisted` };
        } else {
          // No marker available: at least set status to deployed
          await updateDrone(droneId, { status: "deployed" });
          return { ok: true, message: `${drone.name} stopped` };
        }
      } catch (err) {
        return {
          ok: false,
          message: `Failed to persist ${drone.name} position`,
        };
      } finally {
        // Final cleanup: ensure animation controller removed
        try {
          droneAnimationStateRef.current.delete(droneId);
        } catch {}
      }
    };

    // Single, cleaned-up return-to-inventory handler (cancels animation if running first)
    window.returnDroneToInventory = async (droneId: number) => {
      const drone = drones.find((d) => d.id === droneId);
      if (!drone) return;

      try {
        // If an animation is running, cancel it and persist last marker pos before moving to inventory
        // signal patrol loop (if any) to stop
        try { patrolActiveRef.current.set(droneId, false); } catch {}
        const ctrl = droneAnimationStateRef.current.get(droneId);
        if (ctrl && ctrl.animating) {
          try {
            ctrl.cancel();
          } catch (e) {
            // ignore
          }
          const entry = deployedDronesRef.current.get(droneId);
          const marker = entry?.marker;
          if (marker) {
            try {
              const ll = marker.getLatLng();
              await updateDrone(droneId, {
                latitude: Number(ll.lat),
                longitude: Number(ll.lng),
                status: "deployed",
              });
            } catch {
              // ignore persisting failure - we'll attempt to set inventory below
            }
          }
          // give a tiny grace period for animation cleanup
          await new Promise((r) => setTimeout(r, 200));
        }

        await updateDrone(droneId, {
          latitude: null,
          longitude: null,
          towerId: null,
          status: "inventory",
        });
        setAlert({
          type: "success",
          message: `${drone.name} returned to inventory`,
        });
        setTimeout(() => setAlert(null), 2000);
      } catch {
        setAlert({
          type: "error",
          message: "Failed to return drone to inventory",
        });
        setTimeout(() => setAlert(null), 3000);
      }
    };

    return () => {
      try {
        map.off("click", handleMapClick);
        map.off("dragstart", handleDragStart);
        map.off("dragend", handleDragEnd);
      } catch {}
      try {
        if (mapRef.current) {
          mapRef.current.off("click", handleMapClick);
          mapRef.current.off("dragstart", handleDragStart);
          mapRef.current.off("dragend", handleDragEnd);
        }
      } catch {}
    };
  }, [
    towers,
    waypoints,
    drones,
    isPlacingDrone,
    selectedInventoryDrone,
    isLoading,
    isAddingWaypoint,
    inventoryDrones,
    graph,
  ]);

  // Enable/disable map interactions when placement mode toggles. This avoids
  // accidental map panning swallowing intended clicks while placing a drone.
  useEffect(() => {
    try {
      const map = mapRef.current;
      if (!map) return;
      if (isPlacingDrone) {
        map.dragging && map.dragging.disable && map.dragging.disable();
        map.doubleClickZoom && map.doubleClickZoom.disable && map.doubleClickZoom.disable();
        map.touchZoom && map.touchZoom.disable && map.touchZoom.disable();
        map.scrollWheelZoom && map.scrollWheelZoom.disable && map.scrollWheelZoom.disable();
        map.boxZoom && map.boxZoom.disable && map.boxZoom.disable();
        try {
          const el = (map as any).getContainer();
          if (el && el.style) el.style.cursor = "crosshair";
        } catch {}
      } else {
        map.dragging && map.dragging.enable && map.dragging.enable();
        map.doubleClickZoom && map.doubleClickZoom.enable && map.doubleClickZoom.enable();
        map.touchZoom && map.touchZoom.enable && map.touchZoom.enable();
        map.scrollWheelZoom && map.scrollWheelZoom.enable && map.scrollWheelZoom.enable();
        map.boxZoom && map.boxZoom.enable && map.boxZoom.enable();
        try {
          const el = (map as any).getContainer();
          if (el && el.style) el.style.cursor = "";
        } catch {}
      }
    } catch (e) {
      // ignore
    }
  }, [isPlacingDrone]);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent>
            <div
              ref={containerRef}
              className="w-full rounded border border-gray-200 relative"
              style={{ height: "680px", minHeight: "600px", width: "100%" }}
            >
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded z-10">
                  <p className="text-gray-500">Loading map...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <MapControls
          inventoryDrones={inventoryDrones}
          deployedDrones={drones}
          selectedInventoryDrone={selectedInventoryDrone}
          setSelectedInventoryDrone={setSelectedInventoryDrone}
          isPlacingDrone={isPlacingDrone}
          setIsPlacingDrone={setIsPlacingDrone}
          isAddingWaypoint={isAddingWaypoint}
          setIsAddingWaypoint={setIsAddingWaypoint}
          isAddingStation={isAddingStation}
          setIsAddingStation={setIsAddingStation}
          setAlert={setAlert}
          onRunStarted={handleRunStarted}
          stations={stations}
        />
      </div>

      {showTaskModal && (
        <TaskModal
          initialDroneId={taskModalDroneId}
          initialDroneName={
            inventoryDrones.find((d) => d.id === taskModalDroneId)?.name
          }
          onClose={() => {
            setShowTaskModal(false);
            setTaskModalDroneId(undefined);
          }}
        />
      )}
      {/* Patrol modal removed; prompt-based patrol flow is used via popup button */}
    </div>
  );
}
