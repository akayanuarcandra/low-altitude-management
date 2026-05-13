"use client";

import { deleteStation } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteStationButton({ stationId, stationName }: { stationId: number; stationName: string }) {
  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete station "${stationName}"? This action cannot be undone.`)) {
      await deleteStation(stationId);
    }
  };

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete}>
      Delete
    </Button>
  );
}
