import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { createStation } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import TowerLocationPicker from "@/components/map/tower-location-picker";
import { db } from "@/lib/db";
import { towers, stations } from "@/lib/schema";
import { desc } from "drizzle-orm";

export default async function NewStationPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as any)?.role === "admin";
  if (!isAdmin) redirect("/login");

  const existing = await db.select().from(towers).orderBy(desc(towers.createdAt));
  const towersDTO = existing.map((t) => ({
    id: t.id,
    name: t.name,
    latitude: t.latitude === null ? null : Number(t.latitude),
    longitude: t.longitude === null ? null : Number(t.longitude),
    rangeMeters: Number(t.rangeMeters),
    active: (t as any).active ?? true,
  }));

  // TowerLocationPicker expects towers with numeric latitude/longitude
  const towersForPicker = towersDTO
    .filter((t) => t.latitude !== null && t.longitude !== null)
    .map((t) => ({
      name: t.name,
      latitude: t.latitude as number,
      longitude: t.longitude as number,
      rangeMeters: t.rangeMeters,
      active: t.active,
    }));

  // Also pass existing stations so they appear on the picker map
  const stationsList = await db.select().from(stations).orderBy(desc(stations.createdAt));
  const stationsForPicker = stationsList
    .map((s: any) => ({ id: s.id, name: s.name, latitude: Number(s.latitude), longitude: Number(s.longitude) }))
    .filter((s: any) => !Number.isNaN(s.latitude) && !Number.isNaN(s.longitude));

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-9xl mx-auto">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2">Create Station</h1>
          <p className="text-gray-600">Create a new station</p>
        </div>

        <div className="flex gap-4">
          {/* Left: Form + Map */}
          <div className="flex-1">
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>New Station</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createStation} className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Name</label>
                    <Input name="name" placeholder="e.g., Station 1" required className="w-full" />
                  </div>

                  <label className="text-sm font-medium text-gray-700">Location</label>
                  <div className="grid grid-cols-2 mt-2 gap-2">
                    <TowerLocationPicker towers={towersForPicker} stations={stationsForPicker} newIconUrl="/icons/station-new.svg" />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button type="submit">Create</Button>
                    <Link href="/dashboard/stations"><Button type="button" variant="outline">Cancel</Button></Link>
                  </div>
                </form>

                {/* Map view removed from Create Station page */}
              </CardContent>
            </Card>
          </div>

          {/* Right column removed - station list intentionally hidden on create page */}
        </div>
      </div>
    </div>
  );
}
