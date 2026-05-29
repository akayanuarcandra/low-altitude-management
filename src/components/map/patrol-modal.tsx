"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import computePatrolRouteClient from "@/lib/patrol-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { animateDroneMovement } from "./drone-animations";

export default function PatrolModal({
  droneId,
  drone,
  waypoints,
  mapRef,
  L,
  deployedDronesRef,
  droneAnimationStateRef,
  onClose,
  setAlert,
}: any) {
  const [radius, setRadius] = useState<number>(80);
  const [duration, setDuration] = useState<number>(300);
  const [speed, setSpeed] = useState<number>(10);
  const [edgeThreshold, setEdgeThreshold] = useState<number>(300);
  const [running, setRunning] = useState(false);
  const [previewRoute, setPreviewRoute] = useState<Array<any> | null>(null);
  const previewLayerRef = useRef<any>(null);
  const anchorsLayerRef = useRef<any>(null);
  const cancelledRef = useRef(false);

  const getCenter = () => {
    const entry = deployedDronesRef.current.get(droneId);
    if (entry && entry.marker) {
      const ll = entry.marker.getLatLng();
      return { lat: ll.lat, lon: ll.lng };
    }
    if (drone && drone.latitude && drone.longitude) return { lat: drone.latitude, lon: drone.longitude };
    return null;
  };

  const clearPreview = () => {
    try {
      const map = mapRef.current;
      if (!map || !L) return;
      if (previewLayerRef.current) { map.removeLayer(previewLayerRef.current); previewLayerRef.current = null; }
      if (anchorsLayerRef.current) { map.removeLayer(anchorsLayerRef.current); anchorsLayerRef.current = null; }
    } catch (e) {
      // ignore
    }
    setPreviewRoute(null);
  };

  useEffect(() => {
    return () => clearPreview();
  }, []);

  const doPreview = async (allowAerialFallback = false) => {
    const center = getCenter();
    if (!center) return setAlert?.({ type: "error", message: "Drone has no valid position" });
    const res = await computePatrolRouteClient(center, Number(radius), { anchors:6, edgeThresholdMeters: Number(edgeThreshold), maxNodes:500, droneSpeed: Number(speed), waypoints, aerialFallback: allowAerialFallback });
    if (!res.ok) {
      setAlert?.({ type: "error", message: `Patrol planning failed: ${res.error || 'unknown'}` });
      return null;
    }
      setPreviewRoute((res.route ?? []) as any[]);

    // render on map
    try {
      // preview drawing removed: do not render route polyline or anchor markers in the modal
      // keep previewRoute state so animation can still use the computed coords
    } catch (e) { console.debug('patrol preview render failed', e); }
    return res;
  };

  const startPatrol = async () => {
    const center = getCenter();
    if (!center) return setAlert?.({ type: "error", message: "Drone has no valid position" });
    setRunning(true);
    cancelledRef.current = false;
    let res = null as any;
    if (!previewRoute) {
      res = await doPreview(true);
      if (!res) { setRunning(false); return; }
    } else {
      res = { route: previewRoute, loopDuration: undefined };
    }

    const entry = deployedDronesRef.current.get(droneId);
    if (!entry || !entry.marker) { setAlert?.({ type: 'error', message: 'Drone marker not found' }); setRunning(false); return; }
    const marker = entry.marker;
    const droneObj = drone;

    const endAt = Date.now() + Number(duration) * 1000;

    // Loop runs until duration expires or cancelled
    while(Date.now() < endAt && !cancelledRef.current) {
      const routeCoords = previewRoute ?? (res.route as any[]);
      const pathWaypoints = routeCoords.map((p:any, i:number) => ({ id:i, name:`patrol-${i}`, latitude: p.lat, longitude: p.lon }));
      const lastWp = pathWaypoints[pathWaypoints.length-1];
      try {
        // animate one loop
        await animateDroneMovement(
          L,
          droneId,
          droneObj,
          marker,
          pathWaypoints,
          lastWp,
          { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng },
          droneAnimationStateRef,
          setAlert,
        );
      } catch (e) {
        console.error('patrol animation loop error', e);
        break;
      }
      // check remaining time
      if (Date.now() >= endAt) break;
      if (cancelledRef.current) break;
    }

    setRunning(false);
    clearPreview();
    onClose && onClose();
  };

  const cancelPatrol = async () => {
    cancelledRef.current = true;
    try {
      const ctrl = droneAnimationStateRef.current.get(droneId);
      if (ctrl && ctrl.animating) {
        try { (ctrl as any).suppressCancelAlert = true; } catch {};
        ctrl.cancel();
      }
    } catch (e) {}
    setRunning(false);
    clearPreview();
    onClose && onClose();
  };

  // Render modal into document.body via portal so it doesn't block map container
  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          try { cancelPatrol(); } catch {};
          try { clearPreview(); } catch {};
          onClose && onClose();
        }}
      />

      <div
        className="bg-white p-6 rounded shadow-lg w-full max-w-md z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Start Patrol for {drone?.name ?? 'Drone'}</h3>
        <div className="mt-4 space-y-2">
          <label className="block text-sm text-gray-600">Radius (meters)</label>
          <Input type="number" value={radius} onChange={(e:any)=>setRadius(Number(e.target.value))} />
          <label className="block text-sm text-gray-600">Duration (seconds)</label>
          <Input type="number" value={duration} onChange={(e:any)=>setDuration(Number(e.target.value))} />
          <label className="block text-sm text-gray-600">Speed (m/s)</label>
          <Input type="number" value={speed} onChange={(e:any)=>setSpeed(Number(e.target.value))} />
          <label className="block text-sm text-gray-600">Edge Threshold (meters)</label>
          <Input type="number" value={edgeThreshold} onChange={(e:any)=>setEdgeThreshold(Number(e.target.value))} />
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={()=>doPreview(true)} disabled={running}>Preview</Button>
          <Button onClick={startPatrol} disabled={running} className="bg-green-600">Start Patrol</Button>
          <Button variant="secondary" onClick={cancelPatrol} disabled={!running}>Cancel</Button>
          <Button variant="ghost" onClick={() => { clearPreview(); onClose && onClose(); }} className="ml-auto">Close</Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
