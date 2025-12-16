"use client";

import { deleteTower } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteTowerButton({ towerId, towerName }: { towerId: number; towerName: string }) {
  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete tower "${towerName}"? This action cannot be undone.`)) {
      await deleteTower(towerId);
    }
  };

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete}>
      Delete
    </Button>
  );
}
