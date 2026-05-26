"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import TaskForm from "@/app/dashboard/tasks/new/task-form";

export default function TaskActionArea({
  initialDroneId,
  initialDroneName,
  onClose,
  showAdd,
  setShowAdd,
  addMode,
}: {
  initialDroneId?: number;
  initialDroneName?: string;
  onClose?: () => void;
  showAdd: boolean;
  // Parent may optionally accept a second param 'mode' when animating
  setShowAdd: (v: boolean, mode?: 'delivery' | 'patrol') => void;
  addMode?: 'delivery' | 'patrol';
}) {
  const [loadingReturn, setLoadingReturn] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [currentView, setCurrentView] = React.useState<'chooser' | 'form'>(showAdd ? 'form' : 'chooser');
  const exitTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (showAdd) {
      // opening: immediately switch to form so its open animation plays
      if (exitTimer.current) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setCurrentView('form');
      return;
    }

    // closing: wait for the animation to finish before swapping back to chooser
    if (currentView === 'form') {
      exitTimer.current = window.setTimeout(() => {
        setCurrentView('chooser');
        exitTimer.current = null;
      }, 200);
    } else {
      setCurrentView('chooser');
    }

    return () => {
      if (exitTimer.current) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
    };
  }, [showAdd]);

  const handleDelivery = () => setShowAdd(true, 'delivery');

  const handlePatrol = () => {
    // open the add form in patrol mode
    try {
      // If the parent setShowAdd accepts a second parameter (mode), pass 'patrol'
      // Note: we typed setShowAdd as simple setter; use a type hack to call with extra arg when available
      (setShowAdd as any)(true, 'patrol');
    } catch (e) {
      setShowAdd(true);
    }
  };

  const handleReturn = async () => {
    if (!initialDroneId) {
      setMessage("No drone selected");
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    if (!confirm(`Send drone ${initialDroneName ?? `#${initialDroneId}`} to nearest station?`)) return;
    setLoadingReturn(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Return to Nearby Station", category: "return", droneId: initialDroneId }),
      });
      const data = await res.json();
      if (data && data.ok) {
        setMessage("Return task created");
        setTimeout(() => {
          setMessage(null);
          try {
            // notify other parts of the app that tasks changed so lists can refresh
            if (typeof window !== "undefined") {
              try {
                window.dispatchEvent(
                  new CustomEvent("tasksUpdated", { detail: { droneId: initialDroneId } }),
                );
              } catch (e) {
                // ignore
              }

              try {
                // BroadcastChannel for other tabs
                if (typeof (globalThis as any).BroadcastChannel !== "undefined") {
                  const bc = new (globalThis as any).BroadcastChannel("altitude_tasks");
                  bc.postMessage({ droneId: initialDroneId });
                  bc.close();
                }
              } catch (e) {
                // ignore
              }

              try {
                // localStorage fallback for other tabs
                localStorage.setItem("tasksUpdated", JSON.stringify({ droneId: initialDroneId }));
              } catch (e) {
                // ignore
              }
            }
          } catch (err) {
            // ignore
          }

          if (onClose) onClose();
        }, 900);
      } else {
        setMessage(data?.error || "Failed to create return task");
      }
    } catch (err) {
      setMessage(String(err));
    } finally {
      setLoadingReturn(false);
    }
  };

  return (
    <div>
      {message && <div className="p-2 bg-yellow-100 text-yellow-800 rounded mb-3">{message}</div>}

      <div className="min-h-[160px]">
        {currentView === 'chooser' && (
          <div className={"transform transition-all duration-200 " + (showAdd ? "opacity-0 translate-y-2 pointer-events-none" : "opacity-100 translate-y-0") }>
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <Button className="flex-1" onClick={handleDelivery}>Delivery</Button>
                <Button className="flex-1" onClick={handlePatrol}>Patrol</Button>
                <Button className="flex-1" onClick={handleReturn} disabled={loadingReturn}>{loadingReturn ? 'Sending...' : 'Return to Station'}</Button>
              </div>
              <div className="text-sm text-gray-600">Choose an action to perform for this drone.</div>
            </div>
          </div>
        )}

        {currentView === 'form' && (
          <div className={"transform transition-all duration-200 " + (showAdd ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none") }>
            <TaskForm initialDroneId={initialDroneId} initialDroneName={initialDroneName} initialCategory={addMode ?? 'delivery'} onSuccess={() => { if (onClose) onClose(); }} />
          </div>
        )}
      </div>
    </div>
  );
}
