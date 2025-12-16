"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", onClickOutside);
    }
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur shadow-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img src="/icons/title.svg" alt="Altitude" className="h-6" />
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

        {/* Session Menu */}
        <div className="relative" ref={menuRef}>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="truncate max-w-[140px]">
                  {session?.user?.name || "Admin"}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 text-gray-500"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.187l3.71-3.957a.75.75 0 111.08 1.04l-4.24 4.52a.75.75 0 01-1.08 0l-4.24-4.52a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-44 overflow-hidden rounded-md border bg-white shadow-lg"
                >
                  <Link
                    href="/dashboard"
                    className="block px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <button
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut({ callbackUrl: "/" });
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
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
