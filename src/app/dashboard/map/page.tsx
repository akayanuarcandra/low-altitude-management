import { db } from "@/lib/db";
import { drones, towers, waypoints } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InteractiveMapView } from "@/components/map/interactive-map-view";

export default async function MapPage() {
  const towersList = await db.select().from(towers).orderBy(desc(towers.createdAt));
  const dronesList = await db.select().from(drones).orderBy(desc(drones.createdAt));
  const waypointsList = await db.select().from(waypoints).orderBy(desc(waypoints.createdAt));

  // Cast decimals/strings to numbers for serialization
  const towersDTO = towersList.map((t) => ({
    id: t.id,
    name: t.name,
    latitude: Number(t.latitude),
    longitude: Number(t.longitude),
    rangeMeters: Number(t.rangeMeters),
    active: (t as any).active ?? true,
  }));

  // Separate deployed and inventory drones
  const deployedDrones = dronesList
    .filter((d) => d.latitude && d.longitude)
    .map((d) => ({
      id: d.id,
      name: d.name,
      latitude: Number(d.latitude),
      longitude: Number(d.longitude),
      towerId: d.towerId || undefined,
      status: d.status || "deployed",
    }));

  const inventoryDrones = dronesList
    .filter((d) => !d.latitude || !d.longitude)
    .map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status || "inventory",
    }));

  const waypointsDTO = waypointsList.map((w) => ({
    id: w.id,
    name: w.name,
    latitude: Number(w.latitude),
    longitude: Number(w.longitude),
  }));

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-9xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Operations Map</h1>
          <p className="text-gray-600">Deploy drones from inventory to the map. Ensure they are placed within tower coverage areas.</p>
        </div>

        <InteractiveMapView
          towers={towersDTO}
          drones={deployedDrones}
          waypoints={waypointsDTO}
          inventoryDrones={inventoryDrones}
        />
      </div>
    </div>
  );
}
