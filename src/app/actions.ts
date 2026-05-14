"use server";

import { db } from "@/lib/db";
import {
  tasks,
  towers,
  drones,
  waypoints,
  stations,
  taskItems,
} from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createTask(formData: FormData) {
  // Normalize form input and delegate to createTaskWithItemsFromJSON so all
  // task creation flows share the same validation and fallback behavior.
  const title = (formData.get("title") as string)?.trim();
  const description =
    (formData.get("description") as string | null)?.trim() || null;
  const quantityRaw = formData.get("quantity") as string | null;
  const quantity = quantityRaw ? parseInt(quantityRaw, 10) : null;
  const itemsRaw = formData.get("items") as string | null;
  const droneIdRaw = formData.get("droneId") as string | null;

  const body: any = { title, description };
  if (quantity !== null && !(Number.isNaN(quantity))) body.quantity = quantity;
  if (itemsRaw) body.items = (() => {
    try {
      return JSON.parse(itemsRaw as string);
    } catch {
      return [];
    }
  })();
  if (droneIdRaw) {
    const n = Number(droneIdRaw);
    if (!Number.isNaN(n)) body.droneId = n;
  }

  // Delegate to the JSON handler which implements the defensive fallback
  // (auto-create return TaskItem when droneId present but no items).
  try {
    await createTaskWithItemsFromJSON(body);
  } catch (e) {
    // Best-effort: log and continue
    console.error("createTask: createTaskWithItemsFromJSON failed", e);
  }
  revalidatePath("/");
}

export async function toggleTask(id: number, completed: boolean) {
  // Map boolean completed to status text and set completedAt timestamp when completed
  const updateData: any = {};
  updateData.status = completed ? "completed" : "pending";
  if (completed) updateData.completedAt = new Date();
  else updateData.completedAt = null;
  await db.update(tasks).set(updateData).where(eq(tasks.id, id));
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

  await db.insert(towers).values({
    name,
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    rangeMeters,
    active,
  });
  revalidatePath("/dashboard/towers");
}

export async function updateTower(
  id: number,
  data: {
    name?: string;
    latitude?: number;
    longitude?: number;
    rangeMeters?: number;
    active?: boolean;
  },
) {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.latitude !== undefined)
    updateData.latitude = data.latitude.toString();
  if (data.longitude !== undefined)
    updateData.longitude = data.longitude.toString();
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
    status: "inventory",
  });
  revalidatePath("/dashboard/drones");
}

export async function updateDrone(
  id: number,
  data: {
    name?: string;
    latitude?: number | null;
    longitude?: number | null;
    towerId?: number | null;
    status?: string;
  },
  options: { skipRevalidate?: boolean } = {},
) {
  // Build update object, explicitly handling null values using SQL null
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.latitude !== undefined) {
    updateData.latitude =
      data.latitude === null ? sql`NULL` : data.latitude.toString();
  }
  if (data.longitude !== undefined) {
    updateData.longitude =
      data.longitude === null ? sql`NULL` : data.longitude.toString();
  }
  if (data.towerId !== undefined) {
    updateData.towerId = data.towerId === null ? sql`NULL` : data.towerId;
  }
  if (data.status !== undefined) updateData.status = data.status;

  await db.update(drones).set(updateData).where(eq(drones.id, id));

  // Only revalidate map/dashboard routes if not explicitly skipped.
  if (!options.skipRevalidate) {
    revalidatePath("/dashboard/drones");
    revalidatePath("/dashboard/map");
  }
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
    console.error("createWaypoint: invalid coordinates", {
      latitude,
      longitude,
    });
    return;
  }

  await db.insert(waypoints).values({
    name,
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });
  revalidatePath("/dashboard/map");
}

export async function deleteWaypoint(id: number) {
  await db.delete(waypoints).where(eq(waypoints.id, id));
  revalidatePath("/dashboard/map");
}

export async function updateWaypoint(
  id: number,
  data: {
    name?: string;
    latitude?: number;
    longitude?: number;
  },
) {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.latitude !== undefined)
    updateData.latitude = data.latitude.toString();
  if (data.longitude !== undefined)
    updateData.longitude = data.longitude.toString();
  await db.update(waypoints).set(updateData).where(eq(waypoints.id, id));
  revalidatePath("/dashboard/waypoints");
  revalidatePath("/dashboard/map");
}

// TaskItems CRUD & Task helpers
export async function createTaskWithItems(formData: FormData) {
  // keep for compatibility with direct server action callers (FormData)
  const title = (formData.get("title") as string)?.trim();
  const description =
    (formData.get("description") as string | null)?.trim() || null;
  const itemsRaw = formData.get("items") as string | null; // expect JSON stringified array
  const droneIdRaw = formData.get("droneId") as string | null;

  const body: any = { title, description };
  if (itemsRaw)
    body.items = (() => {
      try {
        return JSON.parse(itemsRaw as string);
      } catch {
        return [];
      }
    })();

  if (droneIdRaw) {
    const n = Number(droneIdRaw);
    if (!Number.isNaN(n)) body.droneId = n;
  }

  return createTaskWithItemsFromJSON(body);
}

export async function createTaskWithItemsFromJSON(body: any) {
  const title = (body?.title as string)?.trim();
  const description = (body?.description as string | null)?.trim() || null;
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!title) return { ok: false, message: "title required" };

  // Create task; include quantity if provided on body
  const insertData: any = { title, description };
  // Accept quantity as number or numeric string
  if (body?.quantity !== undefined) {
    const q = Number(body.quantity);
    if (!Number.isNaN(q)) insertData.quantity = q;
  }
  // If caller provided a droneId, assign the task to that drone
  if (body?.droneId !== undefined && body?.droneId !== null) {
    const n = Number(body.droneId);
    if (!Number.isNaN(n)) insertData.droneId = n;
  }

  try {
    console.log("createTaskWithItemsFromJSON: inserting task", {
      body,
      insertData,
    });
    const [res] = await db.insert(tasks).values(insertData).returning();
    const taskId = (res as any).id;

    // Special-case: "return" category -> create a single task item pointing to the
    // nearest station to the provided droneId. This requires droneId and the drone
    // to have a valid latitude/longitude. We follow Option A: require droneId.
    // Additionally: if the caller provided a droneId but did not supply any items,
    // automatically create a return-to-nearest-station TaskItem so the drone can be
    // instructed to move. This is a defensive fallback for UI callers that omit
    // the target.
    if (body?.category === "return" || ((Array.isArray(items) && items.length === 0) && body?.droneId)) {
      // Ensure droneId provided
      const droneId = body?.droneId !== undefined ? Number(body.droneId) : null;
      if (!droneId || Number.isNaN(droneId)) {
        return { ok: false, error: "droneId required for return tasks" };
      }

      // Fetch drone and validate position
      const [dr] = await db.select().from(drones).where(eq(drones.id, droneId));
      if (!dr || !dr.latitude || !dr.longitude) {
        return { ok: false, error: "drone must have a valid position for return tasks" };
      }

      // Fetch stations
      const stationsRows = await db.select().from(stations);
      if (!stationsRows || stationsRows.length === 0) {
        return { ok: false, error: "no stations available" };
      }

      // Small haversine helper (meters)
      const toRad = (d: number) => (d * Math.PI) / 180;
      const haversineMeters = (
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number,
      ) => {
        const R = 6371000; // meters
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const droneLat = Number(dr.latitude);
      const droneLon = Number(dr.longitude);
      let nearest: any = null;
      let bestDist = Infinity;
      for (const s of stationsRows) {
        const sLat = Number((s as any).latitude);
        const sLon = Number((s as any).longitude);
        if (Number.isNaN(sLat) || Number.isNaN(sLon)) continue;
        const d = haversineMeters(droneLat, droneLon, sLat, sLon);
        if (d < bestDist) {
          bestDist = d;
          nearest = s;
        }
      }

      if (!nearest) {
        console.error("createTaskWithItemsFromJSON: no valid stations found", {
          body,
        });
        return { ok: false, error: "no valid stations found" };
      }

      // Insert a single TaskItem pointing to nearest station (no itemId, use delivery coords)
      const insertRes = await db
        .insert(taskItems)
        .values({
          taskId,
          itemId: null,
          deliveryLatitude: String((nearest as any).latitude),
          deliveryLongitude: String((nearest as any).longitude),
          quantity: body?.quantity ? Number(body.quantity) : 1,
          sequence: 0,
        })
        .returning();

      console.debug("createTaskWithItemsFromJSON: inserted return task item (auto)", {
        taskId,
        nearest: { id: (nearest as any).id, latitude: (nearest as any).latitude, longitude: (nearest as any).longitude },
        insertRes,
      });

      revalidatePath("/dashboard/map");
      revalidatePath("/dashboard/tasks");
      return { ok: true, taskId };
    }

    // items: array of { waypointId?, name?, latitude?, longitude?, quantity?, seq?, assignedDroneId? }
    for (const it of items) {
      let itemId: number | null = null;
      if (it?.waypointId) itemId = Number(it.waypointId);
      if (!itemId && it?.latitude && it?.longitude) {
        const name = it.name || `Waypoint for task ${taskId}`;
        const [wp] = await db
          .insert(waypoints)
          .values({
            name,
            latitude: String(it.latitude),
            longitude: String(it.longitude),
          })
          .returning();
        itemId = (wp as any).id;
      }

      // Sanitize fields: convert empty strings to null and parse numeric values
      const latVal =
        it?.latitude === undefined ||
        it?.latitude === null ||
        it?.latitude === ""
          ? null
          : String(it.latitude);
      const lonVal =
        it?.longitude === undefined ||
        it?.longitude === null ||
        it?.longitude === ""
          ? null
          : String(it.longitude);
      const qty = (() => {
        if (
          it?.quantity === undefined ||
          it?.quantity === null ||
          it?.quantity === ""
        )
          return 1;
        const n = Number(it.quantity);
        return Number.isFinite(n) ? n : 1;
      })();
      const seqVal = (() => {
        if (it?.seq === undefined || it?.seq === null || it?.seq === "")
          return 0;
        const n = Number(it.seq);
        return Number.isFinite(n) ? n : 0;
      })();

      // Ensure deliveryLatitude/deliveryLongitude are set: if itemId (waypoint) exists and lat/lon not provided,
      // fetch from waypoint record.
      let finalLat = latVal;
      let finalLon = lonVal;
      if ((finalLat === null || finalLon === null) && itemId) {
        try {
          const [wpRow] = await db
            .select()
            .from(waypoints)
            .where(eq(waypoints.id, itemId));
          if (wpRow) {
            finalLat = String(wpRow.latitude);
            finalLon = String(wpRow.longitude);
          }
        } catch (e) {
          // ignore; we'll let DB validate non-null constraint if still missing
        }
      }

      await db.insert(taskItems).values({
        taskId,
        itemId: itemId ?? null,
        deliveryLatitude: finalLat,
        deliveryLongitude: finalLon,
        quantity: qty,
        sequence: seqVal,
      });
    }

    revalidatePath("/dashboard/map");
    revalidatePath("/dashboard/tasks");
    return { ok: true, taskId };
  } catch (err) {
    console.error("createTaskWithItemsFromJSON ERROR inserting task", {
      body,
      insertData,
      err,
    });
    return { ok: false, error: String(err) };
  }
}

export async function getTaskItems(taskId: number) {
  const rows = await db
    .select()
    .from(taskItems)
    .where(eq(taskItems.taskId, taskId));
  return rows;
}

export async function assignTaskItemToDrone(
  itemId: number,
  droneId: number | null,
) {
  // Not supported by current DB schema (no assigned_drone_id column on TaskItem)
  return { ok: false, error: "assign to drone not supported by DB schema" };
}

export async function updateTaskItemStatus(itemId: number, status: string) {
  // Not supported by current DB schema (no status column on TaskItem)
  return { ok: false, error: "per-item status not supported by DB schema" };
}

export async function deleteTaskWithItems(taskId: number) {
  // delete cascade should remove task items, but be explicit
  await db.delete(taskItems).where(eq(taskItems.taskId, taskId));
  await db.delete(tasks).where(eq(tasks.id, taskId));
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/map");
}

// Station CRUD (modeled after waypoints)
export async function createStation(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const latitudeRaw = formData.get("latitude");
  const longitudeRaw = formData.get("longitude");

  if (!name) {
    console.error("createStation: name is required");
    return;
  }

  const latitude = Number(latitudeRaw);
  const longitude = Number(longitudeRaw);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    console.error("createStation: invalid coordinates", {
      latitude,
      longitude,
    });
    return;
  }

  await db.insert(stations).values({
    name,
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });
  revalidatePath("/dashboard/map");
}

export async function deleteStation(id: number) {
  await db.delete(stations).where(eq(stations.id, id));
  revalidatePath("/dashboard/map");
}

export async function updateStation(
  id: number,
  data: {
    name?: string;
    latitude?: number;
    longitude?: number;
  },
) {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.latitude !== undefined)
    updateData.latitude = data.latitude.toString();
  if (data.longitude !== undefined)
    updateData.longitude = data.longitude.toString();
  await db.update(stations).set(updateData).where(eq(stations.id, id));
  revalidatePath("/dashboard/stations");
  revalidatePath("/dashboard/map");
}
