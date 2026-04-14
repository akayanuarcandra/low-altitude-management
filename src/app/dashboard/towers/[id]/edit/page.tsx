import { db } from "@/lib/db";
import { towers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { updateTower } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function EditTowerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const towerId = parseInt(id, 10);

  const [tower] = await db.select().from(towers).where(eq(towers.id, towerId));
  if (!tower) {
    redirect("/dashboard/towers");
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Edit Tower: {tower.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              "use server";
              const name = String(formData.get("name"));
              const latitude = parseFloat(String(formData.get("latitude")));
              const longitude = parseFloat(String(formData.get("longitude")));
              const rangeMeters = parseInt(String(formData.get("rangeMeters")), 10);
              const active = String(formData.get("active")) === "on";

              await updateTower(towerId, { name, latitude, longitude, rangeMeters, active });
              redirect("/dashboard/towers");
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={tower.name} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="latitude">Latitude</Label>
                <Input id="latitude" name="latitude" type="number" step="0.00000001" defaultValue={Number(tower.latitude)} required />
              </div>
              <div>
                <Label htmlFor="longitude">Longitude</Label>
                <Input id="longitude" name="longitude" type="number" step="0.00000001" defaultValue={Number(tower.longitude)} required />
              </div>
            </div>

            <div>
              <Label htmlFor="rangeMeters">Range (m)</Label>
              <Input id="rangeMeters" name="rangeMeters" type="number" defaultValue={Number(tower.rangeMeters)} required />
            </div>

            <div className="flex items-center gap-2">
              <input id="active" name="active" type="checkbox" defaultChecked={(tower as any).active ?? true} />
              <Label htmlFor="active">Active</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit">Save Changes</Button>
              <Link href="/dashboard/towers">
                <Button type="button" variant="secondary">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
