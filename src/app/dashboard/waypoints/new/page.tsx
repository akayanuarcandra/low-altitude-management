import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { createWaypoint } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function NewWaypointPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as any)?.role === "admin";
  if (!isAdmin) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-2xl h-fit">
        <CardHeader>
          <CardTitle>Create Waypoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form action={createWaypoint} className="grid grid-cols-4 gap-2">
            <Input name="name" placeholder="Name" required className="col-span-2" />
            <Input name="latitude" type="number" step="0.00000001" placeholder="Latitude" required />
            <Input name="longitude" type="number" step="0.00000001" placeholder="Longitude" required />
            <div className="col-span-4 flex gap-2">
              <Button type="submit">Create</Button>
              <Link href="/dashboard/waypoints"><Button type="button" variant="outline">Cancel</Button></Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
