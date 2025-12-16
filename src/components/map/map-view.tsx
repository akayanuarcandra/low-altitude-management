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

export function MapView({ towers, drones, waypoints, showWaypointToggle = true }: { towers: TowerDTO[]; drones: DroneDTO[]; waypoints: WaypointDTO[]; showWaypointToggle?: boolean }) {
  const mapRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const droneMarkersRef = useRef<any>(globalThis.Map ? new globalThis.Map() : {});
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
    droneMarkersRef.current.clear();

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
      
      // Add tower marker with custom icon
      const towerIcon = L.icon({
        iconUrl: '/icons/tower.svg',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });
      L.marker(center, { icon: towerIcon })
        .bindPopup(`
          <div>
            <b>${t.name}</b><br/>
            Range: ${t.rangeMeters} m<br/>
            Lat: ${t.latitude.toFixed(6)}<br/>
            Lon: ${t.longitude.toFixed(6)}<br/>
            <a href="/dashboard/towers/${t.id}/edit" style="margin-top:4px;margin-right:6px;display:inline-block;padding:2px 8px;border:1px solid #cbd5e1;border-radius:4px;color:#0f172a;text-decoration:none;background:white;">Edit</a>
            <button onclick="window.deleteTower(${t.id})" style="margin-top:4px;padding:2px 8px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;">Delete</button>
          </div>
        `)
        .addTo(layerGroup);
      bounds.extend(center);
    });

    // Add drones as draggable markers
    drones.forEach((d) => {
      const pos = L.latLng(d.latitude, d.longitude);
      const waypointOptions = waypoints.map((w) => `<option value="${w.id}">${w.name}</option>`).join('');
      const droneIcon = L.icon({
        iconUrl: '/icons/drone.svg',
        iconSize: [64, 64],
        iconAnchor: [32, 64],
        popupAnchor: [0, -64],
      });
      const marker = L.marker(pos, { icon: droneIcon, draggable: true })
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

      // Store marker reference by drone ID
      droneMarkersRef.current.set(d.id, marker);

      // Track last valid position to properly revert on invalid drags
      let lastValidPos = marker.getLatLng();

      marker.on("dragstart", () => {
        // Capture position at drag start as the fallback point
        lastValidPos = marker.getLatLng();
      });

      marker.on("dragend", async () => {
        const newPos = marker.getLatLng();
        const prevPos = lastValidPos;
        // Client-side range validation - check if within ANY active tower range
        const isWithinAnyTower = towers.some((t) => {
          if (t.active === false) return false;
          const dist = haversineMeters(newPos.lat, newPos.lng, t.latitude, t.longitude);
          return dist <= t.rangeMeters;
        });
        
        if (!isWithinAnyTower) {
          alert('Drone must be within range of at least one active tower!');
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
          // Persisted successfully; update our last known good position
          lastValidPos = newPos;
        } catch (e) {
          // Revert if server rejects (e.g., out of range)
          marker.setLatLng(prevPos);
        }
      });

      bounds.extend(pos);
    });

    // Render waypoints with custom icon
    waypoints.forEach((w) => {
      const pos = L.latLng(w.latitude, w.longitude);
      const waypointIcon = L.icon({
        iconUrl: '/icons/waypoint.svg',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      });
      const marker = L.marker(pos, { icon: waypointIcon, draggable: false })
        .bindPopup(`
          <div>
            <b>${w.name}</b><br/>
            Lat: ${w.latitude.toFixed(6)}<br/>
            Lon: ${w.longitude.toFixed(6)}<br/>
            <a href="/dashboard/waypoints/${w.id}/edit" style="margin-top:4px;margin-right:6px;display:inline-block;padding:2px 8px;border:1px solid #cbd5e1;border-radius:4px;color:#0f172a;text-decoration:none;background:white;">Edit</a>
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

    // Expose deleteTower to window for popup buttons
    (window as any).deleteTower = async (id: number) => {
      if (confirm('Delete this tower?')) {
        await deleteTower(id);
      }
    };

    // Helper: Check if a position is within tower coverage
    const isWithinTowerCoverage = (lat: number, lng: number): boolean => {
      return towers.some((t) => {
        if (t.active === false) return false;
        const dist = haversineMeters(lat, lng, t.latitude, t.longitude);
        return dist <= t.rangeMeters;
      });
    };

    // Helper: Find shortest path through waypoints using Dijkstra's algorithm
    const findPath = (startLat: number, startLng: number, targetWaypoint: WaypointDTO): WaypointDTO[] => {
      // Check if start position is within coverage
      if (!isWithinTowerCoverage(startLat, startLng)) {
        console.log('Start position is not within tower coverage');
        return [];
      }

      // Check if target is within coverage
      if (!isWithinTowerCoverage(targetWaypoint.latitude, targetWaypoint.longitude)) {
        console.log('Target waypoint is not within tower coverage');
        return [];
      }

      // Build graph including start point and all waypoints within coverage
      const allWaypoints = waypoints.filter(w => isWithinTowerCoverage(w.latitude, w.longitude));
      
      // Ensure target is in the list if it's within coverage
      if (!allWaypoints.find(w => w.id === targetWaypoint.id)) {
        allWaypoints.push(targetWaypoint);
      }
      
      const allPoints = [
        { id: -1, name: 'start', latitude: startLat, longitude: startLng },
        ...allWaypoints
      ];

      // Use Dijkstra's algorithm to find shortest path
      const distances = new Map<number, number>();
      const previous = new Map<number, number>();
      const unvisited = new Set<number>();

      allPoints.forEach(p => {
        distances.set(p.id, Infinity);
        unvisited.add(p.id);
      });
      distances.set(-1, 0); // Start point

      while (unvisited.size > 0) {
        // Find unvisited node with smallest distance
        let current = -1;
        let minDist = Infinity;
        unvisited.forEach(id => {
          const dist = distances.get(id)!;
          if (dist < minDist) {
            minDist = dist;
            current = id;
          }
        });

        if (minDist === Infinity) break; // No more reachable nodes
        if (current === targetWaypoint.id) break; // Found target

        unvisited.delete(current);

        const currentPoint = allPoints.find(p => p.id === current)!;

        // Check all neighbors - can hop to any waypoint within max hop distance
        // Use the largest tower range as max hop distance to allow reasonable hops
        const maxTowerRange = Math.max(...towers.map(t => t.rangeMeters));
        const MAX_HOP_DISTANCE = maxTowerRange * 2; // Allow hops up to 2x the largest tower range
        
        allPoints.forEach(neighbor => {
          if (!unvisited.has(neighbor.id)) return;
          if (neighbor.id === current) return; // Skip self

          const dist = haversineMeters(currentPoint.latitude, currentPoint.longitude, neighbor.latitude, neighbor.longitude);
          
          // Only allow hops within max distance to encourage multi-hop pathfinding
          if (dist > MAX_HOP_DISTANCE) return;
          
          const altDist = distances.get(current)! + dist;
          
          if (altDist < distances.get(neighbor.id)!) {
            distances.set(neighbor.id, altDist);
            previous.set(neighbor.id, current);
          }
        });
      }

      // Reconstruct path
      if (!previous.has(targetWaypoint.id)) {
        console.log('No path found to target waypoint');
        console.log('Available waypoints in coverage:', allWaypoints.map(w => w.name));
        console.log('Target:', targetWaypoint.name);
        console.log('Distances:', Array.from(distances.entries()));
        return []; // No path found
      }

      const path: WaypointDTO[] = [];
      let current = targetWaypoint.id;
      while (current !== -1) {
        const point = waypoints.find(w => w.id === current);
        if (point) path.unshift(point);
        current = previous.get(current) ?? -1;
      }

      console.log('Path found:', path.map(w => w.name).join(' → '));
      return path;
    };

    // Expose moveDroneToWaypoint to window for popup buttons
    (window as any).moveDroneToWaypoint = async (droneId: number) => {
      const selectEl = document.getElementById(`waypoint-select-${droneId}`) as HTMLSelectElement;
      if (!selectEl || !selectEl.value) {
        alert('Please select a waypoint first');
        return;
      }
      const waypointId = parseInt(selectEl.value, 10);
      const targetWaypoint = waypoints.find((w) => w.id === waypointId);
      const drone = drones.find((d) => d.id === droneId);
      if (!targetWaypoint || !drone) return;

      // Get the marker for this drone from our reference map
      const droneMarker = droneMarkersRef.current.get(droneId);
      if (!droneMarker) return;

      // Validate target waypoint is within range of at least one active tower
      if (!isWithinTowerCoverage(targetWaypoint.latitude, targetWaypoint.longitude)) {
        alert(`Target waypoint is out of range of all towers!`);
        return;
      }

      // Close the popup
      droneMarker.closePopup();

      // Find path through waypoints
      const currentPos = droneMarker.getLatLng();
      const path = findPath(currentPos.lat, currentPos.lng, targetWaypoint);

      if (path.length === 0) {
        alert('No safe path found to target waypoint!');
        return;
      }

      // Show path waypoints to user
      console.log('Path found through waypoints:', path.map(w => w.name).join(' → '));
      if (path.length > 1) {
        const pathNames = path.map(w => w.name).join(' → ');
        if (!confirm(`Drone will travel through: ${pathNames}\n\nProceed?`)) {
          return;
        }
      }

      // Animate movement through each waypoint in path
      let pathIndex = 0;
      const animateSegment = (fromLat: number, fromLng: number, toWaypoint: WaypointDTO) => {
        const startPos = L.latLng(fromLat, fromLng);
        const endPos = L.latLng(toWaypoint.latitude, toWaypoint.longitude);
        const duration = 2000; // 2 seconds per segment
        const steps = 60;
        const stepDuration = duration / steps;

        let currentStep = 0;
        const animate = () => {
          currentStep++;
          const progress = currentStep / steps;
          
          const lat = startPos.lat + (endPos.lat - startPos.lat) * progress;
          const lng = startPos.lng + (endPos.lng - startPos.lng) * progress;
          
          droneMarker.setLatLng([lat, lng]);

          if (currentStep < steps) {
            setTimeout(animate, stepDuration);
          } else {
            // Move to next waypoint in path or finish
            pathIndex++;
            if (pathIndex < path.length) {
              animateSegment(endPos.lat, endPos.lng, path[pathIndex]);
            } else {
              // Final position reached - update database
              updateDrone(droneId, {
                name: drone.name,
                latitude: toWaypoint.latitude,
                longitude: toWaypoint.longitude,
                towerId: drone.towerId,
                status: drone.status ?? "",
              }).catch(() => {
                alert('Failed to update drone position in database.');
                droneMarker.setLatLng(currentPos);
              });
            }
          }
        };
        animate();
      };

      // Start animation from current position to first waypoint
      animateSegment(currentPos.lat, currentPos.lng, path[0]);
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
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {isCreatingWaypoint ? '✓ Click map to place waypoint' : '+ Create Waypoint'}
        </button>
      )}
      <div className="w-full flex-1 rounded-md overflow-hidden border" ref={containerRef} />
    </div>
  );
}
