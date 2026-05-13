import { db } from "@/lib/db";
import { stations } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DeleteStationButton } from "./delete-station-button";

/**
 * Stations Management Page
 */
export default async function StationsPage() {
  const items = await db.select().from(stations).orderBy(desc(stations.createdAt));

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Stations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Link href="/dashboard/stations/new">
              <Button>+ Create Station</Button>
            </Link>
          </div>

          {/* List */}
          <div className="space-y-2">
            {items.map((w) => (
              <div key={w.id} className="flex items-center justify-between p-2 border rounded bg-white">
                <div className="text-sm">
                  <div className="font-semibold">{w.name}</div>
                  <div className="text-gray-600">Lat: {String(w.latitude)} | Lon: {String(w.longitude)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/dashboard/stations/${w.id}/edit`}>
                    <Button variant="outline" size="sm">Edit</Button>
                  </Link>
                  <DeleteStationButton stationId={w.id} stationName={w.name} />
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="text-gray-500 text-sm">No stations yet. Create one above.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
