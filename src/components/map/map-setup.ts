import { TowerDTO, DroneDTO, WaypointDTO } from "./types";
import { haversineMeters } from "./map-helpers";
import { updateDrone } from "@/app/actions";

export function setupMapLayers(
    L: any,
    map: any,
    towers: TowerDTO[],
    drones: DroneDTO[],
    waypoints: WaypointDTO[],
    deployedDronesRef: React.MutableRefObject<Map<number, { marker: any; circleMarker: any }>>,
    autoFitBounds: boolean = false
) {
    // Clear all layers except the tile layer
    for (const layer of Object.values(map._layers) as any[]) {
        if (layer.setLatLng || layer.setLatLngs || (layer._radius && !layer._container)) {
            // This is a marker or circle
            map.removeLayer(layer);
        }
    }

    // Draw towers with range circles
    if (towers && towers.length > 0) {
        towers.forEach((tower) => {
            const center = L.latLng(tower.latitude, tower.longitude);

            // Range circle
            L.circle(center, {
                radius: tower.rangeMeters,
                color: "#2563eb",
                fillColor: "#60a5fa",
                fillOpacity: 0.2,
                weight: 1,
                interactive: false,
            }).addTo(map);

            // Tower marker with custom icon
            const towerIcon = L.icon({
                iconUrl: '/icons/tower.svg',
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16],
            });
            L.marker(center, { icon: towerIcon })
                .bindPopup(`<strong>${tower.name}</strong><br/>Range: ${tower.rangeMeters}m`)
                .addTo(map);
        });

        // Auto fit to towers only on initial load
        if (autoFitBounds) {
            const group = new L.featureGroup(
                towers.map((t) => L.marker([t.latitude, t.longitude]))
            );
            map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    // Draw deployed drones
    if (drones && drones.length > 0) {
        drones.forEach((drone) => {
            if (drone.latitude && drone.longitude) {
                const existingEntry = deployedDronesRef.current.get(drone.id);

                // Remove old marker if it exists
                if (existingEntry) {
                    map.removeLayer(existingEntry.marker);
                    deployedDronesRef.current.delete(drone.id);
                }

                const waypointOptions = waypoints.map((w) => `<option value="${w.id}">${w.name}</option>`).join('');

                const droneIcon = L.icon({
                    iconUrl: '/icons/drone.svg',
                    iconSize: [64, 64],
                    iconAnchor: [32, 64],
                    popupAnchor: [0, -64],
                });
                const marker = L.marker([drone.latitude, drone.longitude], { icon: droneIcon, draggable: true })
                    .bindPopup(`
                        <div>
                            <b>${drone.name}</b><br/>
                            Status: ${drone.status || "deployed"}<br/>
                            ${waypoints.length > 0 ? `
                                <div style="margin-top:8px;">
                                    <label style="font-size:12px;color:#666;">Fly to waypoint:</label><br/>
                                    <select id="waypoint-select-${drone.id}" style="padding:4px;border:1px solid #ccc;border-radius:4px;width:100%;margin-top:2px;">
                                        <option value="">Select waypoint...</option>
                                        ${waypointOptions}
                                    </select>
                                    <button onclick="window.moveDroneToWaypoint(${drone.id})" style="margin-top:4px;padding:4px 12px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;font-weight:500;">Fly Drone</button>
                                </div>
                            ` : ''}
                            <button onclick="window.returnDroneToInventory(${drone.id})" style="margin-top:8px;padding:2px 8px;background:#f59e0b;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;">Return to Inventory</button>
                        </div>
                    `)
                    .addTo(map);

                deployedDronesRef.current.set(drone.id, { marker, circleMarker: null });

                // Make drones draggable
                let lastValidPos = marker.getLatLng();

                marker.on("dragstart", () => {
                    lastValidPos = marker.getLatLng();
                });

                marker.on("dragend", async () => {
                    const newPos = marker.getLatLng();

                    // Check if within ANY tower range
                    let assignedTower: TowerDTO | null = null;
                    for (const tower of towers) {
                        const distance = haversineMeters(newPos.lat, newPos.lng, tower.latitude, tower.longitude);
                        if (distance <= tower.rangeMeters) {
                            assignedTower = tower;
                            break;
                        }
                    }

                    if (!assignedTower) {
                        window.alert(`${drone.name} is outside tower coverage areas! Reverting position.`);
                        marker.setLatLng(lastValidPos);
                        return;
                    }

                    try {
                        await updateDrone(drone.id, {
                            latitude: newPos.lat,
                            longitude: newPos.lng,
                            towerId: assignedTower.id,
                        });
                        lastValidPos = newPos;
                    } catch (e) {
                        marker.setLatLng(lastValidPos);
                    }
                });
            }
        });
    }

    // Draw waypoints
    if (waypoints && waypoints.length > 0) {
        waypoints.forEach((waypoint) => {
            const waypointIcon = L.icon({
                iconUrl: '/icons/waypoint.svg',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
                popupAnchor: [0, -12],
            });
            L.marker([waypoint.latitude, waypoint.longitude], { icon: waypointIcon, draggable: false })
                .bindPopup(`<strong>${waypoint.name}</strong>`)
                .addTo(map);
        });
    }
}
