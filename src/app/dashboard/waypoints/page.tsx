import { db } from "@/lib/db";
import { waypoints } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { createWaypoint, deleteWaypoint } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

/**
 * Waypoints Management Page
 * - Lists waypoints
 * - Form to create a new waypoint
 * - Delete existing waypoints
 */
export default async function WaypointsPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as any)?.role === "admin";
  if (!isAdmin) redirect("/login");

  const items = await db.select().from(waypoints).orderBy(desc(waypoints.createdAt));

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Waypoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create Waypoint */}
          <form action={createWaypoint} className="grid grid-cols-4 gap-2">
            <Input name="name" placeholder="Name" required className="col-span-2" />
            <Input name="latitude" type="number" step="0.00000001" placeholder="Latitude" required />
            <Input name="longitude" type="number" step="0.00000001" placeholder="Longitude" required />
            <div className="col-span-4">
              <Button type="submit">Add Waypoint</Button>
            </div>
          </form>

          {/* List */}
          <div className="space-y-2">
            {items.map((w) => (
              <div key={w.id} className="flex items-center justify-between p-2 border rounded bg-white">
                <div className="text-sm">
                  <div className="font-semibold">{w.name}</div>
                  <div className="text-gray-600">Lat: {String(w.latitude)} | Lon: {String(w.longitude)}</div>
                </div>
                <form action={async () => { "use server"; await deleteWaypoint(w.id); }}>
                  <Button variant="destructive" size="sm">Delete</Button>
                </form>
              </div>
            ))}
            {items.length === 0 && <p className="text-gray-500 text-sm">No waypoints yet. Create one above or on the map.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
