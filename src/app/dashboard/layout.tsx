import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side guard: only allow admin users
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as any)?.role === "admin";
  
  if (!isAdmin) {
    redirect("/login");
  }

  return (
    <div className="flex">
      <DashboardSidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
