"use client";

import { SessionProvider } from "next-auth/react";
import React from "react";

/**
 * AuthProvider Component
 * 
 * Wraps the app with NextAuth's SessionProvider so useSession() works in client components.
 * Must be placed high in the component tree (typically in the root layout).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
