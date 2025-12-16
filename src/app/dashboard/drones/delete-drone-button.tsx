"use client";

import { deleteDrone } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteDroneButton({ droneId, droneName }: { droneId: number; droneName: string }) {
  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete drone "${droneName}"? This action cannot be undone.`)) {
      await deleteDrone(droneId);
    }
  };

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete}>
      Delete
    </Button>
  );
}
