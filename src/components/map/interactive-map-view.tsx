"use client";

import { useEffect, useRef, useState } from "react";
import { updateDrone, createWaypoint } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import "leaflet/dist/leaflet.css";
import { TowerDTO, DroneDTO, WaypointDTO } from "./types";
import { MapControls } from "./map-controls";
import { buildGraph, getRoadNetwork } from "@/lib/map-utils/network";
import { haversineMeters, isWithinTowerCoverage } from "@/lib/map-utils/geometry";
import { setupMapLayers } from "./map-setup";
import { findPathBFS, animateDroneAlongPath } from "./drone-flight";

// Dynamic imports for Leaflet (client-side only)
let L: any = null;
let markerIcon2x: any = null;
let markerIcon: any = null;
let markerShadow: any = null;

export function InteractiveMapView({
  towers,
  drones,
  waypoints,
  inventoryDrones,
}: {
  towers: TowerDTO[];
  drones: DroneDTO[];
  waypoints: WaypointDTO[];
  inventoryDrones: DroneDTO[];
}) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInventoryDrone, setSelectedInventoryDrone] = useState<
    number | null
  >(null);
  const [isPlacingDrone, setIsPlacingDrone] = useState(false);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [alert, setAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const deployedDronesRef = useRef<
    Map<number, { marker: any; circleMarker: any }>
  >(new Map());
  const [graph, setGraph] = useState<{
    nodes: Map<string, { lat: number; lon: number; inCoverage: boolean }>;
    adj: Map<string, Set<string>>;
  } | null>(null);
  const roadNetworkFetchedRef = useRef(false);

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

          (L.Icon.Default as any).mergeOptions({
            iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
            iconUrl: markerIcon.src ?? markerIcon,
            shadowUrl: markerShadow.src ?? markerShadow,
          });
        }

        if (containerRef.current && !mapRef.current) {
          mapRef.current = L.map(containerRef.current);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
            maxZoom: 19,
          }).addTo(mapRef.current);
        }

        const map = mapRef.current;

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
          const towerBounds = L.latLngBounds(
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

    const map = mapRef.current;
    const isInitialRender = drones.length === 0;
    setupMapLayers(
      L,
      map,
      towers,
      drones,
      waypoints,
      deployedDronesRef,
      isInitialRender,
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

    const handleMapClick = async (e: any) => {
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

    (window as any).moveDroneToWaypoint = async (droneId: number) => {
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

      if (!isWithinTowerCoverage(targetWaypoint.latitude, targetWaypoint.longitude, towers)) {
        window.alert("Target waypoint is outside tower coverage!");
        return;
      }

      if (!graph || graph.nodes.size === 0) {
        window.alert("Road network is not loaded yet. Please wait a moment and try again.");
        return;
      }

      const currentPos = droneMarker.getLatLng();

      const path = findPathBFS(
        currentPos.lat,
        currentPos.lng,
        targetWaypoint.latitude,
        targetWaypoint.longitude,
        graph.nodes,
        graph.adj,
      );

      if (path.length === 0) {
        window.alert("No path found! Possible reasons:\n• No continuous road path exists within tower coverage\n• Start or end point too far from any roads (>5km)\n• Towers don't cover the route");
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
        console.log(`Drone will first move ${distanceToFirstPoint.toFixed(0)}m to nearest road`);
      }

      droneMarker.closePopup();

      const pathCoords = [currentPos, ...path.map((p) => L.latLng(p.lat, p.lon))];
      const polyline = L.polyline(pathCoords, {
        color: "blue",
        weight: 3,
        opacity: 0.7,
      }).addTo(mapRef.current);

      animateDroneAlongPath(droneMarker, path, async () => {
        await updateDrone(droneId, {
          latitude: targetWaypoint.latitude,
          longitude: targetWaypoint.longitude,
        });

        mapRef.current.removeLayer(polyline);

        setAlert({
          type: "success",
          message: `${drone.name} reached ${targetWaypoint.name}!`,
        });
        setTimeout(() => setAlert(null), 3000);
      });
    };

    (window as any).returnDroneToInventory = async (droneId: number) => {
      const drone = drones.find((d) => d.id === droneId);
      if (!drone) return;

      try {
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
      } catch (e) {
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
