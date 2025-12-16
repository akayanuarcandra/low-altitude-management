import { haversineMeters } from "./map-helpers";
import { DroneDTO, WaypointDTO } from "./types";
import { updateDrone } from "@/app/actions";

const SPEED_MS_PER_METER = 0.5; // 0.5ms per meter (2000m/s or 2km/s)
const STEP_DURATION = 16; // 16ms per step (~60fps)

export function animateDroneMovement(
    L: any,
    droneId: number,
    drone: DroneDTO,
    droneMarker: any,
    path: WaypointDTO[],
    targetWaypoint: WaypointDTO,
    currentPos: any,
    droneAnimationStateRef: React.MutableRefObject<Map<number, { timeoutId: any }>>,
    setAlert: (alert: { type: "success" | "error"; message: string } | null) => void
) {
    droneMarker.closePopup();

    // Initialize animation state for this drone if it doesn't exist
    if (!droneAnimationStateRef.current.has(droneId)) {
        droneAnimationStateRef.current.set(droneId, { timeoutId: null });
    }

    // Animate movement through each waypoint in path
    let pathIndex = 0;
    
    const animateSegment = (fromLat: number, fromLng: number, toWaypoint: WaypointDTO) => {
        const startPos = L.latLng(fromLat, fromLng);
        const endPos = L.latLng(toWaypoint.latitude, toWaypoint.longitude);

        // Calculate distance and duration based on constant speed
        const distance = haversineMeters(fromLat, fromLng, toWaypoint.latitude, toWaypoint.longitude);
        const duration = distance * SPEED_MS_PER_METER;
        const steps = Math.max(Math.floor(duration / STEP_DURATION), 1); // Ensure at least 1 step

        let currentStep = 0;
        const animate = () => {
            currentStep++;
            const progress = currentStep / steps;

            const lat = startPos.lat + (endPos.lat - startPos.lat) * progress;
            const lng = startPos.lng + (endPos.lng - startPos.lng) * progress;

            droneMarker.setLatLng([lat, lng]);

            if (currentStep < steps) {
                const timeoutId = setTimeout(animate, STEP_DURATION);
                // Store timeout ID for this drone so it can be cancelled if needed
                const state = droneAnimationStateRef.current.get(droneId);
                if (state) state.timeoutId = timeoutId;
            } else {
                // Move to next waypoint in path or finish
                pathIndex++;
                if (pathIndex < path.length) {
                    animateSegment(endPos.lat, endPos.lng, path[pathIndex]);
                } else {
                    // Final position reached - update database
                    updateDrone(droneId, {
                        latitude: toWaypoint.latitude,
                        longitude: toWaypoint.longitude,
                        status: "deployed",
                    });
                    setAlert({
                        type: "success",
                        message: `${drone.name} reached waypoint "${targetWaypoint.name}"!`,
                    });
                    setTimeout(() => setAlert(null), 3000);
                    // Clean up animation state
                    droneAnimationStateRef.current.delete(droneId);
                }
            }
        };
        animate();
    };

    // Start animation from current position to first waypoint
    animateSegment(currentPos.lat, currentPos.lng, path[0]);
}
