import { db } from "@/lib/db";
import { waypoints } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { updateWaypoint } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function EditWaypointPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const waypointId = parseInt(id, 10);

  const [w] = await db.select().from(waypoints).where(eq(waypoints.id, waypointId));
  if (!w) {
    redirect("/dashboard/waypoints");
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Edit Waypoint: {w.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              "use server";
              const name = String(formData.get("name"));
              const latitude = parseFloat(String(formData.get("latitude")));
              const longitude = parseFloat(String(formData.get("longitude")));

              await updateWaypoint(waypointId, { name, latitude, longitude });
              redirect("/dashboard/waypoints");
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={w.name} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="latitude">Latitude</Label>
                <Input id="latitude" name="latitude" type="number" step="0.00000001" defaultValue={Number(w.latitude)} required />
              </div>
              <div>
                <Label htmlFor="longitude">Longitude</Label>
                <Input id="longitude" name="longitude" type="number" step="0.00000001" defaultValue={Number(w.longitude)} required />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit">Save Changes</Button>
              <Link href="/dashboard/waypoints">
                <Button type="button" variant="secondary">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
