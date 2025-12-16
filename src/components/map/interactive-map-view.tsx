"use client";

import { useEffect, useRef, useState } from "react";
import { updateDrone, createWaypoint } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import "leaflet/dist/leaflet.css";
import { TowerDTO, DroneDTO, WaypointDTO } from "./types";
import { haversineMeters, isWithinTowerCoverage, findPath } from "./map-helpers";
import { animateDroneMovement } from "./drone-animations";
import { setupMapLayers } from "./map-setup";
import { MapControls } from "./map-controls";

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
    const [selectedInventoryDrone, setSelectedInventoryDrone] = useState<number | null>(null);
    const [isPlacingDrone, setIsPlacingDrone] = useState(false);
    const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
    const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const deployedDronesRef = useRef<Map<number, { marker: any; circleMarker: any }>>(new Map());
    const droneAnimationStateRef = useRef<any>(globalThis.Map ? new globalThis.Map() : {});

    useEffect(() => {
        // Load Leaflet dynamically (client-side only)
        const loadLeaflet = async () => {
            try {
                console.log("Starting Leaflet load...");
                if (!L) {
                    console.log("L not defined, importing leaflet");
                    L = (await import("leaflet")).default;
                    console.log("Leaflet imported:", L);

                    markerIcon2x = (await import("leaflet/dist/images/marker-icon-2x.png")).default;
                    markerIcon = (await import("leaflet/dist/images/marker-icon.png")).default;
                    markerShadow = (await import("leaflet/dist/images/marker-shadow.png")).default;
                    console.log("Marker icons imported");

                    // Fix default marker icons
                    (L.Icon.Default as any).mergeOptions({
                        iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
                        iconUrl: markerIcon.src ?? markerIcon,
                        shadowUrl: markerShadow.src ?? markerShadow,
                    });
                    console.log("Marker icons merged");
                }
                console.log("Setting isLoading to false");
                setIsLoading(false);
            } catch (error) {
                console.error("Error loading Leaflet:", error);
            }
        };

        loadLeaflet();
    }, []);

    useEffect(() => {
        if (!containerRef.current || !L || isLoading) return;

        console.log("Map init: containerRef exists, L exists, isLoading=false");
        console.log("Towers:", towers);
        console.log("Drones:", drones);

        // Initialize map
        if (!mapRef.current) {
            console.log("Creating new map instance");
            try {
                mapRef.current = L.map(containerRef.current).setView([40.7128, -74.006], 12);
                console.log("Map created successfully");

                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19,
                }).addTo(mapRef.current);
                console.log("Tile layer added");

                // Ensure map renders properly
                setTimeout(() => {
                    console.log("Calling invalidateSize");
                    mapRef.current?.invalidateSize();
                }, 100);
            } catch (error) {
                console.error("Error initializing map:", error);
                return;
            }
        }

        const map = mapRef.current;
        console.log("Map instance ready", map);

        // Setup all map layers (towers, drones, waypoints)
        setupMapLayers(L, map, towers, drones, waypoints, deployedDronesRef, droneAnimationStateRef);

        // Click handler for placing drone or adding waypoint
        let isDragging = false;

        const handleDragStart = () => {
            isDragging = true;
        };

        const handleDragEnd = () => {
            // Small delay to prevent click from firing after drag
            setTimeout(() => {
                isDragging = false;
            }, 100);
        };

        const handleMapClick = async (e: any) => {
            // Ignore clicks that are actually the end of a drag
            if (isDragging) return;

            const { lat, lng } = e.latlng;

            // Handle waypoint creation
            if (isAddingWaypoint) {
                const name = prompt(`Create waypoint at (${lat.toFixed(6)}, ${lng.toFixed(6)})?\nEnter waypoint name:`);
                if (name && name.trim()) {
                    const formData = new FormData();
                    formData.append('name', name.trim());
                    formData.append('latitude', String(lat));
                    formData.append('longitude', String(lng));
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

            // Handle drone placement
            if (!isPlacingDrone || !selectedInventoryDrone) return;

            const droneToPlace = inventoryDrones.find((d) => d.id === selectedInventoryDrone);

            if (!droneToPlace) return;

            // Find which tower this location is within
            let assignedTower: TowerDTO | null = null;
            for (const tower of towers) {
                const distance = haversineMeters(lat, lng, tower.latitude, tower.longitude);
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

            // Deploy the drone
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

        // Expose drone movement functions to window for popup buttons
        (window as any).moveDroneToWaypoint = async (droneId: number) => {
            const waypointSelectEl = document.getElementById(`waypoint-select-${droneId}`) as HTMLSelectElement;
            if (!waypointSelectEl || !waypointSelectEl.value) {
                window.alert("Please select a waypoint first");
                return;
            }

            const waypointId = parseInt(waypointSelectEl.value, 10);
            const targetWaypoint = waypoints.find((w) => w.id === waypointId);
            const drone = drones.find((d) => d.id === droneId);

            if (!targetWaypoint || !drone || !drone.latitude || !drone.longitude) return;

            const droneMarker = deployedDronesRef.current.get(droneId)?.marker;
            if (!droneMarker) return;

            const currentPos = droneMarker.getLatLng();

            // Check if target is within coverage
            if (!isWithinTowerCoverage(targetWaypoint.latitude, targetWaypoint.longitude, towers)) {
                window.alert("Target waypoint is out of range of all towers!");
                return;
            }

            // Find path through waypoints
            const path = findPath(currentPos.lat, currentPos.lng, targetWaypoint, waypoints, towers);

            if (path.length === 0) {
                window.alert("No safe path found to target waypoint!");
                return;
            }

            try {
                animateDroneMovement(
                    L,
                    droneId,
                    drone,
                    droneMarker,
                    path,
                    targetWaypoint,
                    currentPos,
                    droneAnimationStateRef,
                    setAlert
                );
            } catch (e) {
                setAlert({
                    type: "error",
                    message: "Failed to move drone to waypoint",
                });
                setTimeout(() => setAlert(null), 3000);
            }
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
            // Clean up animation state for drones that are no longer deployed
            const deployedDroneIds = new Set(drones.filter(d => d.latitude && d.longitude).map(d => d.id));
            for (const [droneId] of droneAnimationStateRef.current) {
                if (!deployedDroneIds.has(droneId)) {
                    droneAnimationStateRef.current.delete(droneId);
                }
            }
        };
    }, [towers, waypoints, drones, isPlacingDrone, selectedInventoryDrone, isLoading, isAddingWaypoint, inventoryDrones]);

    return (
        <div className="space-y-4">
            {/* Main Layout: Map and Sidebar Side by Side */}
            <div className="flex gap-4">
                {/* Map Section */}
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

                {/* Sidebar with Controls */}
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