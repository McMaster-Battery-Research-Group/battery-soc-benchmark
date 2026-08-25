import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe part of the Auth.js config (no Prisma import) — used by middleware.
 * The Credentials provider lives in auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.affiliation = user.affiliation;
        token.name = user.name;
      }
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.affiliation) token.affiliation = session.affiliation;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "USER" | "ADMIN";
      session.user.affiliation = token.affiliation as string;
      session.user.name = token.name as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
