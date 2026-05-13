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
        if (mounted && data.ok) setTasks(data.tasks || []);
      } catch (err) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
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
      const data = await res.json();
      if (data.ok) {
        onRunStarted(data.started || []);
        closeWithAnim();
      } else {
        alert("Failed to start tasks: " + (data.error || "unknown"));
      }
    } catch (err) {
      console.error(err);
      alert("Error starting tasks");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 2147483647 }}>
      <div className="absolute inset-0 bg-black opacity-40" onClick={closeWithAnim} />
      <div className={`transform transition-all duration-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`} style={{ zIndex: 2147483648, width: "min(720px, 96%)" }}>
        <Card className="overflow-hidden rounded-lg bg-white shadow-lg" style={{ zIndex: 2147483648 }}>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle>Tasks for {droneName ?? `#${droneId}`}</CardTitle>
              <div>
                <Button variant="secondary" onClick={() => {
                  try {
                    const w = window as any;
                    if (w.openAddTaskForDrone && typeof w.openAddTaskForDrone === "function") {
                      w.openAddTaskForDrone(droneId);
                      closeWithAnim();
                      return;
                    }
                    window.open(`/dashboard/tasks/new?droneId=${droneId}`, "_blank");
                  } catch (e) {
                    window.location.href = `/dashboard/tasks/new?droneId=${droneId}`;
                  }
                }}>Add Task</Button>
              </div>
            </div>
          </CardHeader>
          <div className="space-y-3 px-4">
            {tasks.length === 0 && (<div className="text-sm text-gray-500">No pending tasks available for this drone.</div>)}
            {tasks.map((t: any) => (
              <div key={t.task.id} className="p-2 border rounded bg-gray-50 flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.task.title}</div>
                  <div className="text-xs text-gray-600">{t.task.description}</div>
                  <div className="text-xs text-gray-600">Items: {t.items.length}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={async () => {
                    try {
                      const id = Number(t.task.id);
                      if (Number.isNaN(id)) { alert('Invalid task id'); return; }
                      const res = await fetch(`/api/tasks/${id}`);
                      const data = await res.json();
                      if (data.ok) { setEditingTask(data); setShowEditModal(true); } else { alert('Failed to load task for editing'); }
                    } catch (err) { console.error(err); alert('Failed to load task for editing'); }
                  }}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    const id = Number(t.task.id);
                    if (Number.isNaN(id)) { alert('Invalid task id'); return; }
                    if (!confirm('Delete this task?')) return;
                    try {
                      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
                      const data = await res.json();
                      if (data.ok) setTasks((p) => p.filter((x:any) => x.task.id !== id)); else alert('Failed to delete');
                    } catch (err) { console.error(err); alert('Failed to delete'); }
                  }}>Delete</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2 px-4">
            <Button onClick={runAll} disabled={loading || tasks.length === 0}>{loading ? 'Starting...' : 'Run All for This Drone'}</Button>
            <Button variant="ghost" onClick={closeWithAnim}>Cancel</Button>
          </div>
        </Card>
      </div>

      {showEditModal && editingTask && (
        <TaskModal initialDroneId={droneId} initialDroneName={droneName} onClose={() => { setShowEditModal(false); setEditingTask(null); try { (async () => { const res = await fetch(`/api/tasks/for-drone?droneId=${droneId}`); const data = await res.json(); if (data.ok) setTasks(data.tasks || []); })(); } catch {} }} />
      )}
    </div>
  );
}
