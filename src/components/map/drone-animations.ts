/**
 * src/components/map/drone-animations.ts
 *
 * Cancellable, requestAnimationFrame-driven drone animation helper.
 *
 * Purpose:
 *  - Animate a Leaflet marker smoothly along a sequence of waypoints.
 *  - Store an animation controller in a shared ref so other code (map sync)
 *    can detect that a drone is currently animating and avoid overwriting its position.
 *  - Provide a cancel() on the controller to abort in-flight animations.
 *  - Persist final position to the server once the animation completes.
 *
 * Integration notes:
 *  - The caller must maintain a stable `droneAnimationStateRef` (e.g. `useRef(new Map())`)
 *    and pass it here. This file will set and delete entries keyed by `droneId`.
 *  - The marker instance passed in should be reused across map updates (do not recreate markers
 *    while an animation is running) so the RAF loop can update it in-place.
 *
 * Do not change other files in the project to use this file; call `animateDroneMovement(...)`
 * from your interactive map code (see interactive-map-view example).
 */

import type { MutableRefObject } from "react";
import { haversineMeters } from "./map-helpers";
import type { DroneDTO, WaypointDTO } from "./types";
import { updateDrone } from "@/app/actions";
let activeAnimationsCount = 0;

/**
 * Controller stored per-drone in the shared ref.
 * - animating: true while animation is active
 * - cancel(): call to abort the animation
 */
export type DroneAnimationController = {
  animating: boolean;
  cancel: () => void;
  // When true, animateDroneMovement should suppress showing the user-facing
  // cancellation alert. Callers that programmatically cancel an animation and
  // will show their own single confirmation/result should set this flag to true
  // on the controller stored in `droneAnimationStateRef` before calling `cancel()`.
  suppressCancelAlert?: boolean;
};

const SPEED_MS_PER_METER = 50; // ms per meter; tweak to change speed
const MIN_DURATION_MS = 100; // ensure short distances still animate noticeably
const MAX_DURATION_MS = 30000; // cap for very long movements

// Smooth easing for natural motion
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Animate a marker from (fromLat, fromLng) to (toLat, toLng) over durationMs using RAF.
 * Resolves when finished or if `shouldCancel()` returns true.
 */
function animateLatLngRAF(
  marker: any,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  durationMs: number,
  shouldCancel: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();

    let rafId = 0;
    const step = (now: number) => {
      if (shouldCancel()) {
        // stop and resolve early
        resolve();
        return;
      }

      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeInOut(t);

      const lat = fromLat + (toLat - fromLat) * eased;
      const lng = fromLng + (toLng - fromLng) * eased;

      try {
        // Update marker in-place. If marker has been removed, catch and resolve.
        marker.setLatLng([lat, lng]);
      } catch (e) {
        resolve();
        return;
      }

      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        resolve();
      }
    };

    rafId = requestAnimationFrame(step);

    // In case the caller wants to cancel by other means, we don't expose rafId here,
    // but the shouldCancel closure is used to stop the animation.
  });
}

/**
 * Animate a drone along a path of waypoints.
 *
 * Parameters:
 *  - L: Leaflet global (not used directly here except for consistency; marker ops are used)
 *  - droneId: numeric id of drone
 *  - drone: DroneDTO metadata
 *  - droneMarker: Leaflet marker instance for this drone (must be stable / reused)
 *  - path: ordered WaypointDTO array that represents movement steps (at least one element)
 *  - targetWaypoint: the final waypoint (used for server persistence and user message)
 *  - currentPos: { lat, lng } starting coordinates for the animation
 *  - droneAnimationStateRef: React ref to Map<number, DroneAnimationController>
 *  - setAlert: optional UI callback to show user messages
 *
 * Behavior:
 *  - Sets a controller in droneAnimationStateRef keyed by droneId and marks animating = true.
 *  - Runs segments sequentially using RAF interpolation.
 *  - If cancelled, stops and cleans up controller.
 *  - If finished normally, calls updateDrone(...) once to persist final position and status.
 *  - Always deletes the controller entry on completion or cancellation.
 */
export async function animateDroneMovement(
  L: any,
  droneId: number,
  drone: DroneDTO,
  droneMarker: any,
  path: WaypointDTO[],
  targetWaypoint: WaypointDTO,
  currentPos: { lat: number; lng: number },
  droneAnimationStateRef: MutableRefObject<
    Map<number, DroneAnimationController>
  >,
  setAlert?: (
    alert: { type: "success" | "error"; message: string } | null,
  ) => void,
): Promise<void> {
  // Defensive checks
  if (!droneMarker || !path || path.length === 0) {
    return;
  }

  // If another animation is already running for this drone, cancel it first
  const existing = droneAnimationStateRef.current.get(droneId);
  if (existing && existing.animating) {
    try {
      existing.cancel();
    } catch (e) {
      // ignore
    }
    droneAnimationStateRef.current.delete(droneId);
  }

  let cancelled = false;
  const controller: DroneAnimationController = {
    animating: true,
    // default: do not suppress (callers may set this to true before invoking cancel)
    suppressCancelAlert: false,
    cancel: () => {
      cancelled = true;
    },
  };
  // register controller
  droneAnimationStateRef.current.set(droneId, controller);

  // Notify interested UI/controls that this drone animation has started.
  // Use a CustomEvent so other client code (MapControls) can listen and update immediately.
  try {
    if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("drone-animation-start", { detail: { droneId } }),
      );
    }
  } catch {
    // best-effort: ignore any errors dispatching the event
  }

  try {
    // Start from the current position
    let fromLat = currentPos.lat;
    let fromLng = currentPos.lng;

    // Compute each segment distance first so we can allocate a proportional duration
    // to each segment. This avoids long total times when the path has many small steps.
    const segmentDistances: number[] = [];
    let tempLat = fromLat;
    let tempLng = fromLng;
    let totalDistance = 0;

    for (let i = 0; i < path.length; i++) {
      const wp = path[i];
      const toLat = Number(wp.latitude);
      const toLng = Number(wp.longitude);
      if (Number.isNaN(toLat) || Number.isNaN(toLng)) {
        segmentDistances.push(0);
        continue;
      }
      const d = haversineMeters(tempLat, tempLng, toLat, toLng);
      segmentDistances.push(d);
      totalDistance += d;
      tempLat = toLat;
      tempLng = toLng;
    }

    // totalDuration is proportional to totalDistance but clamped so animation isn't too fast/slow
    const MIN_TOTAL_MS = 300;
    const MAX_TOTAL_MS = 20000;
    const totalDuration = Math.max(
      MIN_TOTAL_MS,
      Math.min(MAX_TOTAL_MS, totalDistance * SPEED_MS_PER_METER),
    );

    // If totalDistance is zero (degenerate), fall back to per-segment durations
    if (totalDistance <= 0) {
      for (let i = 0; i < path.length; i++) {
        if (cancelled) break;
        const wp = path[i];
        const toLat = Number(wp.latitude);
        const toLng = Number(wp.longitude);
        if (Number.isNaN(toLat) || Number.isNaN(toLng)) continue;

        const distance = haversineMeters(fromLat, fromLng, toLat, toLng);
        let duration = Math.max(MIN_DURATION_MS, distance * SPEED_MS_PER_METER);
        duration = Math.min(duration, MAX_DURATION_MS);

        await animateLatLngRAF(
          droneMarker,
          fromLat,
          fromLng,
          toLat,
          toLng,
          duration,
          () => cancelled,
        );

        fromLat = toLat;
        fromLng = toLng;
      }
    } else {
      for (let i = 0; i < path.length; i++) {
        if (cancelled) break;
        const wp = path[i];
        const toLat = Number(wp.latitude);
        const toLng = Number(wp.longitude);
        if (Number.isNaN(toLat) || Number.isNaN(toLng)) continue;

        const segDist = segmentDistances[i] || 0;
        // allocate proportional duration, with a minimum per-segment floor for smoothness
        let segDuration = Math.max(
          MIN_DURATION_MS,
          (segDist / totalDistance) * totalDuration,
        );
        segDuration = Math.min(segDuration, MAX_DURATION_MS);

        await animateLatLngRAF(
          droneMarker,
          fromLat,
          fromLng,
          toLat,
          toLng,
          segDuration,
          () => cancelled,
        );

        fromLat = toLat;
        fromLng = toLng;
      }
    }

    if (!cancelled) {
      // Completed normally - persist final position once
      try {
        await updateDrone(droneId, {
          latitude: targetWaypoint.latitude,
          longitude: targetWaypoint.longitude,
          status: "deployed",
        });
        if (setAlert) {
          setAlert({
            type: "success",
            message: `${drone.name} reached waypoint "${targetWaypoint.name}"`,
          });
          // auto-clear
          setTimeout(() => setAlert?.(null), 3000);
        }
      } catch (err) {
        if (setAlert) {
          setAlert({
            type: "error",
            message: `Failed to persist ${drone.name} position`,
          });
          setTimeout(() => setAlert?.(null), 4000);
        }
      }
    } else {
      // cancelled - nothing to persist (caller may decide to persist or not)
      // Respect an optional suppressCancelAlert flag on the registered controller:
      // if present and true, do not show the default cancellation alert (caller
      // will surface a single message itself).
      try {
        const registered =
          droneAnimationStateRef.current.get(droneId) || controller;
        const suppressed = !!(
          registered && (registered as any).suppressCancelAlert
        );
        if (!suppressed && setAlert) {
          setAlert({
            type: "error",
            message: `${drone.name} animation cancelled`,
          });
          setTimeout(() => setAlert?.(null), 2000);
        }
      } catch (e) {
        // best-effort: ignore any issues while attempting to read suppression flag
      }
    }
  } finally {
    // Instead of deleting the controller immediately, mark it as not animating and
    // remove it after a short grace period. This provides a small window where any
    // map syncs triggered by refresh can reconcile state without stomping the marker
    // while still cleaning up the controller shortly afterwards.
    try {
      const ctrl = droneAnimationStateRef.current.get(droneId);
      if (ctrl) {
        try {
          ctrl.animating = false;
        } catch (e) {
          // ignore
        }
        // Emit a 'drone-animation-end' event with details so UI can react immediately.
        try {
          if (
            typeof window !== "undefined" &&
            typeof CustomEvent !== "undefined"
          ) {
            window.dispatchEvent(
              new CustomEvent("drone-animation-end", {
                detail: { droneId, cancelled },
              }),
            );
          }
        } catch {
          // ignore event dispatch errors
        }
        setTimeout(() => {
          try {
            droneAnimationStateRef.current.delete(droneId);
          } catch (e) {
            // ignore
          }
        }, 500);
      }
    } catch (e) {
      // best-effort cleanup; ignore errors
      try {
        droneAnimationStateRef.current.delete(droneId);
      } catch (_) {
        // ignore
      }
    }
  }
}
