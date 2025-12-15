import { db } from "@/lib/db";
import { drones, towers } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { createDrone, deleteDrone, updateDrone } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select-native";

/**
 * Drones Management Page
 * - Lists drones
 * - Form to create a new drone (validated to be within selected tower range)
 * - Delete existing drones
 */
export default async function DronesPage() {
  const items = await db.select().from(drones).orderBy(desc(drones.createdAt));
  const towersList = await db.select().from(towers).orderBy(desc(towers.createdAt));

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Drones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create Drone */}
          <form action={createDrone} className="grid grid-cols-5 gap-2">
            <Input name="name" placeholder="Name" required className="col-span-2" />
            <Input name="latitude" type="number" step="0.00000001" placeholder="Latitude" required />
            <Input name="longitude" type="number" step="0.00000001" placeholder="Longitude" required />
            <NativeSelect name="towerId" required defaultValue="">
              <option value="" disabled>Select Tower</option>
              {towersList.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.rangeMeters}m)</option>
              ))}
            </NativeSelect>
            <Input name="status" placeholder="Status (e.g. active)" />
            <div className="col-span-5">
              <Button type="submit">Add Drone</Button>
            </div>
          </form>

          {/* List */}
          <div className="space-y-2">
            {items.map((d) => (
              <div key={d.id} className="p-2 border rounded bg-white">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-semibold">{d.name} ({d.status})</div>
                    <div className="text-gray-600">Lat: {String(d.latitude)} | Lon: {String(d.longitude)} | Tower: {d.towerId}</div>
                  </div>
                  <form action={async () => { "use server"; await deleteDrone(d.id); }}>
                    <Button variant="destructive" size="sm">Delete</Button>
                  </form>
                </div>
                {/* Inline Edit Form */}
                <form action={async (formData) => {
                  "use server";
                  const name = String(formData.get("name") ?? d.name);
                  const latitude = parseFloat(String(formData.get("latitude") ?? d.latitude));
                  const longitude = parseFloat(String(formData.get("longitude") ?? d.longitude));
                  const towerId = parseInt(String(formData.get("towerId") ?? d.towerId), 10);
                  const status = String(formData.get("status") ?? d.status);
                  await updateDrone(d.id, { name, latitude, longitude, towerId, status });
                }} className="mt-2 grid grid-cols-5 gap-2">
                  <Input name="name" defaultValue={d.name} className="col-span-2" />
                  <Input name="latitude" type="number" step="0.00000001" defaultValue={Number(d.latitude)} />
                  <Input name="longitude" type="number" step="0.00000001" defaultValue={Number(d.longitude)} />
                  <NativeSelect name="towerId" defaultValue={d.towerId}>
                    {towersList.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.rangeMeters}m)</option>
                    ))}
                  </NativeSelect>
                  <Input name="status" defaultValue={d.status} />
                  <div className="col-span-5">
                    <Button type="submit" variant="secondary" size="sm">Save Changes</Button>
                  </div>
                </form>
              </div>
            ))}
            {items.length === 0 && <p className="text-gray-500 text-sm">No drones yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
