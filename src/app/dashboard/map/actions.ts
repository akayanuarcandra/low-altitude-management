"use server";

import { db } from "@/lib/db";
import { drones, waypoints } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Insert waypoint.
 * Note: decimal/numeric columns in Postgres are represented as strings in Drizzle,
 * so convert numeric coordinates to strings before inserting.
 */
export async function createWaypoint(formData: FormData) {
  const name = formData.get("name") as string;
  const latitude = parseFloat(formData.get("latitude") as string);
  const longitude = parseFloat(formData.get("longitude") as string);

  await db
    .insert(waypoints)
    .values({
      name,
      latitude: latitude.toString(),
      longitude: longitude.toString(),
    });
  revalidatePath("/dashboard/map");
}

/**
 * Update drone.
 * Accept numbers or strings for latitude/longitude from callers (client code may pass numbers),
 * but convert them to the string format expected by the Drizzle schema before calling .set(...)
 */
export async function updateDrone(
  id: number,
  data: {
    name?: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
    towerId?: number | null;
    status?: string;
  },
) {
  // Prepare copy so we can convert numeric lat/lon to strings
  const prepared: {
    name?: string;
    latitude?: string | null;
    longitude?: string | null;
    towerId?: number | null;
    status?: string;
  } = { ...data } as any;

  if (
    prepared.latitude !== undefined &&
    prepared.latitude !== null &&
    typeof prepared.latitude === "number"
  ) {
    prepared.latitude = String(prepared.latitude);
  }
  if (
    prepared.longitude !== undefined &&
    prepared.longitude !== null &&
    typeof prepared.longitude === "number"
  ) {
    prepared.longitude = String(prepared.longitude);
  }

  await db.update(drones).set(prepared).where(eq(drones.id, id));
  revalidatePath("/dashboard/map");
}
