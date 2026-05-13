"use client";

import React from "react";
import TaskForm from "@/app/dashboard/tasks/new/task-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export default function TaskModal({
  initialDroneId,
  initialDroneName,
  onClose,
  onBack,
  task,
}: {
  initialDroneId?: number;
  initialDroneName?: string;
  onClose: () => void;
  onBack?: () => void;
  task?: any;
}) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const closeWithAnim = () => {
    setVisible(false);
    setTimeout(() => onClose(), 200);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 2147483647 }}
    >
      <div
        className="absolute inset-0 bg-black opacity-40"
        onClick={closeWithAnim}
        style={{ zIndex: 2147483646 }}
      />
      <div
        className={`transform transition-all duration-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        style={{ zIndex: 2147483648, width: "min(900px, 96%)" }}
      >
        <Card className="rounded-lg bg-white shadow-lg max-h-[90vh] overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    try {
                      // If a dedicated onBack handler was provided, call it (e.g. to return to task list modal)
                      if (onBack && typeof onBack === "function") {
                        onBack();
                        closeWithAnim();
                        return;
                      }

                      const w = window as any;
                      if (
                        initialDroneId &&
                        w.openTasksForDrone &&
                        typeof w.openTasksForDrone === "function"
                      ) {
                        // open the tasks list for this drone, then close this modal
                        w.openTasksForDrone(initialDroneId);
                        closeWithAnim();
                        return;
                      }
                    } catch (e) {
                      // ignore
                    }
                    // fallback: simply close the modal (do not navigate away)
                    closeWithAnim();
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle>{`${task ? "Edit Task" : "Create Task"}${initialDroneName ? ` for ${initialDroneName}` : ""}`}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent
            style={{ maxHeight: "calc(90vh - 120px)", overflowY: "auto" }}
          >
            <TaskForm
              initialDroneId={initialDroneId}
              initialDroneName={initialDroneName}
              initialTask={task}
              onSuccess={() => {
                closeWithAnim();
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
