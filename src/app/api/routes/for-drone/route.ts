import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { precomputedRoutes } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const droneIdParam = url.searchParams.get("droneId");
    const droneId = droneIdParam ? Number(droneIdParam) : null;
    if (!droneId) return NextResponse.json({ ok: false, error: "droneId required" }, { status: 400 });

    const rows = await db
      .select()
      .from(precomputedRoutes)
      .where(eq(precomputedRoutes.droneId, droneId))
      .orderBy(desc(precomputedRoutes.createdAt));

    if (!rows || rows.length === 0) return NextResponse.json({ ok: true, route: null });

    const r = rows[0];
    const route = r.routeJson ? JSON.parse(String(r.routeJson)) : null;
    const stops = r.stopsJson ? JSON.parse(String(r.stopsJson)) : null;
    const start = r.startLat && r.startLon ? { lat: Number(r.startLat), lon: Number(r.startLon) } : null;

    return NextResponse.json({ ok: true, route, stops, start, persisted: true });
  } catch (err) {
    console.error("/api/routes/for-drone error", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
