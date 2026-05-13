"use client";

import { useEffect, useRef, useState } from "react";
import { updateDrone, createWaypoint } from "@/app/actions";
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
    // Start a patrol around the drone's current position (radiusMeters optional)
    startPatrol?: (droneId: number, radiusMeters?: number) => Promise<void>;
  }
}
let L: typeof import("leaflet") | null = null;
let markerIcon2x: { src?: string } | null = null;
let markerIcon: { src?: string } | null = null;
let markerShadow: { src?: string } | null = null;

// Patrol configuration (tweakable)
const PATROL_DEFAULT_RADIUS_METERS = 80; // default patrol radius
const PATROL_POINT_COUNT = 8; // how many sample points around circle to snap to roads
const PATROL_MIN_RADIUS_METERS = 20; // minimum allowed radius

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
  // Leaflet map reference (typed)
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInventoryDrone, setSelectedInventoryDrone] = useState<
    number | null
  >(null);
  const [isPlacingDrone, setIsPlacingDrone] = useState(false);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
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

  // Patrol controllers: manage ongoing patrol loops per-drone.
  const patrolControllersRef = useRef<
    Map<number, { running: boolean; cancel: () => void }>
  >(new Map());

  const [graph, setGraph] = useState<{
    nodes: Map<string, { lat: number; lon: number; inCoverage: boolean }>;
    adj: Map<string, Array<{ to: string; weight: number }>>;
  } | null>(null);
  const roadNetworkFetchedRef = useRef(false);

  // Modal state for inline Task creation
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskModalDroneId, setTaskModalDroneId] = useState<number | undefined>(
    undefined,
  );

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

        setIsLoading(false);
      } catch (error) {
        console.error("Error initializing map and graph:", error);
        setIsLoading(false);
      }
    };

    initializeMap();
  }, [towers]);

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

      if (!isPlacingDrone || !selectedInventoryDrone) return;

      const droneToPlace = inventoryDrones.find(
        (d) => d.id === selectedInventoryDrone,
      );

      if (!droneToPlace) return;

      let assignedTower: TowerDTO | null = null;
      for (const tower of towers) {
        const distance = haversineMeters(
          lat,
          lng,
          tower.latitude,
          tower.longitude,
        );
        if (distance <= tower.rangeMeters) {
          assignedTower = tower;
          break;
        }
      }

      if (!assignedTower) {
        setAlert({
          type: "error",
          message: `${droneToPlace.name} is outside all tower coverage areas! Cannot deploy.`,
        });
        setTimeout(() => setAlert(null), 4000);
        return;
      }

      updateDrone(selectedInventoryDrone, {
        latitude: lat,
        longitude: lng,
        towerId: assignedTower.id,
        status: "deployed",
      });

      setAlert({
        type: "success",
        message: `${droneToPlace.name} deployed successfully at tower "${assignedTower.name}"!`,
      });
      setIsPlacingDrone(false);
      setSelectedInventoryDrone(null);
      setTimeout(() => setAlert(null), 3000);
    };

    if (isPlacingDrone || isAddingWaypoint) {
      map.on("click", handleMapClick);
      map.on("dragstart", handleDragStart);
      map.on("dragend", handleDragEnd);
    }

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
      const patrolCtrl = patrolControllersRef.current.get(droneId);
      const animCtrl = droneAnimationStateRef.current.get(droneId);
      const isPatrolling = !!(patrolCtrl && patrolCtrl.running);
      const isAnimating = !!(animCtrl && animCtrl.animating);

      // If nothing is running, return status
      if (!isPatrolling && !isAnimating) {
        return { ok: false, message: `${drone.name} is not currently moving` };
      }

      // Cancel patrol first (if any)
      if (isPatrolling) {
        try {
          patrolCtrl!.cancel();
        } catch {
          // ignore cancellation errors
        }
        try {
          patrolControllersRef.current.delete(droneId);
        } catch {
          // ignore
        }
      }

      // Cancel animation controller (if any). Set suppression flag so the animation
      // routine does not display its own cancellation alert — callers are expected
      // to surface a single consolidated message to the user.
      if (isAnimating) {
        try {
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
        // Final cleanup: ensure both controllers removed
        try {
          droneAnimationStateRef.current.delete(droneId);
        } catch {}
        try {
          patrolControllersRef.current.delete(droneId);
        } catch {}
      }
    };

    // Start a patrol loop around the drone's current position using road network nodes.
    // radiusMeters optional; defaults to PATROL_DEFAULT_RADIUS_METERS.
    window.startPatrol = async (droneId: number, radiusMeters?: number) => {
      const drone = drones.find((d) => d.id === droneId);
      if (!drone) {
        window.alert("Drone not found for patrol");
        return;
      }

      if (!graph || graph.nodes.size === 0) {
        window.alert(
          "Road network is not loaded yet. Please wait a moment and try again.",
        );
        return;
      }

      const entry = deployedDronesRef.current.get(droneId);
      const marker = entry?.marker;
      if (!marker) {
        window.alert("Drone marker not available on the map");
        return;
      }

      const center = marker.getLatLng();
      const radius =
        typeof radiusMeters === "number"
          ? radiusMeters
          : PATROL_DEFAULT_RADIUS_METERS;
      if (radius < PATROL_MIN_RADIUS_METERS) {
        window.alert(
          `Patrol radius must be at least ${PATROL_MIN_RADIUS_METERS} meters`,
        );
        return;
      }

      // Find a tower that can fully contain the patrol circle.
      let assignedTower: TowerDTO | null = null;
      for (const tower of towers) {
        const distToTower = haversineMeters(
          center.lat,
          center.lng,
          tower.latitude,
          tower.longitude,
        );
        if (distToTower + radius <= tower.rangeMeters) {
          assignedTower = tower;
          break;
        }
      }

      if (!assignedTower) {
        window.alert(
          "No tower can contain the requested patrol area. Reduce radius or move drone closer to a tower center.",
        );
        return;
      }

      // Sample points around the circle and snap each to nearest road network node within coverage
      const sampledNodes: Array<{ lat: number; lon: number; key: string }> = [];
      for (let i = 0; i < PATROL_POINT_COUNT; i++) {
        const bearing = (360 * i) / PATROL_POINT_COUNT;
        const dest = destinationLatLng(center.lat, center.lng, bearing, radius);
        // Use the helper to find nearest node in coverage from drone-flight
        const nearest = findNearestNodeInCoverage(
          dest.latitude,
          dest.longitude,
          graph.nodes,
        );
        if (nearest && nearest.node) {
          // ensure node is within assigned tower coverage as a safety check
          const dToTower = haversineMeters(
            nearest.node.lat,
            nearest.node.lon,
            assignedTower.latitude,
            assignedTower.longitude,
          );
          if (dToTower <= assignedTower.rangeMeters) {
            sampledNodes.push({
              lat: nearest.node.lat,
              lon: nearest.node.lon,
              key: nearest.nodeKey,
            });
          } else {
            // try to shrink radius slightly? for now, abort with message
            window.alert(
              "One of the generated patrol points cannot be anchored on roads inside the tower coverage. Try a smaller radius.",
            );
            return;
          }
        } else {
          window.alert(
            "Could not find a nearby road node for a patrol sample point. Reduce radius or ensure road data is available.",
          );
          return;
        }
      }

      // Deduplicate nodes by key while preserving order
      const uniqueNodeKeys = new Set<string>();
      const uniqueNodes: { lat: number; lon: number; key: string }[] = [];
      for (const n of sampledNodes) {
        if (!uniqueNodeKeys.has(n.key)) {
          uniqueNodeKeys.add(n.key);
          uniqueNodes.push(n);
        }
      }

      if (uniqueNodes.length < 2) {
        window.alert(
          "Not enough unique road nodes for patrol. Try increasing the radius slightly.",
        );
        return;
      }

      // Build an ordered full path that connects successive sampled nodes using graph pathfinding
      const fullPathCoords: { lat: number; lon: number }[] = [];
      for (let i = 0; i < uniqueNodes.length; i++) {
        const a = uniqueNodes[i];
        const b = uniqueNodes[(i + 1) % uniqueNodes.length]; // loop back to start
        const partial = findPathBidirectionalDijkstra(
          a.lat,
          a.lon,
          b.lat,
          b.lon,
          graph.nodes,
          graph.adj,
        );
        if (partial.length === 0) {
          window.alert(
            "Failed to compute a road path between patrol points. Try a different radius or location.",
          );
          return;
        }
        // Append partial path - avoid duplicating the first node if already present
        if (
          fullPathCoords.length > 0 &&
          fullPathCoords[fullPathCoords.length - 1].lat === partial[0].lat &&
          fullPathCoords[fullPathCoords.length - 1].lon === partial[0].lon
        ) {
          fullPathCoords.push(...partial.slice(1));
        } else {
          fullPathCoords.push(...partial);
        }
      }

      // Convert fullPathCoords to WaypointDTO array expected by animateDroneMovement
      const patrolWaypoints: WaypointDTO[] = fullPathCoords.map((p, idx) => ({
        id: idx,
        name: `patrol-node-${idx}`,
        latitude: p.lat,
        longitude: p.lon,
      }));

      // Setup patrol controller
      let running = true;
      const controller = {
        running: true,
        cancel: () => {
          running = false;
          controller.running = false;
          // cancel any in-flight animation controller too
          const animCtrl = droneAnimationStateRef.current.get(droneId);
          if (animCtrl && animCtrl.cancel) {
            try {
              animCtrl.cancel();
            } catch {}
          }
        },
      };
      patrolControllersRef.current.set(droneId, controller);

      // Loop patrol: traverse fullPath once per cycle, then repeat until canceled
      try {
        while (running) {
          // Compute current marker position as start
          const currentMarker = deployedDronesRef.current.get(droneId)?.marker;
          if (!currentMarker) break;
          const curPos = currentMarker.getLatLng();

          // If the first waypoint in patrolWaypoints is not close to current position, prepend a short path to the nearest patrol node
          const firstWp = patrolWaypoints[0];
          const prePath = findPathBidirectionalDijkstra(
            curPos.lat,
            curPos.lng,
            firstWp.latitude,
            firstWp.longitude,
            graph.nodes,
            graph.adj,
          );
          const composedWaypoints: WaypointDTO[] = [];
          if (prePath.length > 0) {
            composedWaypoints.push(
              ...prePath.map((p, i) => ({
                id: i,
                name: `prefill-${i}`,
                latitude: p.lat,
                longitude: p.lon,
              })),
            );
          }
          const offset = composedWaypoints.length;
          composedWaypoints.push(
            ...patrolWaypoints.map((p, i) => ({
              id: offset + i,
              name: p.name,
              latitude: p.latitude,
              longitude: p.longitude,
            })),
          );

          // Use animateDroneMovement to traverse the composed route
          await animateDroneMovement(
            L as typeof import("leaflet"),
            droneId,
            drone,
            currentMarker as import("leaflet").Marker,
            composedWaypoints,
            composedWaypoints[composedWaypoints.length - 1],
            { lat: curPos.lat, lng: curPos.lng },
            droneAnimationStateRef,
            setAlert,
          );

          if (!controller.running) break;
          // slight pause between cycles
          await new Promise((r) => setTimeout(r, 500));
        }
      } finally {
        try {
          patrolControllersRef.current.delete(droneId);
        } catch {}
      }
    };

    // Single, cleaned-up return-to-inventory handler (cancels animation if running first)
    window.returnDroneToInventory = async (droneId: number) => {
      const drone = drones.find((d) => d.id === droneId);
      if (!drone) return;

      try {
        // If an animation is running, cancel it and persist last marker pos before moving to inventory
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
      if (isPlacingDrone || isAddingWaypoint) {
        map.off("click", handleMapClick);
        map.off("dragstart", handleDragStart);
        map.off("dragend", handleDragEnd);
      }
      if (mapRef.current) {
        mapRef.current.off("click", handleMapClick);
        mapRef.current.off("dragstart", handleDragStart);
        mapRef.current.off("dragend", handleDragEnd);
      }
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
          setAlert={setAlert}
        />
      </div>
    </div>
  );
}
