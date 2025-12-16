"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";

export function ActiveDropdown() {
  const [selected, setSelected] = useState("Active");

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-gray-600">Status</label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="justify-start">
            {selected}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setSelected("Active")}>
            Active
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSelected("Inactive")}>
            Inactive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input 
        type="hidden" 
        name="active" 
        value={selected === "Active" ? "true" : "false"} 
      />
    </div>
  );
}
