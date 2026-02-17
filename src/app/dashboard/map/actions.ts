"use server";

import { db } from "@/lib/db";
import { drones, waypoints } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createWaypoint(formData: FormData) {
  const name = formData.get("name") as string;
  const latitude = parseFloat(formData.get("latitude") as string);
  const longitude = parseFloat(formData.get("longitude") as string);

  await db.insert(waypoints).values({ name, latitude, longitude });
  revalidatePath("/dashboard/map");
}

export async function updateDrone(
  id: number,
  data: {
    latitude?: number | null;
    longitude?: number | null;
    towerId?: number | null;
    status?: string;
  },
) {
  await db.update(drones).set(data).where(eq(drones.id, id));
  revalidatePath("/dashboard/map");
}
