import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Protect /dashboard route: only allow if session exists and role === "admin"
export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isAdmin = token?.role === "admin";
  if (!isAdmin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
