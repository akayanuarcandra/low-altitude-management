"use client";

import React from "react";
import TaskForm from "@/app/dashboard/tasks/new/task-form";
import TaskActionArea from "./task-action-area";
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

  const [showAdd, setShowAdd] = React.useState(false);
  // controls the card open/closed state so we can animate the card between view switches
  const [cardOpen, setCardOpen] = React.useState(true);

  // ensure cardOpen follows modal visibility on mount/unmount
  React.useEffect(() => {
    setCardOpen(visible);
  }, [visible]);

  // wrapper that animates the card when switching between chooser and form
  const closeTimerRef = React.useRef<number | null>(null);
  const openTimerRef = React.useRef<number | null>(null);

  const [addMode, setAddMode] = React.useState<'delivery' | 'patrol'>('delivery');
  const animateSetShowAdd = (next: boolean, mode?: 'delivery' | 'patrol') => {
    if (next === showAdd && (!next || mode === undefined || mode === addMode)) return;
    // play card close animation
    setCardOpen(false);

    // after the card close animation, update the view (this starts the child exit animation)
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    closeTimerRef.current = window.setTimeout(() => {
      if (mode) setAddMode(mode);
      setShowAdd(next);

      // wait a little longer than the child's exit animation to avoid a flash
      if (openTimerRef.current) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      openTimerRef.current = window.setTimeout(() => {
        setCardOpen(true);
        openTimerRef.current = null;
      }, 260);

      closeTimerRef.current = null;
    }, 200);
  };

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (openTimerRef.current) {
        window.clearTimeout(openTimerRef.current);
      }
    };
  }, []);

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
          <Card className={`rounded-lg bg-white shadow-lg max-h-[90vh] overflow-hidden transform transition-all duration-200 ${cardOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    try {
                      // If the add view is active, use the chevron as a back button to exit it.
                      if (showAdd) {
                        // close with animation via animateSetShowAdd
                        animateSetShowAdd(false);
                        return;
                      }
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
            {/* New view: three-button action chooser */}
            <TaskActionArea
              initialDroneId={initialDroneId}
              initialDroneName={initialDroneName}
              onClose={closeWithAnim}
              showAdd={showAdd}
              setShowAdd={(v: boolean, mode?: 'delivery' | 'patrol') => animateSetShowAdd(v, mode)}
              addMode={addMode}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
