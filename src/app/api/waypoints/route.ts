import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { waypoints } from "@/lib/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const items = await db.select().from(waypoints).orderBy(desc(waypoints.createdAt));
    const dto = items.map((w: any) => ({ id: w.id, name: w.name, latitude: Number(w.latitude), longitude: Number(w.longitude) }));
    return NextResponse.json({ ok: true, waypoints: dto });
  } catch (err) {
    console.error('/api/waypoints error', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
