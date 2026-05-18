"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DroneDTO, StationDTO } from "./types";
import { updateDrone } from "@/app/actions";
import TaskListModal from "@/components/tasks/task-list-modal";

interface MapControlsProps {
  inventoryDrones: DroneDTO[];
  deployedDrones: DroneDTO[];
  selectedInventoryDrone: number | null;
  setSelectedInventoryDrone: (id: number | null) => void;
  isPlacingDrone: boolean;
  setIsPlacingDrone: (placing: boolean) => void;
  isAddingWaypoint: boolean;
  setIsAddingWaypoint: (adding: boolean) => void;
  isAddingStation: boolean;
  setIsAddingStation: (adding: boolean) => void;
  setAlert: (
    alert: { type: "success" | "error"; message: string } | null,
  ) => void;
  // Optional callback to notify parent when tasks are started for a drone
  onRunStarted?: (started: Array<any>) => void;
  stations: StationDTO[];
}

export function MapControls({
  inventoryDrones,
  deployedDrones,
  selectedInventoryDrone,
  setSelectedInventoryDrone,
  isPlacingDrone,
  setIsPlacingDrone,
  isAddingWaypoint,
  setIsAddingWaypoint,
  isAddingStation,
  setIsAddingStation,
  setAlert,
  onRunStarted,
  stations,
}: MapControlsProps) {
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [tasksModalDroneId, setTasksModalDroneId] = useState<number | null>(
    null,
  );
  const [tasksModalDroneName, setTasksModalDroneName] = useState<
    string | undefined
  >(undefined);
  // Trigger a periodic re-render so UI (buttons/labels) reflect
  // changes in animation state exposed on window (e.g. window.isDroneAnimating).
  // We intentionally only keep a setter because we don't need the value itself.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => (t + 1) % 1000000);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-80 space-y-4">
      {/* Add Waypoint Control */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add Waypoint</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              if (isPlacingDrone) {
                setAlert({
                  type: "error",
                  message: "Cancel drone placement first",
                });
                setTimeout(() => setAlert(null), 3000);
                return;
              }
              setIsAddingWaypoint(!isAddingWaypoint);
            }}
            variant={isAddingWaypoint ? "destructive" : "secondary"}
            className="w-full"
          >
            {isAddingWaypoint ? "Cancel" : "Add Waypoint on Map"}
          </Button>

          {isAddingWaypoint && (
            <p className="text-sm text-green-700 bg-green-50 p-2 rounded mt-3">
              Click anywhere on the map to create a new waypoint.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Drone Placement Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Deploy Drone from Inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <NativeSelect
              value={selectedInventoryDrone || ""}
              onChange={(e) =>
                setSelectedInventoryDrone(
                  e.target.value ? parseInt(e.target.value) : null,
                )
              }
              disabled={isPlacingDrone}
            >
              <option value="">Select drone from inventory...</option>
              {inventoryDrones.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <Button
            onClick={() => {
              if (!selectedInventoryDrone) {
                setAlert({
                  type: "error",
                  message: "Please select a drone first",
                });
                setTimeout(() => setAlert(null), 3000);
                return;
              }
              // Only allow placement when there are stations available
              if (!stations || stations.length === 0) {
                setAlert({
                  type: "error",
                  message: "No stations available, please add station first",
                });
                setTimeout(() => setAlert(null), 3000);
                return;
              }
              setIsPlacingDrone(!isPlacingDrone);
            }}
            variant={isPlacingDrone ? "destructive" : "secondary"}
            className="w-full"
          >
            {isPlacingDrone ? "Cancel Placement" : "Place Selected Drone"}
          </Button>

          {isPlacingDrone && (
            <p className="text-sm text-blue-700 bg-blue-50 p-2 rounded">
              Click on a station on the map to deploy the drone.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Deployed Drones */}
      {deployedDrones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Deployed Drones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deployedDrones.map((drone) => (
                <div
                  key={drone.id}
                  className="flex items-center justify-between p-3 border rounded bg-blue-50"
                >
                  <div className="text-sm">
                    <div className="font-semibold">{drone.name}</div>
                    <div className="text-gray-600 text-xs">
                      {drone.latitude && drone.longitude
                        ? `Lat: ${drone.latitude.toFixed(6)}, Lon: ${drone.longitude.toFixed(6)}`
                        : "Location not set"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-40">
                    <Button
                      size="sm"
                      variant={
                        typeof window !== "undefined" &&
                        (window as any)?.isDroneAnimating?.(drone.id)
                          ? ("destructive" as any)
                          : ("outline" as any)
                      }
                      onClick={async () => {
                        try {
                          const isAnimating = (
                            window as any
                          )?.isDroneAnimating?.(drone.id);
                          const statusStr = (drone.status || "")
                            .toString()
                            .toLowerCase();
                           let stateLabel = "Deployed";
                           if (isAnimating) {
                             stateLabel = "Flying";
                           } else if (
                             statusStr.includes("idle") ||
                             statusStr.includes("inventory") ||
                             !drone.latitude ||
                             !drone.longitude
                           ) {
                             stateLabel = "Idling";
                           } else {
                             stateLabel = "Deployed";
                           }

                          // If actively flying or patrolling, offer stop action
                           if (stateLabel === "Flying") {
                            // Call centralized stop handler and skip its internal confirmation
                            // to avoid double/triple prompts. The central handler will
                            // handle cancelling patrols/animations and persisting position.
                            if ((window as any).stopDroneOperation) {
                              try {
                                await (window as any).stopDroneOperation(
                                  drone.id,
                                  true,
                                );
                                setAlert({
                                  type: "success",
                                  message: `${drone.name} stop requested`,
                                });
                                setTimeout(() => setAlert(null), 2000);
                              } catch {
                                setAlert({
                                  type: "error",
                                  message: `Failed to stop ${drone.name}`,
                                });
                                setTimeout(() => setAlert(null), 3000);
                              }
                            } else {
                              setAlert({
                                type: "error",
                                message: "Stop operation not available",
                              });
                              setTimeout(() => setAlert(null), 3000);
                            }
                          } else {
                            window.alert(
                              `${drone.name} is currently ${stateLabel}`,
                            );
                          }
                        } catch (e) {
                          window.alert(
                            `Drone status: ${drone.status ?? "idle"}`,
                          );
                        }
                      }}
                    >
                    {(() => {
                        const isAnimatingLocal =
                          typeof window !== "undefined"
                            ? (window as any)?.isDroneAnimating?.(drone.id)
                            : false;
                        const s = (drone.status || "").toString().toLowerCase();
                        if (isAnimatingLocal) return "Flying";
                        if (
                          s.includes("idle") ||
                          s.includes("inventory") ||
                          !drone.latitude ||
                          !drone.longitude
                        )
                          return "Idling";
                        return "Deployed";
                      })()}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Prefer using the centralized handler if available to ensure animations are canceled correctly
                        if ((window as any)?.returnDroneToInventory) {
                          (window as any).returnDroneToInventory(drone.id);
                          return;
                        }
                        // Fallback: directly update
                        updateDrone(drone.id, {
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
                      }}
                    >
                      Return to Inventory
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTasksModalDroneId(drone.id);
                        setTasksModalDroneName(drone.name);
                        setShowTasksModal(true);
                      }}
                    >
                      View Tasks
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showTasksModal && tasksModalDroneId && (
        <TaskListModal
          droneId={tasksModalDroneId}
          droneName={tasksModalDroneName}
          onClose={() => {
            setShowTasksModal(false);
            setTasksModalDroneId(null);
            setTasksModalDroneName(undefined);
          }}
          onRunStarted={(started) => {
            setShowTasksModal(false);
            setTimeout(() => {
              setTasksModalDroneId(null);
              setTasksModalDroneName(undefined);
            }, 200);

            // bubble up so parent (e.g. InteractiveMapView) can animate drones
            try {
              if (onRunStarted) onRunStarted(started);
            } catch (e) {
              // ignore
            }

            // you can surface a small alert if desired
            if (started && started.length > 0) {
              setAlert({ type: "success", message: "Task run started" });
              setTimeout(() => setAlert(null), 2500);
            }
          }}
        />
      )}
    </div>
  );
}
