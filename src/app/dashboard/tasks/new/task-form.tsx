"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TaskForm({
  initialDroneId,
  initialDroneName,
  onSuccess,
  initialTask,
}: {
  initialDroneId?: number;
  initialDroneName?: string;
  onSuccess?: (id: number) => void;
  initialTask?: any;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"delivery" | "return" | "patrol">(
    "delivery",
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Waypoints list for selecting existing waypoint as delivery destination
  const [waypoints, setWaypoints] = useState<
    Array<{ id: number; name: string; latitude: number; longitude: number }>
  >([]);
  
  // Items array for delivery tasks: { name, waypointId, quantity }
  const [items, setItems] = useState<Array<{ name?: string; waypointId?: number | null; quantity: number }>>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemWaypointId, setItemWaypointId] = useState<number | null>(null);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  // patrol state (kept for compatibility but unused — UI no longer exposes patrol)
  const [patrolRadiusMeters, setPatrolRadiusMeters] = useState<number>(80);
  const [patrolDurationSeconds, setPatrolDurationSeconds] = useState<number>(300);

  // Whether this form is editing an existing task
  const isEditing = Boolean(
    initialTask && initialTask.task && initialTask.task.id,
  );

  // Prefill from initialTask when editing
  useEffect(() => {
    try {
        if (initialTask && initialTask.task) {
          const t = initialTask.task;
          setTitle(t.title || "");
          setDescription(t.description || "");
          // task-level quantity removed; items carry their own quantities
          if (t?.patrolRadiusMeters !== undefined && t?.patrolRadiusMeters !== null) {
            const n = Number(t.patrolRadiusMeters);
            if (!Number.isNaN(n)) setPatrolRadiusMeters(n);
          }
          if (t?.patrolDurationSeconds !== undefined && t?.patrolDurationSeconds !== null) {
            const n2 = Number(t.patrolDurationSeconds);
            if (!Number.isNaN(n2)) setPatrolDurationSeconds(n2);
          }
          if (Array.isArray(initialTask.items) && initialTask.items.length > 0) {
            setCategory("delivery");
            // Prefill items list when editing
            const pref = initialTask.items.map((it: any) => ({
              name: it?.name ?? undefined,
              waypointId: it?.itemId ?? null,
              quantity: Number(it?.quantity) || 1,
            }));
            setItems(pref);
          }
        }
    } catch {
      // ignore
    }
  }, [initialTask]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/waypoints");
        const data = await res.json();
        if (mounted && data.ok) setWaypoints(data.waypoints || []);
      } catch (err) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // No task-level target; items now carry targets.

  // When the category is set to 'return', auto-fill the title and clear other fields.
  useEffect(() => {
    try {
        if (category === "return") {
        setTitle("Return to Nearby Station");
        setDescription("");
      }
    if (category === "patrol") {
      // Although patrol category is no longer selectable in the UI, preserve
      // this defensive branch in case legacy code sets the category value.
      if (title.trim() === "") setTitle("Patrol Area");
    }
    } catch {
      // ignore
    }
  }, [category]);

  // Patrol category removed - no special handling required here

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (category !== "return" && !title.trim()) {
      setMessage("Title required");
      return;
    }

    const payload: any = {
      // For return tasks we force a standard title; otherwise use provided title
      title: category === "return" ? "Return to Nearby Station" : title.trim(),
      // description only relevant for delivery tasks
      description: category === "delivery" ? description.trim() || null : null,
      droneId: initialDroneId ?? null,
      category,
    };

    // include patrol fields when creating a patrol
    if (category === "patrol") {
      payload.radiusMeters = Number(patrolRadiusMeters);
      payload.durationSeconds = Number(patrolDurationSeconds);
    }

    // Items carry their own quantities; do not include any task-level quantity

    if (category === "delivery") {
      // If items were added via the items UI, use them. Otherwise fall back to single selectedWaypointId.
      if (items.length > 0) {
        payload.items = items.map((it, idx) => ({
          waypointId: it.waypointId ?? undefined,
          name: it.name ?? undefined,
          latitude: undefined,
          longitude: undefined,
          quantity: Number(it.quantity) || 1,
          seq: idx,
          assignedDroneId: initialDroneId ?? null,
        }));
      } else {
        setMessage("Please add at least one item for delivery tasks");
        return;
      }
    }
    // Patrol creation is disabled; the frontend no longer exposes patrol fields.

    try {
      setLoading(true);

      // Client-side coverage check: ask server whether any item is outside tower coverage.
      // If so, present the error and let user fix the form.
      if (category === "delivery") {
        try {
          const covRes = await fetch("/api/coverage/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: payload.items || [] }),
          });
          const covJson = await covRes.json();
          if (!covJson.ok) {
            setMessage(covJson.error || "One or more items are outside coverage");
            setLoading(false);
            return;
          }
        } catch (err) {
          // if coverage check fails unexpectedly, allow creation to proceed but log
          console.warn('coverage check failed', err);
        }
      }

      if (isEditing) {
        const taskId = Number(initialTask.task.id);
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          if (!onSuccess) setMessage("Task updated");
          if (onSuccess) onSuccess(taskId);

          // Notify other parts of the app that tasks have changed so UI can refresh
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("tasksUpdated", {
                  detail: { taskId, droneId: payload.droneId ?? null },
                }),
              );

              try {
                if (
                  typeof (globalThis as any).BroadcastChannel !== "undefined"
                ) {
                  const bc = new (globalThis as any).BroadcastChannel(
                    "altitude_tasks",
                  );
                  bc.postMessage({ taskId, droneId: payload.droneId ?? null });
                  bc.close();
                } else {
                  localStorage.setItem(
                    "tasksUpdated",
                    JSON.stringify({
                      taskId,
                      droneId: payload.droneId ?? null,
                      ts: Date.now(),
                    }),
                  );
                }
              } catch (err) {
                // ignore
              }
            }
          } catch (err) {
            // ignore
          }
        } else {
          setMessage(data.error || "Failed to update task");
        }
      } else {
        // client-side validation for patrol
        if (category === "patrol") {
          if (Number.isNaN(payload.radiusMeters) || payload.radiusMeters < 30 || payload.radiusMeters > 2000) {
            setMessage("Radius must be between 30 and 2000 meters");
            setLoading(false);
            return;
          }
          if (Number.isNaN(payload.durationSeconds) || payload.durationSeconds < 30 || payload.durationSeconds > 7200) {
            setMessage("Duration must be between 30 and 7200 seconds");
            setLoading(false);
            return;
          }
          if (!initialDroneId) {
            setMessage("Please select a drone with a known position or provide start coordinates");
            setLoading(false);
            return;
          }
        }
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          // If a parent provided an onSuccess handler (e.g. modal or parent card),
          // rely on it to handle closing/notifications and do not show the "Task created" message here.
          if (!onSuccess) setMessage("Task created");
          setTitle("");
          setDescription("");
          setItems([]);
          setPatrolRadiusMeters(80);
          const createdId = (data as any).taskId ?? (data as any).id ?? null;
          if (onSuccess) onSuccess(createdId);

          // Notify other parts of the app that tasks have changed so UI can refresh
          try {
            if (typeof window !== "undefined") {
              // in-page listeners
              window.dispatchEvent(
                new CustomEvent("tasksUpdated", {
                  detail: {
                    taskId: createdId,
                    droneId: payload.droneId ?? null,
                  },
                }),
              );

              // cross-tab: prefer BroadcastChannel when available
              try {
                if (
                  typeof (globalThis as any).BroadcastChannel !== "undefined"
                ) {
                  const bc = new (globalThis as any).BroadcastChannel(
                    "altitude_tasks",
                  );
                  bc.postMessage({
                    taskId: createdId,
                    droneId: payload.droneId ?? null,
                  });
                  bc.close();
                } else {
                  // fallback: use localStorage to trigger storage events in other tabs
                  localStorage.setItem(
                    "tasksUpdated",
                    JSON.stringify({
                      taskId: createdId,
                      droneId: payload.droneId ?? null,
                      ts: Date.now(),
                    }),
                  );
                }
              } catch (err) {
                // ignore cross-tab notification errors
              }
            }
          } catch (err) {
            // ignore
          }
        } else {
          // Surface server error or diagnostics when patrol precompute fails
          const errMsg = data.error || (data.diagnostics ? JSON.stringify(data.diagnostics) : "Failed to create task");
          setMessage(errMsg);
        }
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && (
        <div className="p-2 bg-red-100 text-red-800 rounded">{message}</div>
      )}

      <div>
        <label className="block text-sm">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as any)}
          className="mt-1 block w-full border rounded px-2 py-1"
        >
          <option value="delivery">Delivery</option>
          <option value="return">Return to nearest station</option>
          <option value="patrol">Patrol area</option>
        </select>
      </div>

      {category === "delivery" && (
        <>
          <div>
            <label className="block text-sm">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm">Description</label>
            <textarea
              className="w-full border rounded p-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Task-level quantity removed; items carry their own quantities */}

          {/* Task-level global target removed: items carry their own targets now. */}

          {/* Items list and add-item form */}
          <div className="mt-4">
            <label className="block text-sm">Items</label>
            <div className="mt-2 space-y-2">
              {items.length === 0 && (
                <div className="text-sm text-gray-500">No items added — you can add one below or select a target to create a single item.</div>
              )}
              {items.map((it, idx) => {
                const wp = waypoints.find((w) => w.id === it.waypointId);
                return (
                  <div key={idx} className="flex items-center justify-between border rounded p-2">
                    <div>
                      <div className="font-medium">{it.name ?? (wp ? wp.name : "Unnamed item")}</div>
                      <div className="text-xs text-gray-500">{wp ? `${wp.name} — ${wp.latitude.toFixed(6)}, ${wp.longitude.toFixed(6)}` : "Custom coordinates"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm">Qty: {it.quantity}</div>
                      <button type="button" className="text-sm text-red-600" onClick={() => setItems(items.filter((_, i) => i !== idx))}>Remove</button>
                    </div>
                  </div>
                );
              })}

              {showAddItem ? (
                <div className="border rounded p-3 space-y-2">
                  <div>
                    <label className="block text-sm">Item name</label>
                    <input className="mt-1 block w-full border rounded px-2 py-1" value={itemName} onChange={(e) => setItemName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm">Target waypoint</label>
                    <select value={itemWaypointId ?? ""} onChange={(e) => setItemWaypointId(e.target.value ? parseInt(e.target.value) : null)} className="mt-1 block w-full border rounded px-2 py-1">
                      <option value="">Select a waypoint...</option>
                      {waypoints.map((w) => (
                        <option key={w.id} value={w.id}>{w.name} — {w.latitude.toFixed(6)}, {w.longitude.toFixed(6)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm">Quantity</label>
                    <input type="number" min={1} value={itemQuantity} onChange={(e) => setItemQuantity(parseInt(e.target.value || "1"))} className="mt-1 block w-full border rounded px-2 py-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => {
                      // add item
                      setItems([...items, { name: itemName || undefined, waypointId: itemWaypointId ?? null, quantity: Number(itemQuantity) || 1 }]);
                      // reset
                      setItemName(""); setItemWaypointId(null); setItemQuantity(1); setShowAddItem(false);
                    }}>Add Item</Button>
                    <Button type="button" variant="ghost" onClick={() => { setShowAddItem(false); setItemName(""); setItemWaypointId(null); setItemQuantity(1); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Button type="button" onClick={() => setShowAddItem(true)}>Add Item</Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {category === "patrol" && (
        <>
          <div>
            <label className="block text-sm">Radius (meters)</label>
            <input
              type="number"
              min={30}
              max={2000}
              value={patrolRadiusMeters}
              onChange={(e) => setPatrolRadiusMeters(Number(e.target.value || 80))}
              className="mt-1 block w-full border rounded px-2 py-1"
            />
            <p className="text-xs text-gray-500">Max 2000m</p>
          </div>

          <div>
            <label className="block text-sm">Duration (seconds)</label>
            <input
              type="number"
              min={30}
              max={7200}
              value={patrolDurationSeconds}
              onChange={(e) => setPatrolDurationSeconds(Number(e.target.value || 300))}
              className="mt-1 block w-full border rounded px-2 py-1"
            />
            <p className="text-xs text-gray-500">Max 7200s</p>
          </div>

          {initialDroneId ? (
            <p className="text-xs text-gray-600">Using selected drone position as patrol center</p>
          ) : (
            <p className="text-xs text-red-600">No drone selected — please select drone or provide manual start coords</p>
          )}
        </>
      )}

      {/* Patrol category removed */}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? isEditing
              ? "Updating..."
              : "Creating..."
            : isEditing
              ? "Update Task"
              : "Create Task"}
        </Button>
      </div>
    </form>
  );
}
