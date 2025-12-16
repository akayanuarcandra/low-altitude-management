"use client";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DroneDTO } from "./types";
import { updateDrone } from "@/app/actions";

interface MapControlsProps {
    inventoryDrones: DroneDTO[];
    deployedDrones: DroneDTO[];
    selectedInventoryDrone: number | null;
    setSelectedInventoryDrone: (id: number | null) => void;
    isPlacingDrone: boolean;
    setIsPlacingDrone: (placing: boolean) => void;
    isAddingWaypoint: boolean;
    setIsAddingWaypoint: (adding: boolean) => void;
    setAlert: (alert: { type: "success" | "error"; message: string } | null) => void;
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
    setAlert,
}: MapControlsProps) {
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
                                setAlert({ type: "error", message: "Cancel drone placement first" });
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
                            onChange={(e) => setSelectedInventoryDrone(e.target.value ? parseInt(e.target.value) : null)}
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
                                setAlert({ type: "error", message: "Please select a drone first" });
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
                            Click on the map within a tower's blue coverage area to deploy the drone.
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
                                <div key={drone.id} className="flex items-center justify-between p-3 border rounded bg-blue-50">
                                    <div className="text-sm">
                                        <div className="font-semibold">{drone.name}</div>
                                        <div className="text-gray-600 text-xs">
                                            {drone.latitude && drone.longitude
                                                ? `Lat: ${drone.latitude.toFixed(6)}, Lon: ${drone.longitude.toFixed(6)}`
                                                : "Location not set"}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
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
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
