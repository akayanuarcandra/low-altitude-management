"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

// Reusable app header with logo and primary nav links
const navLinks = [
  { href: "/", label: "Home" },
  { href: "/uav", label: "UAV" },
  { href: "/about", label: "About" },
];

/**
 * Header Component (client component)
 * 
 * Displays the app logo, navigation links, and admin session info.
 * If logged in as admin, shows a logout button.
 */
export function Header() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "admin";

  return (
    <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur shadow-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="text-base">Altitude</span>
        </Link>

        <nav className="flex items-center gap-3 text-sm font-medium text-gray-700">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded px-3 py-1 transition hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Admin Session & Logout */}
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <span className="text-xs text-gray-600">Admin</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Logout
              </Button>
            </>
          )}
          {status === "unauthenticated" && (
            <Link href="/login">
              <Button size="sm" variant="outline">
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
