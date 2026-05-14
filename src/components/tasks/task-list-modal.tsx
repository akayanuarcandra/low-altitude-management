"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TaskModal from "./task-modal";

export default function TaskListModal({
  droneId,
  droneName,
  onClose,
  onRunStarted,
}: {
  droneId: number;
  droneName?: string;
  onClose: () => void;
  onRunStarted: (started: Array<any>) => void;
}) {
  const [tasks, setTasks] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/for-drone?droneId=${droneId}`);
        const data = await res.json();
        if (mounted) {
          if (data.ok) {
            console.debug("TaskListModal: initial fetch", {
              droneId,
              tasks: data.tasks,
            });
            setTasks(data.tasks || []);
          } else {
            console.debug("TaskListModal: initial fetch error", {
              droneId,
              error: data.error,
            });
          }
        }
      } catch (err) {
        // ignore
        console.debug("TaskListModal: initial fetch exception", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [droneId]);

  // Listen for global task updates (created/edited/deleted) and refresh when relevant
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent)?.detail || {};
        const eventDroneId = detail?.droneId;
        console.debug("TaskListModal: tasksUpdated event received", { detail });
        // If event has no droneId or matches this modal's droneId, refresh
        if (eventDroneId == null || Number(eventDroneId) === Number(droneId)) {
          console.debug("TaskListModal: tasksUpdated handler will refresh", {
            eventDroneId,
            droneId,
          });
          (async () => {
            try {
              const res = await fetch(
                `/api/tasks/for-drone?droneId=${droneId}`,
              );
              const data = await res.json();
              console.debug("TaskListModal: refresh fetch", { droneId, data });
              if (data.ok) setTasks(data.tasks || []);
            } catch (err) {
              console.debug("TaskListModal: refresh fetch error", err);
            }
          })();
        }
      } catch (err) {
        // ignore
        console.debug("TaskListModal: tasksUpdated handler exception", err);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("tasksUpdated", handler as EventListener);

      // BroadcastChannel (cross-tab) listener
      let bc: any = null;
      try {
        if (typeof (globalThis as any).BroadcastChannel !== "undefined") {
          bc = new (globalThis as any).BroadcastChannel("altitude_tasks");
          bc.onmessage = (m: any) => {
            try {
              handler(
                new CustomEvent("tasksUpdated", { detail: m.data }) as Event,
              );
            } catch (err) {
              // ignore
            }
          };
        }
      } catch (err) {
        // ignore
      }

      // localStorage fallback (storage event fires in other tabs)
      const storageHandler = (e: StorageEvent) => {
        try {
          if (e.key === "tasksUpdated" && e.newValue) {
            const payload = JSON.parse(e.newValue);
            handler(
              new CustomEvent("tasksUpdated", { detail: payload }) as Event,
            );
          }
        } catch (err) {
          // ignore
        }
      };
      window.addEventListener("storage", storageHandler);

      return () => {
        window.removeEventListener("tasksUpdated", handler as EventListener);
        window.removeEventListener("storage", storageHandler);
        try {
          if (bc) bc.close();
        } catch {}
      };
    }
    return () => {};
  }, [droneId]);

  const closeWithAnim = () => {
    setVisible(false);
    setTimeout(() => onClose(), 200);
  };

  async function runAll() {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/run-for-drone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ droneId }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.debug("TaskListModal: runAll response not JSON", jsonErr);
        try {
          const text = await res.text();
          console.debug("TaskListModal: runAll response text:", text);
        } catch (e) {
          console.debug("TaskListModal: runAll response text read failed", e);
        }
        throw new Error("Invalid JSON response from server");
      }

      if (data && data.ok) {
        console.debug("TaskListModal: runAll response", data);
        const started = data.started || [];

        // If started tasks exist but some have no items, show a helpful message
        const tasksWithNoItems: Array<{ taskId: number; title?: string }> = [];
        for (const s of started) {
          try {
            const task = s.task || {};
            const items = Array.isArray(s.items) ? s.items : [];
            if (!items || items.length === 0) {
              tasksWithNoItems.push({ taskId: Number(task.id), title: task.title });
            }
          } catch (err) {
            // ignore
          }
        }

        if (started.length === 0) {
          alert("No tasks were started for this drone. Ensure tasks are pending and assigned to this drone.");
        } else if (tasksWithNoItems.length > 0) {
          console.debug("TaskListModal: some started tasks have no items", tasksWithNoItems);
          const names = tasksWithNoItems
            .map((t) => (t.title ? `${t.title} (#${t.taskId})` : `#${t.taskId}`))
            .join(", ");
          alert(
            `Started ${started.length} task(s). However the following tasks had no delivery stops and the drone will not move: ${names}. ` +
              "Check that these tasks include a target (waypoint/station) or are created with category 'return'.",
          );
          // Still notify parent so client-side run handling can attempt to process any tasks that do have items
          onRunStarted(started);
          closeWithAnim();
        } else {
          onRunStarted(started);
          closeWithAnim();
        }
      } else {
        alert("Failed to start tasks: " + (data?.error || "unknown"));
      }
    } catch (err) {
      console.error("TaskListModal: runAll exception", err);
      alert("Error starting tasks: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 2147483647 }}
    >
      <div
        className="absolute inset-0 bg-black opacity-40"
        onClick={closeWithAnim}
      />
      <div
        className={`transform transition-all duration-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        style={{ zIndex: 2147483648, width: "min(720px, 96%)" }}
      >
        <Card
          className="overflow-hidden rounded-lg bg-white shadow-lg"
          style={{ zIndex: 2147483648 }}
        >
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle>Tasks for {droneName ?? `#${droneId}`}</CardTitle>
              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    try {
                      const w = window as any;
                      if (
                        w.openAddTaskForDrone &&
                        typeof w.openAddTaskForDrone === "function"
                      ) {
                        w.openAddTaskForDrone(droneId);
                        // keep the task list modal open so the add-task modal stacks above it
                        return;
                      }
                      window.open(
                        `/dashboard/tasks/new?droneId=${droneId}`,
                        "_blank",
                      );
                    } catch (e) {
                      window.location.href = `/dashboard/tasks/new?droneId=${droneId}`;
                    }
                  }}
                >
                  Add Task
                </Button>
              </div>
            </div>
          </CardHeader>
          <div className="space-y-3 px-4">
            {tasks.length === 0 && (
              <div className="text-sm text-gray-500">
                No pending tasks available for this drone.
              </div>
            )}
            {tasks.map((t: any) => (
              <div
                key={t.task.id}
                className="p-2 border rounded bg-gray-50 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{t.task.title}</div>
                  <div className="text-xs text-gray-600">
                    {t.task.description}
                  </div>
                  <div className="text-xs text-gray-600">
                    Items: {t.items.length}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        const id = Number(t.task.id);
                        if (Number.isNaN(id)) {
                          alert("Invalid task id");
                          return;
                        }
                        const res = await fetch(`/api/tasks/${id}`);
                        const data = await res.json();
                        if (data.ok) {
                          setEditingTask(data);
                          setShowEditModal(true);
                        } else {
                          alert("Failed to load task for editing");
                        }
                      } catch (err) {
                        console.error(err);
                        alert("Failed to load task for editing");
                      }
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      const id = Number(t.task.id);
                      if (Number.isNaN(id)) {
                        alert("Invalid task id");
                        return;
                      }
                      if (!confirm("Delete this task?")) return;
                      try {
                        console.debug(
                          "TaskListModal: deleting task (fallback)",
                          {
                            id,
                            droneId,
                          },
                        );

                        // Use the POST /api/tasks/delete fallback endpoint to avoid dynamic-route param parsing issues
                        const res = await fetch(`/api/tasks/delete`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ taskId: id }),
                        });
                        console.debug(
                          "TaskListModal: delete (fallback) response status",
                          res.status,
                        );
                        let data: any = null;
                        try {
                          data = await res.json();
                          console.debug(
                            "TaskListModal: delete (fallback) response body",
                            data,
                          );
                        } catch (e) {
                          console.debug(
                            "TaskListModal: delete (fallback) response not json",
                            e,
                          );
                        }

                        if (res.ok && data && data.ok) {
                          setTasks((p) =>
                            p.filter((x: any) => x.task.id !== id),
                          );

                          // notify other parts of the app
                          try {
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(
                                new CustomEvent("tasksUpdated", {
                                  detail: { taskId: id, droneId },
                                }),
                              );
                            }
                          } catch (err) {
                            // ignore
                          }
                        } else {
                          const errMsg =
                            (data && data.error) || `HTTP ${res.status}`;
                          console.debug(
                            "TaskListModal: delete (fallback) failed",
                            {
                              id,
                              resStatus: res.status,
                              errMsg,
                            },
                          );
                          alert("Failed to delete: " + errMsg);
                        }
                      } catch (err) {
                        console.error("TaskListModal: delete exception", err);
                        alert("Failed to delete: " + String(err));
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2 px-4">
            <Button onClick={runAll} disabled={loading || tasks.length === 0}>
              {loading ? "Starting..." : "Run All for This Drone"}
            </Button>
            <Button variant="ghost" onClick={closeWithAnim}>
              Cancel
            </Button>
          </div>
        </Card>
      </div>

      {showEditModal && editingTask && (
        <TaskModal
          initialDroneId={droneId}
          initialDroneName={droneName}
          task={editingTask}
          onClose={() => {
            setShowEditModal(false);
            setEditingTask(null);
            try {
              (async () => {
                const res = await fetch(
                  `/api/tasks/for-drone?droneId=${droneId}`,
                );
                const data = await res.json();
                if (data.ok) setTasks(data.tasks || []);
              })();
            } catch {}
          }}
          onBack={() => {
            // When back is requested from the create/edit modal, just close the edit modal to reveal the task list
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}
