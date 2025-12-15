import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { db } from "@/lib/db";
import { drones, towers, waypoints } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapView } from "@/components/map/map-view";

export default async function MapPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as any)?.role === "admin";
  if (!isAdmin) redirect("/login");

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

  const dronesDTO = dronesList.map((d) => ({
    id: d.id,
    name: d.name,
    latitude: Number(d.latitude),
    longitude: Number(d.longitude),
    towerId: Number(d.towerId),
    status: (d as any).status ?? null,
  }));

  const waypointsDTO = waypointsList.map((w) => ({
    id: w.id,
    name: w.name,
    latitude: Number(w.latitude),
    longitude: Number(w.longitude),
  }));

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-5xl h-fit">
        <CardHeader>
          <CardTitle>Operations Map</CardTitle>
        </CardHeader>
        <CardContent>
          <MapView towers={towersDTO} drones={dronesDTO} waypoints={waypointsDTO} />
        </CardContent>
      </Card>
    </div>
  );
}
