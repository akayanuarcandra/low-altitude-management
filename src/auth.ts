import NextAuth, { type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Basic admin-only auth using static credentials (demo-only).
// Change these values to your desired admin login.
const ADMIN_EMAIL = "admin@altitude.local";
const ADMIN_PASSWORD = "admin123";

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        const isValid = creds.email === ADMIN_EMAIL && creds.password === ADMIN_PASSWORD;
        if (!isValid) return null;
        return { id: "admin", email: ADMIN_EMAIL, role: "admin" as const };
      },
    }),
  ],
  callbacks: {
    // Add role to the session so we can check it in middleware/components
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = (token as any).role || "user";
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        (token as any).role = (user as any).role ?? "user";
      }
      return token;
    },
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
};

const { handlers } = NextAuth(authOptions);
export { handlers };
