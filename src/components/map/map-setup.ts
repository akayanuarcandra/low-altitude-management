import { TowerDTO, DroneDTO, WaypointDTO } from "./types";
import { haversineMeters } from "./map-helpers";
import { updateDrone } from "@/app/actions";
import type { MutableRefObject } from "react";
import type { DroneAnimationController } from "./drone-animations";

export function setupMapLayers(
  L: any,
  map: any,
  towers: TowerDTO[],
  drones: DroneDTO[],
  waypoints: WaypointDTO[],
  stations: { id: number; name: string; latitude: number; longitude: number }[],
  deployedDronesRef: React.MutableRefObject<
    Map<number, { marker: any; circleMarker: any }>
  >,
  autoFitBounds: boolean = false,
  droneAnimationStateRef?: MutableRefObject<
    Map<number, DroneAnimationController>
  >,
) {
  // Do not clear all layers here. Instead manage drone markers individually so in-flight animations are not interrupted.
  // Remove markers for drones that no longer exist in the provided drones list.
  const currentDroneIds = new Set(
    (drones || []).filter((d) => d && d.id != null).map((d) => d.id),
  );
  for (const [id, entry] of deployedDronesRef.current.entries()) {
    if (!currentDroneIds.has(id)) {
      try {
        map.removeLayer(entry.marker);
      } catch (e) {
        // ignore removal errors
      }
      deployedDronesRef.current.delete(id);
    }
  }

  // Draw towers with range circles
  if (towers && towers.length > 0) {
    // Ensure a single layer group exists for tower circles on this map and clear it
    // before adding new circles. This prevents tileing/opacity accumulation when the
    // function runs multiple times.
    try {
      if (!map._towerLayerGroup) {
        map._towerLayerGroup = L.layerGroup().addTo(map);
      } else {
        map._towerLayerGroup.clearLayers();
      }
    } catch (e) {
      // If the map object doesn't support custom properties for some reason, ignore and proceed.
    }
    towers.forEach((tower) => {
      const center = L.latLng(tower.latitude, tower.longitude);

      // Range circle - add to the per-map tower layer group so previous circles are replaced
      L.circle(center, {
        radius: tower.rangeMeters,
        color: "#2563eb",
        fillColor: "#60a5fa",
        fillOpacity: 0.2,
        weight: 1,
        interactive: false,
      }).addTo((map as any)._towerLayerGroup ?? map);

      // Tower marker with custom icon
      const towerIcon = L.icon({
        iconUrl: "/icons/tower.svg",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });
      L.marker(center, { icon: towerIcon })
        .bindPopup(
          `<strong>${tower.name}</strong><br/>Range: ${tower.rangeMeters}m`,
        )
        .addTo(map);
    });

    // Auto fit to towers only on initial load
    if (autoFitBounds) {
      const group = new L.featureGroup(
        towers.map((t) => L.marker([t.latitude, t.longitude])),
      );
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  // Draw deployed drones (reuse markers to avoid disturbing in-flight animations)
  {
    // Build a simple HTML snippet for popups
    const buildPopupHtml = (drone: DroneDTO) => {
      const waypointOptions = waypoints
        .map((w) => `<option value="${w.id}">${w.name}</option>`)
        .join("");
      return `
                <div>
                    <b>${drone.name}</b><br/>
                    Status: ${drone.status || "deployed"}<br/>
                    ${
                      waypoints.length > 0
                        ? `
                        <div style="margin-top:8px;">
                            <label style="font-size:12px;color:#666;">Fly to waypoint:</label><br/>
                            <select id="waypoint-select-${drone.id}" style="padding:4px;border:1px solid #ccc;border-radius:4px;width:100%;margin-top:2px;">
                                <option value="">Select waypoint...</option>
                                ${waypointOptions}
                            </select>
                            <button onclick="window.moveDroneToWaypoint(${drone.id})" style="margin-top:4px;padding:4px 12px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;font-weight:500;">Fly Drone</button>
                        </div>
                    `
                        : ""
                    }
                    <div style="margin-top:8px;">
                        <!-- Patrol feature removed -->
                    </div>
                </div>
            `;
    };

    // Ensure we have a set of drone ids that should exist
    const presentIds = new Set(
      (drones || []).filter((d) => d && d.id != null).map((d) => d.id),
    );

    // Update existing markers or create them if missing
    if (drones && drones.length > 0) {
      drones.forEach((drone) => {
        if (drone.latitude == null || drone.longitude == null) return;

        const existingEntry = deployedDronesRef.current.get(drone.id);

        const popupHtml = buildPopupHtml(drone);

        if (existingEntry && existingEntry.marker) {
          // Update position and popup without recreating marker
          try {
            existingEntry.marker.setLatLng([drone.latitude, drone.longitude]);
            // update popup content
            if (typeof existingEntry.marker.setPopupContent === "function") {
              existingEntry.marker.setPopupContent(popupHtml);
            } else {
              existingEntry.marker.bindPopup(popupHtml);
            }
          } catch (e) {
            // ignore transient errors (marker removal etc.)
          }
        } else {
          // Create new marker as before
          const droneIcon = L.icon({
            iconUrl: "/icons/drone.svg",
            iconSize: [64, 64],
            iconAnchor: [32, 64],
            popupAnchor: [0, -64],
          });
          const marker = L.marker([drone.latitude, drone.longitude], {
            icon: droneIcon,
            draggable: true,
          })
            .bindPopup(popupHtml)
            .addTo(map);

          deployedDronesRef.current.set(drone.id, {
            marker,
            circleMarker: null,
          });

          // Make drones draggable - preserve last valid pos per marker
          let lastValidPos = marker.getLatLng();

          marker.on("dragstart", () => {
            lastValidPos = marker.getLatLng();
          });

          marker.on("dragend", async () => {
            const newPos = marker.getLatLng();

            // Check if within ANY tower range
            let assignedTower: TowerDTO | null = null;
            for (const tower of towers) {
              const distance = haversineMeters(
                newPos.lat,
                newPos.lng,
                tower.latitude,
                tower.longitude,
              );
              if (distance <= tower.rangeMeters) {
                assignedTower = tower;
                break;
              }
            }

            if (!assignedTower) {
              window.alert(
                `${drone.name} is outside tower coverage areas! Reverting position.`,
              );
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

    // Remove any markers for drones no longer present (safety - already handled above, but double-check)
    for (const [id, entry] of deployedDronesRef.current.entries()) {
      if (!presentIds.has(id)) {
        try {
          map.removeLayer(entry.marker);
        } catch (e) {
          // ignore
        }
        deployedDronesRef.current.delete(id);
      }
    }
  }

  // Draw waypoints
  if (waypoints && waypoints.length > 0) {
    waypoints.forEach((waypoint) => {
      const waypointIcon = L.icon({
        iconUrl: "/icons/waypoint.svg",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      });
      L.marker([waypoint.latitude, waypoint.longitude], {
        icon: waypointIcon,
        draggable: false,
      })
        .bindPopup(`<strong>${waypoint.name}</strong>`)
        .addTo(map);
    });
  }

  // Draw stations
  if (stations && stations.length > 0) {
    stations.forEach((station) => {
      const stationIcon = L.icon({
        iconUrl: "/icons/station.svg",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -12],
      });
      const stationMarker = L.marker([station.latitude, station.longitude], {
        icon: stationIcon,
        draggable: false,
      })
        .bindPopup(`<strong>${station.name}</strong>`) // could add actions later
        .addTo(map);

      // When clicked, attempt to delegate deployment to the InteractiveMapView
      // handler (which knows about placement mode). If the handler returns
      // handled: true, suppress the default popup so the click feels like a
      // deployment action. Otherwise let the popup show as normal.
      try {
        stationMarker.on("click", async function (ev: any) {
          try {
            if (typeof (window as any).deploySelectedInventoryDroneToStation === "function") {
              const res = await (window as any).deploySelectedInventoryDroneToStation(
                station.id,
              );
              if (res && res.handled) {
                try {
                  stationMarker.closePopup();
                } catch {}
              }
            }
          } catch (e) {
            // ignore
          }
        });
      } catch (e) {
        // ignore binding errors
      }
    });
  }
}
