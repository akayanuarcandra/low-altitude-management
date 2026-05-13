"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TaskForm({
  initialDroneId,
  initialDroneName,
  onSuccess,
}: {
  initialDroneId?: number;
  initialDroneName?: string;
  onSuccess?: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"delivery" | "patrol" | "return">("delivery");
  const [itemLat, setItemLat] = useState("");
  const [itemLon, setItemLon] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!title.trim()) { setMessage("Title required"); return; }

    const payload: any = { title: title.trim(), description: description.trim() || null, droneId: initialDroneId ?? null, category };
    if (category === "delivery") {
      const lat = parseFloat(itemLat);
      const lon = parseFloat(itemLon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) { setMessage("Provide valid delivery coordinates"); return; }
      payload.items = [{ name: title.trim(), quantity: 1, deliveryLatitude: lat, deliveryLongitude: lon }];
    }
    if (category === "patrol") {
      payload.patrolRadiusMeters = 80;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.ok) {
        setMessage("Task created");
        setTitle(""); setDescription(""); setItemLat(""); setItemLon("");
        if (onSuccess) onSuccess(data.id);
      } else {
        setMessage(data.error || "Failed to create task");
      }
    } catch (err: any) {
      setMessage(String(err));
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && <div className="p-2 bg-red-100 text-red-800 rounded">{message}</div>}
      <div>
        <label className="block text-sm">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm">Description</label>
        <textarea className="w-full border rounded p-2" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="mt-1 block w-full border rounded px-2 py-1">
          <option value="delivery">Delivery</option>
          <option value="patrol">Patrol</option>
          <option value="return">Return to nearest station</option>
        </select>
      </div>

      {category === 'delivery' && (
        <div>
          <label className="block text-sm">Delivery coordinates</label>
          <div className="flex gap-2 mt-1">
            <Input placeholder="lat" value={itemLat} onChange={(e) => setItemLat(e.target.value)} />
            <Input placeholder="lon" value={itemLon} onChange={(e) => setItemLon(e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Task'}</Button>
      </div>
    </form>
  );
}
