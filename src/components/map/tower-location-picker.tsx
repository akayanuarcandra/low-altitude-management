"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

let L: any = null;

type TowerOverlay = {
  name: string;
  latitude: number;
  longitude: number;
  rangeMeters: number;
  active?: boolean | null;
};

type Props = {
  nameLat?: string;
  nameLon?: string;
  defaultLat?: number;
  defaultLon?: number;
  towers?: TowerOverlay[];
};

export default function TowerLocationPicker({
  nameLat = "latitude",
  nameLon = "longitude",
  defaultLat,
  defaultLon,
  towers = [],
}: Props) {
  const [lat, setLat] = useState<number | "">(defaultLat ?? "");
  const [lon, setLon] = useState<number | "">(defaultLon ?? "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const overlayGroupRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      if (!L) {
        L = (await import("leaflet")).default;
      }
      if (!containerRef.current || mapRef.current) return;

      const startCenter = [
        typeof lat === "number" ? lat : 0,
        typeof lon === "number" ? lon : 0,
      ];

      mapRef.current = L.map(containerRef.current, {
        center: startCenter as [number, number],
        zoom: typeof lat === "number" && typeof lon === "number" ? 12 : 2,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapRef.current);

      // Create custom icon for new tower placement
      const newTowerIcon = L.icon({
        iconUrl: "/icons/tower-new.svg",
        iconSize: [64, 64],
        iconAnchor: [32, 64],
        popupAnchor: [0, -32],
      });

      if (typeof lat === "number" && typeof lon === "number") {
        markerRef.current = L.marker([lat, lon], { icon: newTowerIcon, draggable: true }).addTo(mapRef.current);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current.getLatLng();
          setLat(Number(p.lat.toFixed(8)));
          setLon(Number(p.lng.toFixed(8)));
        });
      }

      // Add overlay group for existing towers
      overlayGroupRef.current = L.layerGroup().addTo(mapRef.current);

      // If no initial point, try to fit to existing towers
      if (!(typeof lat === "number" && typeof lon === "number") && towers.length > 0) {
        const b = L.latLngBounds([]);
        towers.forEach((t) => b.extend([t.latitude, t.longitude] as [number, number]));
        if (b.isValid()) mapRef.current.fitBounds(b.pad(0.2));
      }

      mapRef.current.on("click", (e: any) => {
        const { lat: clat, lng: clon } = e.latlng;
        setLat(Number(clat.toFixed(8)));
        setLon(Number(clon.toFixed(8)));
        if (!markerRef.current) {
          markerRef.current = L.marker([clat, clon], { icon: newTowerIcon, draggable: true }).addTo(mapRef.current);
          markerRef.current.on("dragend", () => {
            const p = markerRef.current.getLatLng();
            setLat(Number(p.lat.toFixed(8)));
            setLon(Number(p.lng.toFixed(8)));
          });
        } else {
          markerRef.current.setLatLng([clat, clon]);
        }
      });
    };
    init();
  }, []); // Only initialize map once

  // Render existing towers overlays whenever towers change
  useEffect(() => {
    if (!mapRef.current || !overlayGroupRef.current || !L) return;
    const group = overlayGroupRef.current;
    group.clearLayers();

    // Create custom icon for existing towers
    const towerIcon = L.icon({
      iconUrl: "/icons/tower.svg",
      iconSize: [32, 32],
      iconAnchor: [16, 16], // center
      popupAnchor: [0, -16],
    });

    towers.forEach((t) => {
      const center = L.latLng(t.latitude, t.longitude);
      L.circle(center, {
        radius: t.rangeMeters,
        color: t.active === false ? "#888" : "#2563eb",
        fillColor: t.active === false ? "#aaa" : "#60a5fa",
        fillOpacity: 0.15,
        weight: 1,
        interactive: false,
      }).addTo(group);
      L.marker(center, { icon: towerIcon })
        .bindPopup(`<b>${t.name}</b><br/>Range: ${t.rangeMeters} m`)
        .addTo(group);
    });
  }, [towers]);

  // If user types manually, update marker and map
  useEffect(() => {
    if (!mapRef.current || !L) return;
    
    const newTowerIcon = L.icon({
      iconUrl: "/icons/tower-new.svg",
      iconSize: [64, 64],
      iconAnchor: [32, 64],
      popupAnchor: [0, -32],
    });

    if (typeof lat === "number" && typeof lon === "number") {
      const latlng = L.latLng(lat, lon);
      if (!markerRef.current) {
        markerRef.current = L.marker(latlng, { icon: newTowerIcon, draggable: true }).addTo(mapRef.current);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current.getLatLng();
          setLat(Number(p.lat.toFixed(8)));
          setLon(Number(p.lng.toFixed(8)));
        });
      } else {
        markerRef.current.setLatLng(latlng);
      }
    }
  }, [lat, lon]);

  return (
    <>
      <Input
        name={nameLat}
        placeholder="Latitude"
        type="number"
        step="0.00000001"
        value={lat}
        onChange={(e) => {
          const v = e.target.value;
          setLat(v === "" ? "" : Number(v));
        }}
      />
      <Input
        name={nameLon}
        placeholder="Longitude"
        type="number"
        step="0.00000001"
        value={lon}
        onChange={(e) => {
          const v = e.target.value;
          setLon(v === "" ? "" : Number(v));
        }}
      />
      <div ref={containerRef} className="col-span-2 w-full h-140 rounded-md overflow-hidden border" />
    </>
  );
}
