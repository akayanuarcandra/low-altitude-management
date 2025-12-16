"use server"

import { db } from "@/lib/db"
import { tasks, towers, drones, waypoints } from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createTask(formData: FormData) {
  const title = (formData.get("title") as string)?.trim()
  const description = (formData.get("description") as string | null)?.trim() || null
  const quantityRaw = formData.get("quantity") as string | null
  const quantity = quantityRaw ? parseInt(quantityRaw, 10) : null

  if (!title) return
  if (quantity !== null && (Number.isNaN(quantity) || quantity < 0)) return

  await db.insert(tasks).values({
    title,
    description,
    quantity: quantity ?? 1
  });
  revalidatePath("/");
}

export async function toggleTask(id: number, completed: boolean) {
  await db.update(tasks).set({completed}).where(eq(tasks.id, id)); //the updates works by matching the id
  revalidatePath("/");
}

export async function deleteTask(id: number) {
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/");
}

// Tower CRUD
export async function createTower(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  const rangeMeters = Number(formData.get("rangeMeters"));
  const activeRaw = formData.get("active") as string | null;
  const active = activeRaw ? activeRaw === "on" || activeRaw === "true" : true;

  if (!name) return;
  if ([latitude, longitude, rangeMeters].some((n) => Number.isNaN(n))) return;

  await db.insert(towers).values({ name, latitude: latitude.toString(), longitude: longitude.toString(), rangeMeters, active });
  revalidatePath("/dashboard/towers");
}

export async function updateTower(id: number, data: {
  name?: string;
  latitude?: number;
  longitude?: number;
  rangeMeters?: number;
  active?: boolean;
}) {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.latitude !== undefined) updateData.latitude = data.latitude.toString();
  if (data.longitude !== undefined) updateData.longitude = data.longitude.toString();
  if (data.rangeMeters !== undefined) updateData.rangeMeters = data.rangeMeters;
  if (data.active !== undefined) updateData.active = data.active;
  await db.update(towers).set(updateData).where(eq(towers.id, id));
  revalidatePath("/dashboard/towers");
}

export async function deleteTower(id: number) {
  await db.delete(towers).where(eq(towers.id, id));
  revalidatePath("/dashboard/towers");
}

// Drone CRUD
export async function createDrone(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();

  if (!name) {
    console.error("createDrone: name is required");
    return;
  }

  // Create drone in inventory (no location, no tower assignment)
  await db.insert(drones).values({ 
    name, 
    status: "inventory"
  });
  revalidatePath("/dashboard/drones");
}

export async function updateDrone(id: number, data: {
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  towerId?: number | null;
  status?: string;
}) {
  // Build update object, explicitly handling null values using SQL null
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.latitude !== undefined) {
    updateData.latitude = data.latitude === null ? sql`NULL` : data.latitude.toString();
  }
  if (data.longitude !== undefined) {
    updateData.longitude = data.longitude === null ? sql`NULL` : data.longitude.toString();
  }
  if (data.towerId !== undefined) {
    updateData.towerId = data.towerId === null ? sql`NULL` : data.towerId;
  }
  if (data.status !== undefined) updateData.status = data.status;
  
  await db.update(drones).set(updateData).where(eq(drones.id, id));
  revalidatePath("/dashboard/drones");
  revalidatePath("/dashboard/map");
}

export async function deleteDrone(id: number) {
  await db.delete(drones).where(eq(drones.id, id));
  revalidatePath("/dashboard/drones");
  revalidatePath("/dashboard/map");
}

// Waypoint CRUD
export async function createWaypoint(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const latitudeRaw = formData.get("latitude");
  const longitudeRaw = formData.get("longitude");

  if (!name) {
    console.error("createWaypoint: name is required");
    return;
  }

  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    console.error("createWaypoint: invalid coordinates", { latitude, longitude });
    return;
  }

  await db.insert(waypoints).values({ name, latitude: latitude.toString(), longitude: longitude.toString() });
  revalidatePath("/dashboard/map");
}

export async function deleteWaypoint(id: number) {
  await db.delete(waypoints).where(eq(waypoints.id, id));
  revalidatePath("/dashboard/map");
}

export async function updateWaypoint(id: number, data: {
  name?: string;
  latitude?: number;
  longitude?: number;
}) {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.latitude !== undefined) updateData.latitude = data.latitude.toString();
  if (data.longitude !== undefined) updateData.longitude = data.longitude.toString();
  await db.update(waypoints).set(updateData).where(eq(waypoints.id, id));
  revalidatePath("/dashboard/waypoints");
  revalidatePath("/dashboard/map");
}