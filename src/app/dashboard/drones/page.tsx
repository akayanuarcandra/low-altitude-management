import { db } from "@/lib/db";
import { drones } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DeleteDroneButton } from "./delete-drone-button";

/**
 * Drones Management Page
 * - Shows all drones in inventory (not yet deployed)
 * - Drones can be deleted from inventory
 * - Drones are deployed on the Map page
 */
export default async function DronesPage() {
  const items = await db.select().from(drones).orderBy(desc(drones.createdAt));
  const inventoryDrones = items.filter(d => d.status === "inventory" || !d.latitude);

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Drone Inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Link href="/dashboard/drones/new">
              <Button>+ Add Drone to Inventory</Button>
            </Link>
          </div>

          {/* Inventory */}
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Available drones to deploy:</p>
            {inventoryDrones.length > 0 ? (
              inventoryDrones.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-4 border rounded bg-white">
                  <div className="text-sm">
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-gray-600 text-xs">In Inventory</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/drones/${d.id}/edit`}>
                      <Button variant="outline" size="sm">Edit</Button>
                    </Link>
                    <DeleteDroneButton droneId={d.id} droneName={d.name} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No drones in inventory. Create one to get started!</p>
            )}
          </div>

          {/* Deployed Drones Info */}
          {items.filter(d => d.latitude && d.longitude).length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Deployed drones (view/manage on Map):</p>
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700">
                {items.filter(d => d.latitude && d.longitude).length} drone(s) deployed. Go to the Map page to manage them.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
