import { db } from "@/lib/db";
import { towers } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MapView } from "@/components/map/map-view";
import { DeleteTowerButton } from "./delete-tower-button";

/**
 * Towers Management Page
 * - Map view showing towers with delete buttons
 * - List view with tower details
 * - Link to create a new tower
 */
export default async function TowersPage() {
  const items = await db.select().from(towers).orderBy(desc(towers.createdAt));

  const towersDTO = items.map((t) => ({
    id: t.id,
    name: t.name,
    latitude: Number(t.latitude),
    longitude: Number(t.longitude),
    rangeMeters: Number(t.rangeMeters),
    active: (t as any).active ?? true,
  }));

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="pt-8 px-8">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2">Towers</h1>
          <p className="text-gray-600">Tower management area</p>
        </div>
        <div className="max-w-9xl mx-auto flex gap-4">
          {/* Map View - Left Side */}
          <div className="flex-1">
            {items.length > 0 && (
              <Card>
                <CardContent className="">
                  <div className="h-170 rounded-md overflow-hidden border">
                    <MapView towers={towersDTO} drones={[]} waypoints={[]} showWaypointToggle={false} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* List View - Right Side */}
          <div className="w-96">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Tower List</CardTitle>
                <Link href="/dashboard/towers/new">
                  <Button size="sm">+ Add</Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  {items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-2 border rounded bg-white">
                      <div className="text-sm">
                        <div className="font-semibold">{t.name} {t.active ? "(active)" : "(inactive)"}</div>
                        <div className="text-gray-600">Lat: {String(t.latitude)} <br /> Lon: {String(t.longitude)} <br /> Range: {t.rangeMeters} m</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/towers/${t.id}/edit`}>
                          <Button variant="outline" size="sm">Edit</Button>
                        </Link>
                        <DeleteTowerButton towerId={t.id} towerName={t.name} />
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-gray-500 text-sm">No towers yet.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
