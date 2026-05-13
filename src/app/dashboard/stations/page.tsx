import { db } from "@/lib/db";
import { stations } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MapView } from "@/components/map/map-view";
import { DeleteStationButton } from "./delete-station-button";

/**
 * Stations Management Page (map + list, similar to Towers page)
 */
export default async function StationsPage() {
  const items = await db
    .select()
    .from(stations)
    .orderBy(desc(stations.createdAt));

  const stationsDTO = items.map((s) => ({
    id: s.id,
    name: s.name,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
  }));

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="pt-8 px-8">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2">Stations</h1>
          <p className="text-gray-600">Stations management area</p>
        </div>
        <div className="max-w-9xl mx-auto flex gap-4">
          {/* Map View - Left Side */}
          <div className="flex-1">
            {items.length > 0 && (
              <Card>
                <CardContent className="">
                  <div className="h-170 rounded-md overflow-hidden border">
                    <MapView
                      towers={[]}
                      drones={[]}
                      waypoints={[]}
                      stations={stationsDTO}
                      showWaypointToggle={false}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* List View - Right Side */}
          <div className="w-96">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Station List</CardTitle>
                <Link href="/dashboard/stations/new">
                  <Button size="sm">+ Add</Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-2 border rounded bg-white"
                    >
                      <div className="text-sm">
                        <div className="font-semibold">{t.name}</div>
                        <div className="text-gray-600">
                          Lat: {String(t.latitude)} <br /> Lon:{" "}
                          {String(t.longitude)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/stations/${t.id}/edit`}>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </Link>
                        <DeleteStationButton
                          stationId={t.id}
                          stationName={t.name}
                        />
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-gray-500 text-sm">No stations yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
