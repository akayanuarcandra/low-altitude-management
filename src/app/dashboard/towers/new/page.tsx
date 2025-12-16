import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { createTower } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import TowerLocationPicker from "@/components/map/tower-location-picker";
import { ActiveDropdown } from "@/components/ui/active-dropdown";
import { db } from "@/lib/db";
import { towers } from "@/lib/schema";
import { desc } from "drizzle-orm";

export default async function NewTowerPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as any)?.role === "admin";
  if (!isAdmin) redirect("/login");

  const existing = await db.select().from(towers).orderBy(desc(towers.createdAt));
  const towersDTO = existing.map((t) => ({
    name: t.name,
    latitude: Number(t.latitude),
    longitude: Number(t.longitude),
    rangeMeters: Number(t.rangeMeters),
    active: (t as any).active ?? true,
  }));

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-7xl h-fit">
        <CardHeader>
          <CardTitle>Create Tower</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form action={createTower} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Name</label>
                <Input name="name" placeholder="e.g., Tower 1" required />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Range (meters)</label>
                <Input name="rangeMeters" type="number" placeholder="e.g., 5000" required />
              </div>
              <div>
                <ActiveDropdown />
              </div>
            </div>
            <label className="text-sm font-medium text-gray-700">Location</label>
            <div className="grid grid-cols-2 mt-2 gap-2">
              <TowerLocationPicker towers={towersDTO} />
            </div>
            <div className="col-span-5 flex items-center gap-2">
              <Button type="submit">Create</Button>
              <Link href="/dashboard/towers"><Button type="button" variant="outline">Cancel</Button></Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
