import { db } from "@/lib/db";
import { drones, towers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { updateDrone } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select-native";
import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * Edit Drone Page
 * - Form to edit an existing drone
 * - Validates that drone is within selected tower range
 */
export default async function EditDronePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  const droneId = parseInt(id, 10);
  
  // Fetch the drone to edit
  const [drone] = await db.select().from(drones).where(eq(drones.id, droneId));
  
  if (!drone) {
    redirect("/dashboard/drones");
  }
  
  // Fetch all towers for the dropdown
  const towersList = await db.select().from(towers);

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Edit Drone: {drone.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              "use server";
              const name = String(formData.get("name"));
              const latitude = parseFloat(String(formData.get("latitude")));
              const longitude = parseFloat(String(formData.get("longitude")));
              const towerId = parseInt(String(formData.get("towerId")), 10);
              const status = String(formData.get("status"));
              
              await updateDrone(droneId, { name, latitude, longitude, towerId, status });
              redirect("/dashboard/drones");
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={drone.name}
                required
              />
            </div>

            <div>
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                name="latitude"
                type="number"
                step="0.00000001"
                defaultValue={Number(drone.latitude)}
                required
              />
            </div>

            <div>
              <Label htmlFor="longitude">Longitude</Label>
              <Input
                id="longitude"
                name="longitude"
                type="number"
                step="0.00000001"
                defaultValue={Number(drone.longitude)}
                required
              />
            </div>

            <div>
              <Label htmlFor="towerId">Tower</Label>
              <NativeSelect
                id="towerId"
                name="towerId"
                defaultValue={drone.towerId}
                required
              >
                {towersList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.rangeMeters}m range)
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                name="status"
                defaultValue={drone.status}
                required
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit">Save Changes</Button>
              <Link href="/dashboard/drones">
                <Button type="button" variant="secondary">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
