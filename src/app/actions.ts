"use server"

import { db } from "@/lib/db"
import { tasks, towers, drones, waypoints } from "@/lib/schema";
import { eq } from "drizzle-orm";
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

  await db.insert(towers).values({ name, latitude, longitude, rangeMeters, active });
  revalidatePath("/dashboard/towers");
}

export async function updateTower(id: number, data: {
  name?: string;
  latitude?: number;
  longitude?: number;
  rangeMeters?: number;
  active?: boolean;
}) {
  await db.update(towers).set(data).where(eq(towers.id, id));
  revalidatePath("/dashboard/towers");
}

export async function deleteTower(id: number) {
  await db.delete(towers).where(eq(towers.id, id));
  revalidatePath("/dashboard/towers");
}

// Drone CRUD with range validation
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function createDrone(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const latitudeRaw = formData.get("latitude");
  const longitudeRaw = formData.get("longitude");
  const towerIdRaw = formData.get("towerId");
  const status = ((formData.get("status") as string) || "active").trim();

  if (!name) {
    console.error("createDrone: name is required");
    return;
  }

  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);
  const towerId = Number(towerIdRaw);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    console.error("createDrone: invalid coordinates", { latitude, longitude });
    return;
  }

  if (!towerIdRaw || towerIdRaw === "" || Number.isNaN(towerId) || towerId <= 0) {
    console.error("createDrone: invalid towerId", { towerIdRaw, towerId });
    return;
  }

  const [tower] = await db.select().from(towers).where(eq(towers.id, towerId)).limit(1);
  if (!tower) {
    console.error("createDrone: tower not found", { towerId });
    return;
  }

  // Validate that the drone is initially within tower range
  const dist = haversineMeters(latitude, longitude, Number(tower.latitude), Number(tower.longitude));
  if (dist > Number(tower.rangeMeters)) {
    console.error("createDrone: drone out of range", { dist, range: tower.rangeMeters });
    return;
  }

  await db.insert(drones).values({ name, latitude, longitude, towerId, status });
  revalidatePath("/dashboard/drones");
}

export async function updateDrone(id: number, data: {
  name?: string;
  latitude?: number;
  longitude?: number;
  towerId?: number;
  status?: string;
}) {
  // If moving or switching tower, enforce range
  const [current] = await db.select().from(drones).where(eq(drones.id, id)).limit(1);
  if (!current) return;

  const newLat = data.latitude ?? Number(current.latitude);
  const newLon = data.longitude ?? Number(current.longitude);
  const newTowerId = data.towerId ?? Number(current.towerId);

  const [tower] = await db.select().from(towers).where(eq(towers.id, newTowerId)).limit(1);
  if (!tower) return;

  const dist = haversineMeters(newLat, newLon, Number(tower.latitude), Number(tower.longitude));
  if (dist > Number(tower.rangeMeters)) return;

  await db.update(drones).set(data).where(eq(drones.id, id));
  revalidatePath("/dashboard/drones");
}

export async function deleteDrone(id: number) {
  await db.delete(drones).where(eq(drones.id, id));
  revalidatePath("/dashboard/drones");
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

  await db.insert(waypoints).values({ name, latitude, longitude });
  revalidatePath("/dashboard/map");
}

export async function deleteWaypoint(id: number) {
  await db.delete(waypoints).where(eq(waypoints.id, id));
  revalidatePath("/dashboard/map");
}