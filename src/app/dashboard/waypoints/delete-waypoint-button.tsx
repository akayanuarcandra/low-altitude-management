"use client";

import { deleteWaypoint } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteWaypointButton({ waypointId, waypointName }: { waypointId: number; waypointName: string }) {
  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete waypoint "${waypointName}"? This action cannot be undone.`)) {
      await deleteWaypoint(waypointId);
    }
  };

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete}>
      Delete
    </Button>
  );
}
