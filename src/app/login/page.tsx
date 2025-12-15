"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronLeft } from "lucide-react";

/**
 * Login Page (client component)
 * Uses next-auth/react signIn to authenticate with the Credentials provider.
 */
export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex justify-center items-center">
      <Card className="w-full max-w-max h-fit">
        <CardContent className="flex gap-6">
          <div className="h-fit w-lg overflow-hidden rounded-md">
            <img src="/images/login.jpg" alt="Hi there!" />
          </div>
          <div className="flex flex-col justify-between">
            <a href="/" className="text-gray-400 flex">
              <ChevronLeft /> Back to Homepage
            </a>
            <div className="flex flex-col items-center gap-6">
              <div className="text-2xl font-bold">Login</div>
              <form
                className="space-y-3 w-96 px-8"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget as HTMLFormElement);
                  const email = formData.get("email") as string;
                  const password = formData.get("password") as string;
                  setError(null);
                  const res = await signIn("credentials", {
                    redirect: false,
                    email,
                    password,
                  });
                  if (res?.error) {
                    setError("Invalid credentials");
                    return;
                  }
                  router.push("/dashboard");
                }}
              >
                <Input name="email" type="email" placeholder="Email" required />
                <Input name="password" type="password" placeholder="Password" required />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full">
                  Sign In
                </Button>
              </form>
            </div>
            <div className="text-center text-gray-400 mt-24">
              Low Altitude Management System ;)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
