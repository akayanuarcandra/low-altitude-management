import "./globals.css";
import { ConditionalHeader } from "@/components/conditional-header";
import { AuthProvider } from "@/components/auth-provider";

export const metadata = {
  title: "Altitude Management",
  description: "Task management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        <AuthProvider>
          <ConditionalHeader />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}