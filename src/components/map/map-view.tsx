"use client";

import { useEffect, useRef, useState } from "react";
import { updateDrone, createWaypoint, deleteWaypoint } from "@/app/actions";

// Dynamic imports for Leaflet (client-side only)
let L: any = null;
let markerIcon2x: any = null;
let markerIcon: any = null;
let markerShadow: any = null;

export type TowerDTO = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  rangeMeters: number;
  active?: boolean | null;
};

export type DroneDTO = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  towerId: number;
  status?: string | null;
};

export type WaypointDTO = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
};

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function MapView({ towers, drones, waypoints }: { towers: TowerDTO[]; drones: DroneDTO[]; waypoints: WaypointDTO[] }) {
  const mapRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingWaypoint, setIsCreatingWaypoint] = useState(false);

  useEffect(() => {
    // Load Leaflet dynamically (client-side only)
    const loadLeaflet = async () => {
      if (!L) {
        L = (await import("leaflet")).default;
        markerIcon2x = (await import("leaflet/dist/images/marker-icon-2x.png")).default;
        markerIcon = (await import("leaflet/dist/images/marker-icon.png")).default;
        markerShadow = (await import("leaflet/dist/images/marker-shadow.png")).default;

        // Fix default marker icons
        (L.Icon.Default as any).mergeOptions({
          iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
          iconUrl: markerIcon.src ?? markerIcon,
          shadowUrl: markerShadow.src ?? markerShadow,
        });
      }
      setIsLoading(false);
    };

    loadLeaflet();
  }, []);

  useEffect(() => {
    if (!containerRef.current || !L || isLoading) return;

    // Initialize map once
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: [0, 0],
        zoom: 2,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapRef.current);

      layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current!;
    const layerGroup = layerGroupRef.current!;

    // Clear previous overlays
    layerGroup.clearLayers();

    const bounds = L.latLngBounds([]);

    // Draw towers as range circles (non-interactive to allow waypoint creation)
    towers.forEach((t) => {
      const center = L.latLng(t.latitude, t.longitude);
      L.circle(center, {
        radius: t.rangeMeters,
        color: t.active === false ? "#888" : "#2563eb",
        fillColor: t.active === false ? "#aaa" : "#60a5fa",
        fillOpacity: 0.2,
        weight: 1,
        interactive: false, // Allow clicks to pass through to map
      })
        .addTo(layerGroup);
      
      // Add a small marker at tower center for the popup
      L.circleMarker(center, {
        radius: 6,
        color: "#2563eb",
        fillColor: "#60a5fa",
        fillOpacity: 0.8,
        weight: 2,
      })
        .bindPopup(`<b>${t.name}</b><br/>Range: ${t.rangeMeters} m`)
        .addTo(layerGroup);
      bounds.extend(center);
    });

    // Add drones as draggable markers
    drones.forEach((d) => {
      const pos = L.latLng(d.latitude, d.longitude);
      const waypointOptions = waypoints.map((w) => `<option value="${w.id}">${w.name}</option>`).join('');
      const marker = L.marker(pos, { draggable: true })
        .bindPopup(`
          <div>
            <b>${d.name}</b><br/>
            Status: ${d.status ?? "-"}<br/>
            Tower: ${d.towerId}<br/>
            ${waypoints.length > 0 ? `
              <div style="margin-top:8px;">
                <select id="waypoint-select-${d.id}" style="padding:2px 4px;border:1px solid #ccc;border-radius:4px;">
                  <option value="">Select Waypoint</option>
                  ${waypointOptions}
                </select>
                <button onclick="window.moveDroneToWaypoint(${d.id})" style="margin-left:4px;padding:2px 8px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;">Move</button>
              </div>
            ` : ''}
          </div>
        `)
        .addTo(layerGroup);

      marker.on("dragend", async () => {
        const newPos = marker.getLatLng();
        const prevPos = pos;
        // Client-side range validation against current tower
        const tower = towers.find((t) => t.id === d.towerId);
        if (tower) {
          const dist = haversineMeters(newPos.lat, newPos.lng, tower.latitude, tower.longitude);
          if (dist > tower.rangeMeters) {
            marker.setLatLng(prevPos);
            return;
          }
        }
        try {
          await updateDrone(d.id, {
            name: d.name,
            latitude: newPos.lat,
            longitude: newPos.lng,
            towerId: d.towerId,
            status: d.status ?? "",
          });
        } catch (e) {
          // Revert if server rejects (e.g., out of range)
          marker.setLatLng(prevPos);
        }
      });

      bounds.extend(pos);
    });

    // Render waypoints as green circle markers
    waypoints.forEach((w) => {
      const pos = L.latLng(w.latitude, w.longitude);
      const waypointIcon = L.divIcon({
        className: 'waypoint-marker',
        html: '<div style="background:#10b981;width:20px;height:20px;border-radius:50%;border:2px solid white;"></div>',
        iconSize: [20, 20],
      });
      const marker = L.marker(pos, { icon: waypointIcon })
        .bindPopup(`
          <div>
            <b>${w.name}</b><br/>
            Lat: ${w.latitude.toFixed(6)}<br/>
            Lon: ${w.longitude.toFixed(6)}<br/>
            <button onclick="window.deleteWaypoint(${w.id})" style="margin-top:4px;padding:2px 8px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">Delete</button>
          </div>
        `)
        .addTo(layerGroup);
      bounds.extend(pos);
    });

    // Map click handler to create waypoints (only when enabled)
    const handleMapClick = async (e: any) => {
      if (!isCreatingWaypoint) return;
      
      const { lat, lng } = e.latlng;
      const name = prompt(`Create waypoint at (${lat.toFixed(6)}, ${lng.toFixed(6)})?\nEnter waypoint name:`);
      if (name && name.trim()) {
        const formData = new FormData();
        formData.append('name', name.trim());
        formData.append('latitude', String(lat));
        formData.append('longitude', String(lng));
        await createWaypoint(formData);
        setIsCreatingWaypoint(false);
      }
    };
    map.off('click');
    map.on('click', handleMapClick);

    // Expose deleteWaypoint to window for popup buttons
    (window as any).deleteWaypoint = async (id: number) => {
      if (confirm('Delete this waypoint?')) {
        await deleteWaypoint(id);
      }
    };

    // Expose moveDroneToWaypoint to window for popup buttons
    (window as any).moveDroneToWaypoint = async (droneId: number) => {
      const selectEl = document.getElementById(`waypoint-select-${droneId}`) as HTMLSelectElement;
      if (!selectEl || !selectEl.value) {
        alert('Please select a waypoint first');
        return;
      }
      const waypointId = parseInt(selectEl.value, 10);
      const waypoint = waypoints.find((w) => w.id === waypointId);
      const drone = drones.find((d) => d.id === droneId);
      if (!waypoint || !drone) return;

      // Find the marker for this drone
      let droneMarker: any = null;
      layerGroup.eachLayer((layer: any) => {
        if (layer instanceof L.Marker && layer.getLatLng().lat === drone.latitude && layer.getLatLng().lng === drone.longitude) {
          droneMarker = layer;
        }
      });

      if (!droneMarker) return;

      // Close the popup
      droneMarker.closePopup();

      // Animate the movement
      const startPos = L.latLng(drone.latitude, drone.longitude);
      const endPos = L.latLng(waypoint.latitude, waypoint.longitude);
      const duration = 2000; // 2 seconds
      const steps = 60;
      const stepDuration = duration / steps;

      let currentStep = 0;
      const animate = () => {
        currentStep++;
        const progress = currentStep / steps;
        
        // Linear interpolation
        const lat = startPos.lat + (endPos.lat - startPos.lat) * progress;
        const lng = startPos.lng + (endPos.lng - startPos.lng) * progress;
        
        droneMarker.setLatLng([lat, lng]);

        if (currentStep < steps) {
          setTimeout(animate, stepDuration);
        } else {
          // Update database after animation completes
          updateDrone(droneId, {
            name: drone.name,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            towerId: drone.towerId,
            status: drone.status ?? "",
          }).catch(() => {
            alert('Failed to move drone. It may be out of tower range.');
            droneMarker.setLatLng(startPos); // Revert position
          });
        }
      };

      animate();
    };

    if (!bounds.isValid()) {
      map.setView([0, 0], 2);
    } else {
      map.fitBounds(bounds.pad(0.2));
    }
  }, [towers, drones, waypoints, isLoading, isCreatingWaypoint]);

  if (isLoading) {
    return (
      <div className="w-full h-[70vh] rounded-md overflow-hidden border flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsCreatingWaypoint(!isCreatingWaypoint)}
        className={`px-4 py-2 rounded-md font-medium transition-colors ${
          isCreatingWaypoint
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
        }`}
      >
        {isCreatingWaypoint ? '✓ Click map to place waypoint' : '+ Create Waypoint'}
      </button>
      <div className="w-full h-[70vh] rounded-md overflow-hidden border" ref={containerRef} />
    </div>
  );
}
