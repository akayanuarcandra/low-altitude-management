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
  const [category, setCategory] = useState<"delivery" | "return">(
    "delivery",
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Waypoints list for selecting existing waypoint as delivery destination
  const [waypoints, setWaypoints] = useState<
    Array<{ id: number; name: string; latitude: number; longitude: number }>
  >([]);
  const [selectedWaypointId, setSelectedWaypointId] = useState<number | null>(
    null,
  );
  // Task-level quantity (displayed below description)
  const [quantity, setQuantity] = useState<number>(1);
  // patrol removed: keep patrolRadius state unused to preserve DB values if present
  const [patrolRadiusMeters, setPatrolRadiusMeters] = useState<number>(80);

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
        setQuantity(Number(t.quantity) || 1);
        if (t?.patrolRadiusMeters !== undefined && t?.patrolRadiusMeters !== null) {
          const n = Number(t.patrolRadiusMeters);
          if (!Number.isNaN(n)) setPatrolRadiusMeters(n);
        }
        if (Array.isArray(initialTask.items) && initialTask.items.length > 0) {
          setCategory("delivery");
          const it = initialTask.items[0];
          if (it && it.itemId) setSelectedWaypointId(Number(it.itemId));
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

  // Auto-fill title with selected waypoint name when title is empty
  useEffect(() => {
    try {
      if (selectedWaypointId && title.trim() === "") {
        const wp = waypoints.find((w) => w.id === selectedWaypointId);
        if (wp && wp.name) setTitle(wp.name);
      }
    } catch {
      // ignore
    }
  }, [selectedWaypointId, waypoints, title]);

  // When the category is set to 'return', auto-fill the title and clear other fields.
  useEffect(() => {
    try {
      if (category === "return") {
        setTitle("Return to Nearby Station");
        setDescription("");
        setQuantity(1);
        setSelectedWaypointId(null);
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

    // include quantity only for delivery tasks (patrol/return don't use it)
    if (category === "delivery") payload.quantity = Number(quantity) || 1;

    if (category === "delivery") {
      if (!selectedWaypointId) {
        setMessage("Please select a waypoint");
        return;
      }
      payload.items = [
        {
          waypointId: selectedWaypointId,
          quantity: Number(quantity) || 1,
          seq: 0,
          assignedDroneId: initialDroneId ?? null,
        },
      ];
    }
    // patrol removed: don't include patrolRadiusMeters in payload

    try {
      setLoading(true);

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
          setSelectedWaypointId(null);
          setQuantity(1);
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
          setMessage(data.error || "Failed to create task");
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

          <div>
            <label className="block text-sm">Quantity</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value || "1"))}
              className="mt-1 block w-full border rounded px-2 py-1"
            />
          </div>

          <div className="mt-2">
            <label className="block text-sm">Target</label>
            <select
              value={selectedWaypointId ?? ""}
              onChange={(e) =>
                setSelectedWaypointId(
                  e.target.value ? parseInt(e.target.value) : null,
                )
              }
              className="mt-1 block w-full border rounded px-2 py-1"
            >
              <option value="">Select a waypoint...</option>
              {waypoints.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.latitude.toFixed(6)}, {w.longitude.toFixed(6)}
                </option>
              ))}
            </select>
          </div>
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
