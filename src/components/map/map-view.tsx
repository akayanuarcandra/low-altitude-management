"use client";

import { useEffect, useRef, useState } from "react";
import { updateDrone, createWaypoint, deleteWaypoint, deleteTower } from "@/app/actions";

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

export function MapView({
  towers,
  drones,
  waypoints,
  showWaypointToggle = true,
}: {
  towers: TowerDTO[];
  drones: DroneDTO[];
  waypoints: WaypointDTO[];
  showWaypointToggle?: boolean;
}) {
  const mapRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const droneMarkersRef = useRef<any>(globalThis.Map ? new globalThis.Map() : {});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingWaypoint, setIsCreatingWaypoint] = useState(false);

  useEffect(() => {
    const loadLeaflet = async () => {
      if (!L) {
        L = (await import("leaflet")).default;
        markerIcon2x = (await import("leaflet/dist/images/marker-icon-2x.png")).default;
        markerIcon = (await import("leaflet/dist/images/marker-icon.png")).default;
        markerShadow = (await import("leaflet/dist/images/marker-shadow.png")).default;

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

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: [0, 0],
        zoom: 2,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current);

      layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;

    layerGroup.clearLayers();
    droneMarkersRef.current.clear();

    const bounds = L.latLngBounds([]);

    towers.forEach((t) => {
      const center = L.latLng(t.latitude, t.longitude);
      L.circle(center, {
        radius: t.rangeMeters,
        color: t.active === false ? "#888" : "#2563eb",
        fillColor: t.active === false ? "#aaa" : "#60a5fa",
        fillOpacity: 0.2,
        weight: 1,
        interactive: false,
      }).addTo(layerGroup);

      const towerIcon = L.icon({
        iconUrl: "/icons/tower.svg",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });
      L.marker(center, { icon: towerIcon })
        .bindPopup(
          `<div>
            <b>${t.name}</b><br/>
            Range: ${t.rangeMeters} m<br/>
            Lat: ${t.latitude.toFixed(6)}<br/>
            Lon: ${t.longitude.toFixed(6)}<br/>
            <a href="/dashboard/towers/${t.id}/edit" style="margin-top:4px;margin-right:6px;display:inline-block;padding:2px 8px;border:1px solid #cbd5e1;border-radius:4px;color:#0f172a;text-decoration:none;background:white;">Edit</a>
            <button onclick="window.deleteTower(${t.id})" style="margin-top:4px;padding:2px 8px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">Delete</button>
          </div>`
        )
        .addTo(layerGroup);
      bounds.extend(center);
    });

    drones.forEach((d) => {
      const pos = L.latLng(d.latitude, d.longitude);
      const droneIcon = L.icon({
        iconUrl: "/icons/drone.svg",
        iconSize: [64, 64],
        iconAnchor: [32, 64],
        popupAnchor: [0, -64],
      });
      const marker = L.marker(pos, { icon: droneIcon, draggable: true })
        .bindPopup(
          `<div>
            <b>${d.name}</b><br/>
            Status: ${d.status ?? "-"}<br/>
            Tower: ${d.towerId}<br/>
          </div>`
        )
        .addTo(layerGroup);

      droneMarkersRef.current.set(d.id, marker);

      let lastValidPos = marker.getLatLng();

      marker.on("dragstart", () => {
        lastValidPos = marker.getLatLng();
      });

      marker.on("dragend", async () => {
        const newPos = marker.getLatLng();
        const prevPos = lastValidPos;
        const isWithinAnyTower = towers.some((t) => {
          if (t.active === false) return false;
          const dist = haversineMeters(newPos.lat, newPos.lng, t.latitude, t.longitude);
          return dist <= t.rangeMeters;
        });

        if (!isWithinAnyTower) {
          marker.setLatLng(prevPos);
          return;
        }
        try {
          await updateDrone(d.id, {
            name: d.name,
            latitude: newPos.lat,
            longitude: newPos.lng,
            towerId: d.towerId,
            status: d.status ?? "",
          });
          lastValidPos = newPos;
        } catch (e) {
          marker.setLatLng(prevPos);
        }
      });

      bounds.extend(pos);
    });

    waypoints.forEach((w) => {
      const pos = L.latLng(w.latitude, w.longitude);
      const waypointIcon = L.icon({
        iconUrl: "/icons/waypoint.svg",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      });
      const marker = L.marker(pos, { icon: waypointIcon, draggable: false })
        .bindPopup(
          `<div>
            <b>${w.name}</b><br/>
            Lat: ${w.latitude.toFixed(6)}<br/>
            Lon: ${w.longitude.toFixed(6)}<br/>
            <a href="/dashboard/waypoints/${w.id}/edit" style="margin-top:4px;margin-right:6px;display:inline-block;padding:2px 8px;border:1px solid #cbd5e1;border-radius:4px;color:#0f172a;text-decoration:none;background:white;">Edit</a>
            <button onclick="window.deleteWaypoint(${w.id})" style="margin-top:4px;padding:2px 8px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">Delete</button>
          </div>`
        )
        .addTo(layerGroup);
      bounds.extend(pos);
    });

    const handleMapClick = async (e: any) => {
      if (!isCreatingWaypoint) return;

      const { lat, lng } = e.latlng;
      const name = prompt(
        `Create waypoint at (${lat.toFixed(6)}, ${lng.toFixed(6)})?\nEnter waypoint name:`,
      );
      if (name && name.trim()) {
        const formData = new FormData();
        formData.append("name", name.trim());
        formData.append("latitude", String(lat));
        formData.append("longitude", String(lng));
        await createWaypoint(formData);
        setIsCreatingWaypoint(false);
      }
    };
    map.off("click");
    map.on("click", handleMapClick);

    (window as any).deleteWaypoint = async (id: number) => {
      if (confirm("Delete this waypoint?")) {
        await deleteWaypoint(id);
      }
    };

    (window as any).deleteTower = async (id: number) => {
      if (confirm("Delete this tower?")) {
        await deleteTower(id);
      }
    };

    const isWithinTowerCoverage = (lat: number, lng: number): boolean => {
      return towers.some((t) => {
        if (t.active === false) return false;
        const dist = haversineMeters(lat, lng, t.latitude, t.longitude);
        return dist <= t.rangeMeters;
      });
    };

    if (!bounds.isValid()) {
      map.setView([0, 0], 2);
    } else {
      map.fitBounds(bounds.pad(0.2));
    }
  }, [towers, drones, waypoints, isLoading, isCreatingWaypoint]);

  if (isLoading) {
    return (
      <div className="w-full h-full rounded-md overflow-hidden border flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {showWaypointToggle && (
        <button
          onClick={() => setIsCreatingWaypoint(!isCreatingWaypoint)}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            isCreatingWaypoint
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          {isCreatingWaypoint ? "✓ Click map to place waypoint" : "+ Create Waypoint"}
        </button>
      )}
      <div className="w-full flex-1 rounded-md overflow-hidden border" ref={containerRef} />
    </div>
  );
}
