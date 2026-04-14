import { createDrone } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default async function NewDronePage() {
  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center">
      <Card className="w-full max-w-md h-fit">
        <CardHeader>
          <CardTitle>Create Drone (Inventory)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form action={createDrone} className="space-y-4">
            <div>
              <Label htmlFor="name">Drone Name</Label>
              <Input 
                id="name"
                name="name" 
                placeholder="e.g., Drone-01" 
                required 
              />
            </div>

            <p className="text-sm text-gray-600">
              This drone will be added to your inventory. You can deploy it to the map later and assign it to a tower.
            </p>

            <div className="flex gap-2">
              <Button type="submit">Add to Inventory</Button>
              <Link href="/dashboard/drones">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
