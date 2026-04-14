"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Home, Drone, Radio, MapPin, Map, ChevronLeft } from "lucide-react";

const sidebarLinks = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/drones", label: "Drones", icon: Drone },
  { href: "/dashboard/towers", label: "Towers", icon: Radio },
  { href: "/dashboard/waypoints", label: "Waypoints", icon: MapPin },
  { href: "/dashboard/map", label: "Map View", icon: Map },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "bg-white border-r border-gray-200 min-h-screen sticky top-0 transition-all duration-300",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      <div className="p-6 flex items-center justify-between">
        {!isCollapsed && (
          <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          <ChevronLeft
            className={cn(
              "w-5 h-5 text-gray-600 transition-transform duration-300",
              isCollapsed && "rotate-180"
            )}
          />
        </button>
      </div>
      <nav className="space-y-1 px-3">
        {sidebarLinks.map((link) => {
          const Icon = link.icon;
          const isActive =
            pathname === link.href ||
            (link.href !== "/dashboard" && pathname.startsWith(link.href));

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              )}
              title={isCollapsed ? link.label : ""}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>{link.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
