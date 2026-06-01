import { db } from "@/lib/db";
import { tasks, drones } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

function formatDate(d?: string | Date | null) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString();
}

function formatDuration(start?: string | Date | null, end?: string | Date | null) {
  if (!start || !end) return "—";
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const sec = Math.max(0, Math.round((e.getTime() - s.getTime()) / 1000));
  const m = Math.floor(sec / 60);
  const sRem = sec % 60;
  return `${m}m ${sRem}s`;
}

export default async function FlightsPage() {
  // Select recent tasks and filter to those with a startedAt (flight history)
  const all = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  const rows = (all || []).filter((r: any) => r.startedAt !== null && r.startedAt !== undefined);

  // load drones to map names
  const droneRows = await db.select().from(drones);
  const droneMap = new Map<number, any>();
  for (const d of droneRows) droneMap.set(d.id, d);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Flight History</h1>
          <p className="text-gray-600 mt-1">Recent flights and runs for drones.</p>
        </div>

        <Card className="w-full">
          <CardContent className="p-4">
            {rows.length === 0 ? (
              <p className="text-gray-500">No flight history available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto border-collapse">
                  <thead>
                      <tr className="text-left text-sm text-gray-600 border-b">
                        <th className="py-2 px-3">ID</th>
                        <th className="py-2 px-3">Drone</th>
                        <th className="py-2 px-3">Title</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Started At</th>
                      </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr key={r.id} className="bg-white even:bg-gray-50">
                        <td className="py-2 px-3 align-top text-sm text-gray-700">{r.id}</td>
                        <td className="py-2 px-3 align-top text-sm text-gray-700">
                          {r.droneId ? droneMap.get(Number(r.droneId))?.name ?? `#${r.droneId}` : "—"}
                        </td>
                        <td className="py-2 px-3 align-top text-sm text-gray-700">{r.title}</td>
                        <td className="py-2 px-3 align-top text-sm text-gray-700">{r.status}</td>
                        <td className="py-2 px-3 align-top text-sm text-gray-700">{formatDate(r.startedAt)}</td>
                        {/* Removed completedAt, duration, qty columns */}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
