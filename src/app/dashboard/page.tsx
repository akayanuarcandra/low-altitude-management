import { db } from "@/lib/db";
import { drones, towers, waypoints } from "@/lib/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Drone, Radio, MapPin, Map } from "lucide-react";

/**
 * Dashboard Overview Page
 * 
 * Displays statistics about drones, towers, and waypoints in the system.
 */
export default async function Dashboard() {
  // Fetch counts from database
  const allDrones = await db.select().from(drones);
  const allTowers = await db.select().from(towers);
  const allWaypoints = await db.select().from(waypoints);

  const stats = [
    {
      title: "Drones",
      count: allDrones.length,
      icon: Drone,
      description: `${allDrones.filter(d => d.status === "inventory").length} in inventory, ${allDrones.filter(d => d.latitude && d.longitude).length} deployed`,
      color: "bg-blue-500"
    },
    {
      title: "Towers",
      count: allTowers.length,
      icon: Radio,
      description: `${allTowers.filter(t => (t as any).active !== false).length} active`,
      color: "bg-purple-500"
    },
    {
      title: "Waypoints",
      count: allWaypoints.length,
      icon: MapPin,
      description: "Navigation points",
      color: "bg-green-500"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of your altitude management system</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {stat.title}
                  </CardTitle>
                  <div className={`${stat.color} p-2 rounded-lg`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.count}</div>
                  <p className="text-xs text-gray-600 mt-2">{stat.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <a 
                href="/dashboard/drones/new" 
                className="p-4 border rounded-lg hover:bg-gray-50 text-center transition"
              >
                <Drone className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                <div className="text-sm font-medium">Add Drone</div>
              </a>
              <a 
                href="/dashboard/towers/new" 
                className="p-4 border rounded-lg hover:bg-gray-50 text-center transition"
              >
                <Radio className="h-6 w-6 mx-auto mb-2 text-purple-500" />
                <div className="text-sm font-medium">Add Tower</div>
              </a>
              <a 
                href="/dashboard/map" 
                className="p-4 border rounded-lg hover:bg-gray-50 text-center transition"
              >
                <Map className="h-6 w-6 mx-auto mb-2 text-green-500" />
                <div className="text-sm font-medium">View Map</div>
              </a>
              <a 
                href="/dashboard/waypoints/new" 
                className="p-4 border rounded-lg hover:bg-gray-50 text-center transition"
              >
                <MapPin className="h-6 w-6 mx-auto mb-2 text-green-500" />
                <div className="text-sm font-medium">Add Waypoint</div>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
