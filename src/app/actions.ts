"use server";

import { db } from "@/lib/db";
import {
  tasks,
  towers,
  drones,
  waypoints,
  stations,
  taskItems,
  patrols,
} from "@/lib/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import computePatrolRoute from "@/lib/patrol-precomputer";
import OsrmRoutingEngine from "@/lib/osrm-engine";

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

  // Patrols are currently disabled: ignore category 'patrol' if present.

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
    // If caller explicitly requested a patrol category, precompute the route
    // before inserting the Task. This prevents creating an orphan Task when
    // precompute fails.
    if (body?.category === "patrol") {
      const radius = Number(body.radiusMeters ?? body.patrolRadiusMeters ?? 80);
      const duration = Number(body.durationSeconds ?? body.patrolDurationSeconds ?? 300);

      // determine start
      let startLat = body.startLat ?? null;
      let startLon = body.startLon ?? null;
      if ((!startLat || !startLon) && body?.droneId) {
        const [dr] = await db.select().from(drones).where(eq(drones.id, Number(body.droneId)));
        if (dr && dr.latitude && dr.longitude) {
          startLat = Number(dr.latitude);
          startLon = Number(dr.longitude);
        }
      }

      // fetch towers
      const towerRows = await db.select().from(towers);
      const towerList = (towerRows || []).map((t: any) => ({ latitude: Number(t.latitude), longitude: Number(t.longitude), rangeMeters: Number(t.rangeMeters) }));

      if (!startLat || !startLon) {
        return { ok: false, error: 'start location required for patrol' };
      }

      const center = { lat: Number(startLat), lon: Number(startLon) };
      // Force aerial-only computation for simple patrol (no OSRM/precomputed routes)
      // Use Dijkstra-based precomputer to build a road-following loop
      const { default: computePatrolRouteDijkstra } = await import("@/lib/patrol-dijkstra");
      const pre = await computePatrolRouteDijkstra(center, radius, duration, { anchors: 6, edgeThresholdMeters: 300, droneSpeed: 10 });
      if (!pre.ok) {
        return { ok: false, error: pre.error, diagnostics: pre.diagnostics };
      }

      // Precompute succeeded; insert the Task, then persist the Patrol row.
      console.log("createTaskWithItemsFromJSON: inserting task (patrol)", { body, insertData });
      const [res] = await db.insert(tasks).values(insertData).returning();
      const taskId = (res as any).id;

      try {
        const [patIns] = await db.insert(patrols).values({
          droneId: body?.droneId ?? null,
          radiusMeters: Number(radius),
          durationSeconds: Number(duration),
          status: 'precomputed',
          startLat: String(center.lat),
          startLon: String(center.lon),
          routeJson: JSON.stringify(pre.route),
          routeDistanceM: Math.round(pre.loopDistance ?? 0),
          routeDurationS: Math.round(pre.loopDuration ?? 0),
        } as any).returning();
        const patrolId = (patIns as any)?.id ?? null;

        // Patrol route persisted in patrols.routeJson. We intentionally do not
        // create TaskItems for patrol tasks — the runner will execute patrols
        // by following the stored routeJson directly.
      } catch (e) {
        console.error('failed to persist patrol', e);
      }

      revalidatePath('/dashboard/map');
      revalidatePath('/dashboard/tasks');
      return { ok: true, taskId, patrolPrecomputed: true };
    }

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
    // Defensive fallback: create a return-to-nearest-station TaskItem when caller
    // explicitly requested a return OR provided a droneId but no items. Exclude
    // patrol tasks so they are not misclassified as returns.
    if (
      body?.category === "return" ||
      ((Array.isArray(items) && items.length === 0) && body?.droneId)
    ) {
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
          name: null,
          deliveryLatitude: String((nearest as any).latitude),
          deliveryLongitude: String((nearest as any).longitude),
          quantity: body?.quantity ? Number(body.quantity) : 1,
          sequence: 0,
        } as any)
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
    // First, prepare itemsToInsert with resolved coordinates (and create waypoints when needed).
    const itemsToInsert: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
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

      itemsToInsert.push({
        originalIndex: i,
        taskId,
        itemId: itemId ?? null,
        name: it?.name ?? null,
        deliveryLatitude: finalLat,
        deliveryLongitude: finalLon,
        quantity: qty,
        sequence: seqVal,
      });
    }

    // If a drone is assigned, attempt to compute an OSRM-optimized visit order starting from the drone.
    let optimizedOrder: number[] | null = null; // array of indices in itemsToInsert in visit order
    try {
      if (body?.droneId !== undefined && body?.droneId !== null && itemsToInsert.length > 0) {
        // Resolve drone start location
        const droneId = Number(body.droneId);
        const [dr] = await db.select().from(drones).where(eq(drones.id, droneId));
        if (dr && dr.latitude && dr.longitude) {
          const start = { lat: Number(dr.latitude), lon: Number(dr.longitude) };

          // Build stops list - require that all items have valid coordinates
          const stops: any[] = [];
          let coordsMissing = false;
          for (const it of itemsToInsert) {
            const la = it.deliveryLatitude;
            const lo = it.deliveryLongitude;
            if (!la || !lo) {
              coordsMissing = true;
              break;
            }
            const latn = Number(la);
            const lonn = Number(lo);
            if (Number.isNaN(latn) || Number.isNaN(lonn)) {
              coordsMissing = true;
              break;
            }
            stops.push({ lat: latn, lon: lonn });
          }

          if (!coordsMissing) {
            const engine = new OsrmRoutingEngine();
            const res = await engine.computeOptimizedRoute(start, stops, {} as any);
            if (res && Array.isArray((res as any).waypointOrder) && (res as any).waypointOrder.length > 0) {
              // waypointOrder refers to indices in [start, ...stops]
              const wpOrd: number[] = (res as any).waypointOrder;
              optimizedOrder = wpOrd.filter((n) => n > 0).map((n) => n - 1);
            }
          }
        }
      }
    } catch (e) {
      // ignore OSRM failures and fall back to local optimizer below
      console.warn('osrm optimization failed, falling back', e);
    }

    // Fallback: if OSRM didn't produce an order, and drone is present, run local TSP/heuristic
    if (!optimizedOrder && body?.droneId !== undefined && body?.droneId !== null && itemsToInsert.length > 0) {
      // Recompute start
      const droneId = Number(body.droneId);
      const [dr] = await db.select().from(drones).where(eq(drones.id, droneId));
      if (dr && dr.latitude && dr.longitude) {
        const startLat = Number(dr.latitude);
        const startLon = Number(dr.longitude);

        // build numeric coords array
        const pts = itemsToInsert.map((it) => ({ lat: Number(it.deliveryLatitude), lon: Number(it.deliveryLongitude) }));
        const N = pts.length;
        const haversineMeters = (
          lat1: number,
          lon1: number,
          lat2: number,
          lon2: number,
        ) => {
          const R = 6371000; // meters
          const toRad = (d: number) => (d * Math.PI) / 180;
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

        if (N <= 8) {
          // Use OSRM distance matrix + exact TSP over that metric
          try {
            const { osrmTable } = await import("@/lib/osrm");
            const tableRes = await osrmTable([ { lat: startLat, lon: startLon }, ...pts ]);
            const mat = tableRes.distances; // (N+1) x (N+1)
            if (Array.isArray(mat) && mat.length === N + 1) {
              const indices = Array.from({ length: N }, (_, i) => i + 1); // indices in mat for stops
              // permutation generator
              const permute = (arr: number[]): number[][] => {
                const res: number[][] = [];
                const backtrack = (curr: number[], remaining: number[]) => {
                  if (remaining.length === 0) {
                    res.push(curr.slice());
                    return;
                  }
                  for (let i = 0; i < remaining.length; i++) {
                    const next = remaining[i];
                    curr.push(next);
                    backtrack(curr, remaining.slice(0, i).concat(remaining.slice(i + 1)));
                    curr.pop();
                  }
                };
                backtrack([], arr);
                return res;
              };

              const perms = permute(indices);
              let best: number[] | null = null;
              let bestDist = Infinity;
              for (const p of perms) {
                let d = 0;
                let cur = 0; // start index in matrix
                for (const idx of p) {
                  const dd = mat[cur] && Array.isArray(mat[cur]) ? mat[cur][idx] : null;
                  if (dd === null || dd === undefined || Number.isNaN(dd)) {
                    d = Infinity; // unreachable
                    break;
                  }
                  d += dd;
                  cur = idx;
                }
                if (d < bestDist) {
                  bestDist = d;
                  // convert back to 0-based stops indices
                  best = p.map((v) => v - 1);
                }
              }
              if (best) optimizedOrder = best;
            }
          } catch (e) {
            // fallback to previous haversine exact TSP if OSRM table fails
            console.warn('osrm table exact TSP failed, falling back', e);
            const permute = (arr: number[]): number[][] => {
              const res: number[][] = [];
              const backtrack = (curr: number[], remaining: number[]) => {
                if (remaining.length === 0) {
                  res.push(curr.slice());
                  return;
                }
                for (let i = 0; i < remaining.length; i++) {
                  const next = remaining[i];
                  curr.push(next);
                  backtrack(curr, remaining.slice(0, i).concat(remaining.slice(i + 1)));
                  curr.pop();
                }
              };
              backtrack([], arr);
              return res;
            };

            const indices = Array.from({ length: N }, (_, i) => i);
            const perms = permute(indices);
            let best: number[] | null = null;
            let bestDist = Infinity;
            for (const p of perms) {
              let d = 0;
              let curLat = startLat;
              let curLon = startLon;
              for (const idx of p) {
                d += haversineMeters(curLat, curLon, pts[idx].lat, pts[idx].lon);
                curLat = pts[idx].lat;
                curLon = pts[idx].lon;
              }
              if (d < bestDist) {
                bestDist = d;
                best = p.slice();
              }
            }
            if (best) optimizedOrder = best;
          }
        } else {
          // For larger N use OSRM table-driven nearest neighbor heuristic (fallback to haversine)
          try {
            const { osrmTable } = await import("@/lib/osrm");
            const tableRes = await osrmTable([ { lat: startLat, lon: startLon }, ...pts ]);
            const mat = tableRes.distances; // (N+1)x(N+1)
            if (Array.isArray(mat) && mat.length === N + 1) {
              const unvisited = new Set<number>(Array.from({ length: N }, (_, i) => i));
              const order: number[] = [];
              let cur = 0; // matrix index
              while (unvisited.size > 0) {
                let bestIdx: number | null = null;
                let bestD = Infinity;
                for (const idx of Array.from(unvisited)) {
                  const matIdx = idx + 1;
                  const d = mat[cur] && Array.isArray(mat[cur]) ? mat[cur][matIdx] : null;
                  if (d === null || d === undefined || Number.isNaN(d)) continue;
                  if (d < bestD) {
                    bestD = d;
                    bestIdx = idx;
                  }
                }
                if (bestIdx === null) break;
                order.push(bestIdx);
                unvisited.delete(bestIdx);
                cur = bestIdx + 1;
              }
              optimizedOrder = order;
            }
          } catch (e) {
            // fallback to haversine greedy
            const unvisited = new Set<number>(Array.from({ length: N }, (_, i) => i));
            const order: number[] = [];
            let curLat = startLat;
            let curLon = startLon;
            while (unvisited.size > 0) {
              let bestIdx: number | null = null;
              let bestD = Infinity;
              for (const idx of Array.from(unvisited)) {
                const d = haversineMeters(curLat, curLon, pts[idx].lat, pts[idx].lon);
                if (d < bestD) {
                  bestD = d;
                  bestIdx = idx;
                }
              }
              if (bestIdx === null) break;
              order.push(bestIdx);
              unvisited.delete(bestIdx);
              curLat = pts[bestIdx].lat;
              curLon = pts[bestIdx].lon;
            }
            optimizedOrder = order;
          }
        }
      }
    }

    // Apply ordering (if present) and assign sequence numbers; otherwise preserve provided seq or insertion order
    let finalInsertList = itemsToInsert.slice();
    if (Array.isArray(optimizedOrder) && optimizedOrder.length === itemsToInsert.length) {
      finalInsertList = optimizedOrder.map((idx, seq) => ({
        taskId: itemsToInsert[idx].taskId,
        itemId: itemsToInsert[idx].itemId,
        name: itemsToInsert[idx].name,
        deliveryLatitude: itemsToInsert[idx].deliveryLatitude,
        deliveryLongitude: itemsToInsert[idx].deliveryLongitude,
        quantity: itemsToInsert[idx].quantity,
        sequence: seq,
      }));
    } else {
      // Preserve original order but set sequence to requested seq or index
      finalInsertList = itemsToInsert.map((it, idx) => ({
        taskId: it.taskId,
        itemId: it.itemId,
        name: it.name,
        deliveryLatitude: it.deliveryLatitude,
        deliveryLongitude: it.deliveryLongitude,
        quantity: it.quantity,
        sequence: idx,
      }));
    }

    // Insert all task items in one batch
    if (finalInsertList.length > 0) {
      await db.insert(taskItems).values(finalInsertList as any);
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
