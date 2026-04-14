"use client";

import { usePathname } from "next/navigation";
import { Header } from "./header";

/**
 * ConditionalHeader
 * Only shows the header on pages that aren't in the exclusion list.
 */
export function ConditionalHeader() {
  const pathname = usePathname();
  const hideHeaderPaths = ["/login"];
  
  if (hideHeaderPaths.includes(pathname)) {
    return null;
  }
  
  return <Header />;
}
