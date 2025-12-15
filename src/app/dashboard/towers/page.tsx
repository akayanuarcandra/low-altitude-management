import { db } from "@/lib/db";
import { towers } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { createTower, deleteTower } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Towers Management Page
 * - Lists towers
 * - Form to create a new tower
 * - Delete existing towers
 */
export default async function TowersPage() {
  const items = await db.select().from(towers).orderBy(desc(towers.createdAt));

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Towers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create Tower */}
          <form action={createTower} className="grid grid-cols-5 gap-2">
            <Input name="name" placeholder="Name" required className="col-span-2" />
            <Input name="latitude" type="number" step="0.00000001" placeholder="Latitude" required />
            <Input name="longitude" type="number" step="0.00000001" placeholder="Longitude" required />
            <Input name="rangeMeters" type="number" placeholder="Range (m)" required />
            <div className="col-span-5 flex items-center gap-2">
              <label className="text-sm text-gray-600 flex items-center gap-2">
                <input type="checkbox" name="active" defaultChecked /> Active
              </label>
              <Button type="submit">Add Tower</Button>
            </div>
          </form>

          {/* List */}
          <div className="space-y-2">
            {items.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2 border rounded bg-white">
                <div className="text-sm">
                  <div className="font-semibold">{t.name} {t.active ? "(active)" : "(inactive)"}</div>
                  <div className="text-gray-600">Lat: {String(t.latitude)} | Lon: {String(t.longitude)} | Range: {t.rangeMeters} m</div>
                </div>
                <form action={async () => { "use server"; await deleteTower(t.id); }}>
                  <Button variant="destructive" size="sm">Delete</Button>
                </form>
              </div>
            ))}
            {items.length === 0 && <p className="text-gray-500 text-sm">No towers yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
